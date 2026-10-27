const { Schema, owner, recipe, preferences, options, define, expires } = require('./shared');
const schema = new Schema({ user: owner, recipe: { type: recipe, required: true }, preferences, expiresAt: { type: Date, default: expires } }, options);
schema.index({ user: 1, createdAt: -1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = define('Recipe', schema);
