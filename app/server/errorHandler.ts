import type { ErrorRequestHandler } from 'express'

// Sanitized catch-all: 4xx from body parsing keep their status; everything
// else logs server-side and returns a detail-free 500.
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err)
    return
  }
  const status =
    typeof err === 'object' && err !== null && 'status' in err &&
    typeof err.status === 'number' && err.status >= 400 && err.status < 500
      ? err.status
      : 500
  if (status === 500) console.error('unhandled error:', err)
  res.status(status).json(status === 500 ? { error: 'internal' } : { error: 'bad request' })
}
