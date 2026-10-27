const { Schema, text, number, list, options, define } = require('./shared');
const schema = new Schema({
  name: text(), normalizedName: { ...text(), lowercase: true }, category: text(80),
  // Nutrients are normalized per 100 g by the Step 3 importer.
  calories: number(1000), protein: number(100), carbs: number(100), fat: number(100), fiber: number(100),
  servingGrams: { ...number(2000), min: 1 },
  dietTags: list({ type: String, enum: ['veg', 'non-veg', 'vegan', 'keto'] }, 4),
  allergens: list(text(80), 30),
  mealTypes: list({ type: String, enum: ['breakfast', 'lunch', 'snack', 'dinner'] }, 4, 1),
  source: text(200),
}, options);
schema.index({ normalizedName: 1 }, { unique: true });
schema.index({ dietTags: 1, category: 1 });
module.exports = define('Food', schema);
