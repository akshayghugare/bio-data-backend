const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * ── The one place the signup flow is decided ────────────────────────────────
 *
 *   register → login → complete profile → [ if PAYMENT_REQUIRED ] pay → dashboard
 *
 * `buildAccess()` is returned by /auth/login, /auth/me and /profile, so the
 * frontend never re-derives the rule — it just follows `nextStep`.
 */
function buildAccess(user) {
  const paymentRequired = env.paymentRequired;
  const isProfileComplete = Boolean(user.isProfileComplete);
  // With the toggle off, payment is treated as already satisfied for everyone.
  const paymentSatisfied = !paymentRequired || Boolean(user.isPaid);

  let nextStep = 'dashboard';
  if (!isProfileComplete) nextStep = 'complete-profile';
  else if (!paymentSatisfied) nextStep = 'payment';

  return {
    paymentRequired,
    isProfileComplete,
    isPaid: Boolean(user.isPaid),
    paymentSatisfied,
    canBrowse: isProfileComplete && paymentSatisfied,
    profileCompletion: typeof user.completionPercent === 'function' ? user.completionPercent() : 0,
    nextStep,
    redirectTo: { 'complete-profile': '/complete-profile', payment: '/payment', dashboard: '/dashboard' }[nextStep],
  };
}

/** Blocks member browsing until the profile (and payment, if on) is done. */
function requireAccess(req, res, next) {
  const access = buildAccess(req.user);
  req.access = access;

  if (!access.isProfileComplete) {
    return next(ApiError.forbidden('Please complete your profile to continue.'));
  }
  if (!access.paymentSatisfied) {
    return next(ApiError.paymentRequired('Please complete the membership payment to continue.'));
  }
  return next();
}

/** Payment routes need a finished profile but obviously not a payment. */
function requireCompleteProfile(req, res, next) {
  if (!req.user.isProfileComplete) {
    return next(ApiError.forbidden('Please complete your profile first.'));
  }
  return next();
}

module.exports = { buildAccess, requireAccess, requireCompleteProfile };
