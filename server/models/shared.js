const { Schema, models, model } = require('mongoose');

const text = (max = 200) => ({ type: String, trim: true, required: true, maxlength: max });
const number = (max = 100000) => ({ type: Number, required: true, min: 0, max });
const owner = { type: Schema.Types.ObjectId, ref: 'User', required: true };
const list = (type, max = 100, min = 0) => ({
  type: [type], default: [],
  validate: { validator: value => value.length >= min && value.length <= max, message: `List must contain ${min}–${max} items.` },
});
const nutrition = new Schema({
  calories: number(), protein: number(), carbs: number(), fat: number(), fiber: number(),
}, { _id: false, strict: 'throw' });
const recipe = new Schema({
  title: text(160), description: text(2000),
  ingredients: list(new Schema({ name: text(), quantity: text(100) }, { _id: false }), 80, 1),
  instructions: list(text(2000), 50, 1),
  prepTime: number(1440), cookTime: number(1440), servings: { ...number(20), min: 1 },
  nutrition: { type: nutrition, required: true },
}, { _id: false, strict: 'throw' });
const options = { timestamps: true, strict: 'throw' };
const preferences = new Schema({
  ingredients: list(text(100), 40, 1), cuisine: text(80),
  dietType: { type: String, enum: ['veg', 'non-veg', 'vegan', 'keto'], required: true },
  allergies: list(text(80), 30), calorieTarget: { ...number(3000), min: 100 },
  cookingTime: { ...number(240), min: 5 }, servings: { ...number(20), min: 1 },
}, { _id: false, strict: 'throw' });
const define = (name, schema) => models[name] || model(name, schema);
const expires = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
module.exports = { Schema, text, number, owner, list, nutrition, recipe, preferences, options, define, expires };
