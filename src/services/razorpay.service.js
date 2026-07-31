const crypto = require('crypto');
const Razorpay = require('razorpay');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

let client = null;

function getClient() {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) {
    throw ApiError.badRequest('Payment gateway is not configured');
  }
  if (!client) {
    client = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
  }
  return client;
}

/** Creates an order. Funds settle to the bank account linked to this Razorpay account. */
async function createOrder({ amount, currency, receipt, notes }) {
  try {
    return await getClient().orders.create({ amount, currency, receipt, payment_capture: 1, notes });
  } catch (error) {
    const description = error?.error?.description || error.message || 'Could not create the payment order';
    throw new ApiError(502, description);
  }
}

/**
 * Verifies the checkout callback: HMAC-SHA256 of `order_id|payment_id`
 * keyed with the Razorpay secret must equal the signature Razorpay sent.
 */
function verifySignature({ orderId, paymentId, signature }) {
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ''));

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { createOrder, verifySignature };
