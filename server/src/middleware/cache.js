// Middleware to disable conditional and intermediate caching for sensitive and dynamic API routes
export function noCache(req, res, next) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  // Strip incoming conditional validation headers to avoid 304 Not Modified responses
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];

  next();
}
