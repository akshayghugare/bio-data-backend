const express = require('express');
const {
  getConfig,
  createOrder,
  verifyPayment,
  markFailed,
  history,
} = require('../controllers/payment.controller');
const { protect } = require('../middlewares/auth.middleware');
const { requireCompleteProfile } = require('../middlewares/access.middleware');

const router = express.Router();

router.use(protect);

router.get('/config', getConfig);
router.get('/history', history);

// A member may only pay once their profile is complete.
router.post('/order', requireCompleteProfile, createOrder);
router.post('/verify', verifyPayment);
router.post('/failed', markFailed);

module.exports = router;
