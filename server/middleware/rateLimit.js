const { rateLimit } = require('express-rate-limit');
const MongoRateLimitStore = require('../services/MongoRateLimitStore');
const { AppError } = require('./errors');

const makeLimiter = (prefix, limit, windowMs, keyGenerator) => rateLimit({
  windowMs, limit, store: new MongoRateLimitStore(prefix),
  standardHeaders: 'draft-7', legacyHeaders: false, passOnStoreError: false,
  ...(keyGenerator ? { keyGenerator } : {}),
  handler(req, res, next) { next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again after the indicated delay.')); },
});
module.exports = {
  authLimiter: makeLimiter('auth-ip', 20, 15 * 60 * 1000),
  planLimiter: makeLimiter('plan-user', 5, 60 * 1000, req => String(req.user._id)),
  // All generation, refinement and image requests share both quotas.
  aiIpLimiter: makeLimiter('ai-ip', 5, 60 * 1000),
  aiUserLimiter: makeLimiter('ai-user', 5, 60 * 1000, req => String(req.user._id)),
};
