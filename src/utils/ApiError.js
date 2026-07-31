/** Operational error carrying an HTTP status and optional field errors. */
class ApiError extends Error {
  constructor(statusCode, message, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, errors) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Please sign in to continue.') {
    return new ApiError(401, message);
  }

  static paymentRequired(message = 'Membership payment is required.') {
    return new ApiError(402, message);
  }

  static forbidden(message = 'You do not have access to this resource.', errors) {
    return new ApiError(403, message, errors);
  }

  static notFound(message = 'Not found.') {
    return new ApiError(404, message);
  }

  static conflict(message) {
    return new ApiError(409, message);
  }
}

module.exports = ApiError;
