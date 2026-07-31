const env = require('../config/env');
const Payment = require('../models/Payment');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { buildAccess } = require('../middlewares/access.middleware');
const razorpay = require('../services/razorpay.service');

/** GET /api/payments/config — what the checkout page needs before it renders. */
const getConfig = asyncHandler(async (req, res) =>
  success(res, {
    data: {
      paymentRequired: env.paymentRequired,
      amount: env.membershipAmount,
      currency: env.membershipCurrency,
      keyId: env.paymentRequired ? env.razorpay.keyId : '',
      isPaid: Boolean(req.user.isPaid),
    },
  })
);

/** POST /api/payments/order — create (or reuse) a Razorpay order. */
const createOrder = asyncHandler(async (req, res) => {
  if (!env.paymentRequired) {
    throw ApiError.badRequest('Payment is currently disabled on this platform');
  }
  if (req.user.isPaid) {
    throw ApiError.badRequest('Your membership is already active');
  }

  // Reuse a recent unpaid order so a refreshed checkout page does not pile up orders.
  const existing = await Payment.findOne({
    user: req.user._id,
    status: 'created',
    createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) },
  });

  if (existing) {
    return success(res, {
      message: 'Order ready',
      data: {
        orderId: existing.orderId,
        amount: existing.amount,
        currency: existing.currency,
        keyId: env.razorpay.keyId,
        user: { name: req.user.name, email: req.user.email, phone: req.user.phone },
      },
    });
  }

  const receipt = `rcpt_${Date.now()}_${String(req.user._id).slice(-6)}`;

  const order = await razorpay.createOrder({
    amount: env.membershipAmount,
    currency: env.membershipCurrency,
    receipt,
    notes: { userId: String(req.user._id), email: req.user.email },
  });

  await Payment.create({
    user: req.user._id,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    status: 'created',
  });

  return created(
    res,
    {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: env.razorpay.keyId,
      user: { name: req.user.name, email: req.user.email, phone: req.user.phone },
    },
    'Order created'
  );
});

/**
 * POST /api/payments/verify
 * Called by the browser after checkout succeeds. Idempotent: verifying an
 * already-paid order returns success instead of erroring.
 */
const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;

  if (!orderId || !paymentId || !signature) {
    throw ApiError.badRequest('Incomplete payment details received');
  }

  const payment = await Payment.findOne({ orderId, user: req.user._id });
  if (!payment) throw ApiError.notFound('Payment record not found');

  if (payment.status === 'paid') {
    const user = await User.findById(req.user._id);
    return success(res, {
      message: 'Payment already verified',
      data: { payment: payment.toJSON(), user: user.toJSON(), access: buildAccess(user) },
    });
  }

  if (!razorpay.verifySignature({ orderId, paymentId, signature })) {
    payment.status = 'failed';
    payment.failureReason = 'Signature verification failed';
    await payment.save();
    throw ApiError.badRequest('Payment verification failed. If money was debited it will be refunded automatically.');
  }

  payment.status = 'paid';
  payment.paymentId = paymentId;
  payment.signature = signature;
  payment.paidAt = new Date();
  await payment.save();

  const user = await User.findById(req.user._id);
  user.isPaid = true;
  user.paidAt = new Date();
  await user.save();

  return success(res, {
    message: 'Payment successful. Your membership is now active.',
    data: { payment: payment.toJSON(), user: user.toJSON(), access: buildAccess(user) },
  });
});

/** POST /api/payments/failed — record an abandoned or declined checkout. */
const markFailed = asyncHandler(async (req, res) => {
  const { razorpay_order_id: orderId, reason } = req.body;

  const payment = await Payment.findOne({ orderId, user: req.user._id });
  if (!payment) throw ApiError.notFound('Payment record not found');

  if (payment.status !== 'paid') {
    payment.status = 'failed';
    payment.failureReason = reason || 'Payment was not completed';
    await payment.save();
  }

  return success(res, { message: 'Payment status recorded', data: payment.toJSON() });
});

/** GET /api/payments/history */
const history = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
  return success(res, { message: 'Payment history loaded', data: payments });
});

module.exports = { getConfig, createOrder, verifyPayment, markFailed, history };
