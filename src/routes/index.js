const express = require('express');
const env = require('../config/env');
const { OPTIONS } = require('../models/User');
const { success } = require('../utils/response');

const authRoutes = require('./auth.routes');
const profileRoutes = require('./profile.routes');
const memberRoutes = require('./member.routes');
const paymentRoutes = require('./payment.routes');
const interestRoutes = require('./interest.routes');

const router = express.Router();

/** GET /api — service banner + the payment toggle the client reads on boot. */
router.get('/', (req, res) =>
  success(res, {
    data: {
      name: 'FindJodi API',
      version: '1.0.0',
      paymentRequired: env.paymentRequired,
    },
  })
);

/** GET /api/meta/options — dropdown values, so the client never hardcodes enums. */
router.get('/meta/options', (req, res) =>
  success(res, {
    data: {
      ...OPTIONS,
      THEME: ['light', 'dark', 'system'],
      LANGUAGE: ['en', 'hi', 'mr'],
      paymentRequired: env.paymentRequired,
      membershipAmount: env.membershipAmount,
      membershipCurrency: env.membershipCurrency,
      minGalleryPhotos: env.upload.minGalleryPhotos,
      maxGalleryPhotos: env.upload.maxGalleryPhotos,
      maxUploadSizeMb: env.upload.maxSizeMb,
    },
  })
);

router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/members', memberRoutes);
router.use('/payments', paymentRoutes);
router.use('/interests', interestRoutes);

module.exports = router;
