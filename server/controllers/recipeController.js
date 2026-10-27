const { Recipe, SavedRecipe } = require('../models');
const service = require('../services/recipeService');
const { AppError } = require('../middleware/errors');
async function generate(req, res) { res.status(201).json(await service.generate(req.user._id, req.validated)); }
async function refine(req, res) {
  const source = await service.sourceRecipe(req.user._id, req.validated.recipeId);
  res.status(201).json(await service.generate(req.user._id, req.validated, source));
}
async function detect(req, res) {
  try {
    const detected = await service.detect(req.ingredientImage);
    res.json({ ingredients: [...new Set(detected.ingredients.map(item => item.trim().toLowerCase()))], requiresConfirmation: true,
      notice: 'Review and edit these suggestions before generating. A photo cannot reveal every ingredient or allergen.' });
  } finally { delete req.ingredientImage; }
}
async function save(req, res) {
  const source = await service.sourceRecipe(req.user._id, req.validated.recipeId);
  const filter = { user: req.user._id, recipeId: req.validated.recipeId };
  let saved;
  try {
    saved = await SavedRecipe.findOneAndUpdate(filter, { $setOnInsert: { ...filter, recipe: source.recipe, preferences: source.preferences } }, { upsert: true, returnDocument: 'after', runValidators: true });
  } catch (error) { if (error.code !== 11000) throw error; saved = await SavedRecipe.findOne(filter); }
  res.json({ savedRecipe: saved });
}
const list = (Model, activeOnly) => async (req, res) => {
  const page = req.validated.page || 1, limit = req.validated.limit || 20;
  const filter = { user: req.user._id, ...(activeOnly ? { expiresAt: { $gt: new Date() } } : {}) };
  const records = await Model.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit + 1).lean();
  res.json({ recipes: records.slice(0, limit), page, limit, hasMore: records.length > limit });
};
const remove = Model => async (req, res) => {
  const result = await Model.deleteOne({ _id: req.validated.id, user: req.user._id });
  if (!result.deletedCount) throw new AppError(404, 'RECIPE_NOT_FOUND', 'Recipe not found.');
  res.status(204).end();
};
module.exports = { generate, refine, detect, save, history: list(Recipe, true), favorites: list(SavedRecipe, false), remove: remove(Recipe), unsave: remove(SavedRecipe) };
