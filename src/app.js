const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

const app = express();

/* ── Security & parsing ───────────────────────────────────────────────── */
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: [env.clientUrl, 'http://localhost:5173', 'http://localhost:4173'],
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

if (!env.isProduction) app.use(morgan('dev'));

/* ── Global rate limit ────────────────────────────────────────────────── */
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please slow down.' },
  })
);

/* ── Uploaded photos ──────────────────────────────────────────────────── */
app.use(
  '/uploads',
  express.static(path.resolve(__dirname, '../uploads'), {
    maxAge: env.isProduction ? '30d' : 0,
    index: false,
    dotfiles: 'deny',
  })
);

/* ── Health ───────────────────────────────────────────────────────────── */
app.get('/health', (req, res) =>
  res.json({
    success: true,
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    paymentRequired: env.paymentRequired,
  })
);

/* ── API ──────────────────────────────────────────────────────────────── */
app.use('/api', routes);

/* ── Errors ───────────────────────────────────────────────────────────── */
app.use(notFound);
app.use(errorHandler);

module.exports = app;
