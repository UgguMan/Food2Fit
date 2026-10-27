class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}
const asyncHandler = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res, next)).catch(next);
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again.';
  let details;
  if (error instanceof AppError) ({ status, code, message, details } = error);
  else if (error.code === 'DATABASE_UNAVAILABLE') {
    status = 503; code = error.code; message = 'Database is temporarily unavailable.';
  } else if (error.code === 'ORIGIN_NOT_ALLOWED') {
    status = 403; code = error.code; message = 'This origin is not allowed.';
  } else if (error.type === 'entity.parse.failed') {
    status = 400; code = 'INVALID_JSON'; message = 'Request body must be valid JSON.';
  } else if (error.type === 'entity.too.large' || error.code === 'LIMIT_FILE_SIZE') {
    status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body is too large.';
  } else if (error.code === 11000) {
    status = 409; code = 'CONFLICT'; message = 'A record with these details already exists.';
  } else if (['ValidationError', 'CastError', 'StrictModeError'].includes(error.name)) {
    status = 400; code = 'VALIDATION_ERROR'; message = 'One or more fields are invalid.';
  } else if (error.name === 'MulterError') {
    status = 400; code = 'INVALID_UPLOAD'; message = 'The upload is invalid.';
  }
  res.set('Cache-Control', 'no-store');
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}
module.exports = { AppError, asyncHandler, errorHandler };
