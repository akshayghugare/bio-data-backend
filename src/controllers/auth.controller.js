const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { signToken } = require('../utils/jwt');
const { success, created } = require('../utils/response');
const { buildAccess } = require('../middlewares/access.middleware');
const emailService = require('../services/email.service');

/** Wait time between "resend verification" requests. */
const RESEND_COOLDOWN_MS = 60 * 1000;

/** POST /api/auth/register — creates the account and emails a verification link. */
const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password, confirmPassword, gender, dateOfBirth } = req.body;

  const errors = {};
  if (!name?.trim()) errors.name = 'Name is required';
  if (!email?.trim()) errors.email = 'Email is required';
  if (!phone?.trim()) errors.phone = 'Phone number is required';
  if (!password) errors.password = 'Password is required';
  else if (password.length < 6) errors.password = 'Password must be at least 6 characters';
  if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
  if (!gender) errors.gender = 'Please select a gender';
  if (!dateOfBirth) errors.dateOfBirth = 'Date of birth is required';

  if (Object.keys(errors).length) throw ApiError.badRequest('Please check the highlighted fields', errors);

  const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { phone }] });
  if (existing) {
    const field = existing.email === email.toLowerCase() ? 'email' : 'phone';
    throw ApiError.conflict(`This ${field} is already registered`);
  }

  const user = new User({ name, email, phone, password, gender, dateOfBirth });
  const token = user.createEmailToken(env.mail.tokenExpiryHours);
  await user.save();

  await emailService.sendVerificationEmail({ to: user.email, name: user.name, token });

  // Registration never signs the user in — they must verify, then sign in.
  return created(
    res,
    { email: user.email, verificationRequired: true },
    `Account created. We have sent a verification link to ${user.email}.`
  );
});

/** POST /api/auth/verify-email — consumes the emailed token. */
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) throw ApiError.badRequest('Verification token is missing');

  const user = await User.findOne({
    emailTokenHash: User.hashEmailToken(token),
    emailTokenExpiresAt: { $gt: new Date() },
  }).select('+emailTokenHash +emailTokenExpiresAt');

  if (!user) {
    throw ApiError.badRequest('This verification link is invalid or has expired. Please request a new one.');
  }

  user.isEmailVerified = true;
  user.emailVerifiedAt = new Date();
  user.emailTokenHash = null;
  user.emailTokenExpiresAt = null;
  await user.save();

  await emailService.sendWelcomeEmail({ to: user.email, name: user.name });

  return success(res, {
    message: 'Email verified successfully. You can now sign in.',
    data: { email: user.email, isEmailVerified: true },
  });
});

/** POST /api/auth/resend-verification */
const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email?.trim()) throw ApiError.badRequest('Email is required', { email: 'Email is required' });

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
    '+emailTokenHash +emailTokenExpiresAt +emailSentAt'
  );

  // Always answer the same way so the endpoint cannot be used to discover
  // which addresses are registered.
  const genericMessage = 'If that account exists and is unverified, a new link has been sent.';

  if (!user || user.isEmailVerified) return success(res, { message: genericMessage });

  const elapsed = user.emailSentAt ? Date.now() - new Date(user.emailSentAt).getTime() : Infinity;
  if (elapsed < RESEND_COOLDOWN_MS) {
    throw new ApiError(429, `Please wait ${Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)} seconds before requesting another link.`);
  }

  const token = user.createEmailToken(env.mail.tokenExpiryHours);
  await user.save();

  await emailService.sendVerificationEmail({ to: user.email, name: user.name, token });

  return success(res, { message: genericMessage });
});

/** POST /api/auth/login — blocked until the email address is verified. */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const errors = {};
  if (!email?.trim()) errors.email = 'Email is required';
  if (!password) errors.password = 'Password is required';
  if (Object.keys(errors).length) throw ApiError.badRequest('Please check the highlighted fields', errors);

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Email or password is incorrect');
  }

  if (!user.isEmailVerified) {
    // 403 + this flag lets the login page offer a "resend link" button.
    throw ApiError.forbidden('Please verify your email address before signing in.', {
      emailNotVerified: true,
      email: user.email,
    });
  }

  user.lastLoginAt = new Date();
  await user.save();

  return success(res, {
    message: 'Signed in successfully',
    data: { token: signToken(user.id), user: user.toJSON(), access: buildAccess(user) },
  });
});

/** GET /api/auth/me — restores the session on refresh. */
const me = asyncHandler(async (req, res) =>
  success(res, { data: { user: req.user.toJSON(), access: buildAccess(req.user) } })
);

module.exports = { register, verifyEmail, resendVerification, login, me };
