const { Schema, owner, recipe, preferences, options, define } = require('./shared');
// A snapshot keeps favorites intact after their history entry expires.
const schema = new Schema({
  user: owner,
  recipeId: { type: Schema.Types.ObjectId, ref: 'Recipe', required: true },
  recipe: { type: recipe, required: true },
  preferences,
}, options);
schema.index({ user: 1, recipeId: 1 }, { unique: true });
schema.index({ user: 1, createdAt: -1 });
module.exports = define('SavedRecipe', schema);
