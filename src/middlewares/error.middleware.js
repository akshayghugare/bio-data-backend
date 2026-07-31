const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/** 404 for anything the router did not match. */
function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

/** Terminal handler — the only place an error response is written. */
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Something went wrong';
  let errors = error.errors || null;

  // Mongoose validation → field-level errors the form can display inline.
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Please check the highlighted fields';
    errors = Object.values(error.errors).reduce((acc, item) => {
      acc[item.path] = item.message;
      return acc;
    }, {});
  }

  if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid identifier';
  }

  if (error.code === 11000) {
    statusCode = 409;
    const field = Object.keys(error.keyValue || {})[0] || 'field';
    message = `This ${field} is already registered`;
    errors = { [field]: message };
  }

  if (statusCode >= 500) {
    console.error('Server error:', error);
    if (env.isProduction) message = 'Something went wrong. Please try again.';
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors,
    ...(env.isProduction ? {} : { stack: error.stack }),
  });
}

module.exports = { notFound, errorHandler };
