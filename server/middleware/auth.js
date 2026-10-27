const User = require('../models/User');
const { verifyToken } = require('../services/tokens');
const { AppError, asyncHandler } = require('./errors');
module.exports = asyncHandler(async (req, res, next) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') || '');
  if (!match || match[1].length > 2048) throw new AppError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
  const payload = verifyToken(match[1]);
  const user = await User.findById(payload.sub).select('_id name email createdAt');
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Your session is invalid. Please sign in again.');
  req.user = user;
  next();
});
