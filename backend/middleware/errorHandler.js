import mongoose from 'mongoose';

export function notFound(req, res) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} was not found.` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return;
  const statusCode = error.statusCode || (error instanceof mongoose.Error.ValidationError ? 400 : 500);
  const code = error.code || (error instanceof mongoose.Error.CastError ? 'INVALID_ID' : 'INTERNAL_ERROR');
  const message = statusCode >= 500 && process.env.NODE_ENV === 'production'
    ? 'An unexpected server error occurred.'
    : (error.message || 'An unexpected server error occurred.');
  res.status(statusCode).json({
    success: false,
    error: {
      code: typeof code === 'string' ? code : 'INTERNAL_ERROR',
      message,
      ...(error.details ? { details: error.details } : {})
    }
  });
}
