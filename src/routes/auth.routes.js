const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  register,
  verifyEmail,
  resendVerification,
  login,
  me,
} = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

/** Tight limiter on credential endpoints. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again later.' },
});

/** Even tighter on the endpoint that triggers an outbound email. */
const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many verification emails requested. Please try again later.' },
});

router.post('/register', authLimiter, register);
router.post('/verify-email', authLimiter, verifyEmail);
router.post('/resend-verification', emailLimiter, resendVerification);
router.post('/login', authLimiter, login);
router.get('/me', protect, me);

module.exports = router;
