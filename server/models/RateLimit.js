const { Schema, define } = require('./shared');
const schema = new Schema({
  _id: String,
  count: { type: Number, required: true, min: 0 },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = define('RateLimit', schema);
