const { Schema, owner, options, define } = require('./shared');
const schema = new Schema({
  user: owner,
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  weight: { type: Number, required: true, min: 30, max: 350 },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
}, options);
schema.index({ user: 1, date: 1 }, { unique: true });
module.exports = define('ProgressLog', schema);
