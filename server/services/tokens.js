const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { AppError } = require('../middleware/errors');
const options = { algorithm: 'HS256', issuer: 'food2fit-api', audience: 'food2fit-client', expiresIn: '1h' };
function requireSecret() {
  if (!env.jwtSecret || Buffer.byteLength(env.jwtSecret) < 32) {
    throw new AppError(503, 'AUTH_UNAVAILABLE', 'Authentication is not configured.');
  }
  return env.jwtSecret;
}
function signToken(user) { return jwt.sign({}, requireSecret(), { ...options, subject: String(user._id) }); }
function verifyToken(token) {
  const secret = requireSecret();
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: options.issuer, audience: options.audience });
    if (typeof payload.sub !== 'string' || !/^[a-f0-9]{24}$/i.test(payload.sub) || !Number.isInteger(payload.exp)) throw new Error('Invalid claims');
    return payload;
  } catch { throw new AppError(401, 'UNAUTHORIZED', 'Your session is invalid or expired. Please sign in again.'); }
}
module.exports = { requireSecret, signToken, verifyToken };
