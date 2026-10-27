const { Schema, recipe, options, define, expires } = require('./shared');
const schema = new Schema({
  key: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  recipe: { type: recipe, required: true },
  expiresAt: { type: Date, default: expires },
}, options);
schema.index({ key: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = define('RecipeCache', schema);
