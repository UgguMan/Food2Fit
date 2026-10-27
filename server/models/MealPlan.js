const { Schema, text, number, owner, list, nutrition, options, define } = require('./shared');
const meal = new Schema({
  type: { type: String, required: true, enum: ['breakfast', 'lunch', 'snack', 'dinner'] },
  foods: list(new Schema({
    food: { type: Schema.Types.ObjectId, ref: 'Food', required: true },
    name: text(), grams: { ...number(2000), min: 1 },
    nutrition: { type: nutrition, required: true },
  }, { _id: false }), 10, 1),
  totals: { type: nutrition, required: true },
}, { _id: false });
const schema = new Schema({
  user: owner,
  targets: { type: nutrition, required: true },
  profileUpdatedAt: { type: Date, required: true },
  warnings: list(text(500), 50),
  notes: list(text(500), 10),
  sources: list(text(200), 100),
  algorithmVersion: text(30),
  metrics: { bmi: number(400), bmr: number(10000), tdee: number(20000) },
  days: list(new Schema({
    day: { ...number(7), min: 1, validate: Number.isInteger },
    meals: list(meal, 4, 4),
    totals: { type: nutrition, required: true },
    deviation: { calories: Number, protein: Number, carbs: Number, fat: Number, fiber: Number },
  }, { _id: false }), 7, 7),
}, options);
schema.index({ user: 1, createdAt: -1 });
module.exports = define('MealPlan', schema);
