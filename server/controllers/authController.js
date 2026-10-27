const bcrypt = require('bcrypt');
const User = require('../models/User');
const { requireSecret, signToken } = require('../services/tokens');
const { AppError } = require('../middleware/errors');
const publicUser = user => ({ id: String(user._id), name: user.name, email: user.email, createdAt: user.createdAt });
const session = user => ({ user: publicUser(user), token: signToken(user), tokenType: 'Bearer', expiresIn: 3600 });
// Public dummy bcrypt digest (cost 12), used only for constant-cost failed login.
const dummyHash = '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';

async function register(req, res) {
  requireSecret();
  const { name, email, password } = req.validated;
  const passwordHash = await bcrypt.hash(password, 12);
  // The unique email index is the concurrency-safe duplicate guard.
  const user = await User.create({ name, email, passwordHash });
  res.status(201).json(session(user));
}
async function login(req, res) {
  requireSecret();
  const { email, password } = req.validated;
  const user = await User.findOne({ email }).select('+passwordHash');
  // Match bcrypt cost for missing accounts to reduce account timing disclosure.
  const hash = user ? user.passwordHash : dummyHash;
  const matches = await bcrypt.compare(password, hash);
  if (!user || !matches) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  res.json(session(user));
}
function me(req, res) { res.json({ user: publicUser(req.user) }); }
module.exports = { register, login, me };
