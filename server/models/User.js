const { Schema, text, options, define } = require('./shared');
const schema = new Schema({
  name: text(80),
  email: { ...text(254), lowercase: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  passwordHash: { type: String, required: true, select: false },
}, options);
schema.index({ email: 1 }, { unique: true });
schema.set('toJSON', { transform(doc, value) { delete value.passwordHash; delete value.__v; return value; } });
module.exports = define('User', schema);
