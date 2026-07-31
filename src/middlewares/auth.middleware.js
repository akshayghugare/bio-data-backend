const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../utils/jwt');

/** Requires a valid bearer token and puts the user on `req.user`. */
const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account not found.');

  req.user = user;
  return next();
});

module.exports = { protect };
