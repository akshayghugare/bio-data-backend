const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
};

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  mongoUri: process.env.MONGO_URI,

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  upload: {
    minGalleryPhotos: Number(process.env.MIN_GALLERY_PHOTOS) || 5,
    maxGalleryPhotos: Number(process.env.MAX_GALLERY_PHOTOS) || 10,
    maxSizeMb: Number(process.env.MAX_UPLOAD_SIZE_MB) || 5,
  },

  /**
   * Self health check. Defaults to the local port, which proves the process is
   * serving; set HEALTH_CHECK_URL to the public Render URL to also keep a free
   * instance awake.
   */
  healthCheck: {
    enabled: bool(process.env.HEALTH_CHECK_ENABLED, process.env.NODE_ENV === 'production'),
    url: process.env.HEALTH_CHECK_URL || `http://127.0.0.1:${Number(process.env.PORT) || 5000}`,
    schedule: process.env.HEALTH_CHECK_SCHEDULE || '*/10 * * * *',
  },

  /** The single switch that decides whether payment sits in the signup flow. */
  paymentRequired: bool(process.env.PAYMENT_REQUIRED, false),
  membershipAmount: Number(process.env.MEMBERSHIP_AMOUNT) || 49900,
  membershipCurrency: process.env.MEMBERSHIP_CURRENCY || 'INR',

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  },

  mail: {
    enabled: bool(process.env.MAIL_ENABLED, false),
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromName: process.env.MAIL_FROM_NAME || 'FindJodi',
    fromAddress: process.env.MAIL_FROM_ADDRESS || 'no-reply@findjodi.com',
    tokenExpiryHours: Number(process.env.EMAIL_TOKEN_EXPIRY_HOURS) || 24,
  },
};

/** Fail fast rather than starting half-configured. */
const required = { MONGO_URI: env.mongoUri, JWT_SECRET: env.jwtSecret };
const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length) {
  console.error(`\nMissing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill it in.\n');
  process.exit(1);
}

if (env.paymentRequired && (!env.razorpay.keyId || !env.razorpay.keySecret)) {
  console.error('\nPAYMENT_REQUIRED=true but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set.\n');
  process.exit(1);
}

if (env.mail.enabled && (!env.mail.host || !env.mail.user || !env.mail.pass)) {
  console.error('\nMAIL_ENABLED=true but SMTP_HOST / SMTP_USER / SMTP_PASS are not set.\n');
  process.exit(1);
}

module.exports = env;
