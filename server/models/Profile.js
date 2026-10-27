const { Schema, owner, text, list, options, define } = require('./shared');
const schema = new Schema({
  user: owner,
  age: { type: Number, required: true, min: 18, max: 100, validate: Number.isInteger },
  gender: { type: String, required: true, enum: ['male', 'female'] },
  height: { type: Number, required: true, min: 100, max: 250 },
  weight: { type: Number, required: true, min: 30, max: 350 },
  activityLevel: { type: String, required: true, enum: ['sedentary', 'light', 'moderate', 'active', 'very-active'] },
  goal: { type: String, required: true, enum: ['fat-loss', 'muscle-gain', 'maintenance'] },
  dietPreference: { type: String, required: true, enum: ['veg', 'non-veg', 'vegan', 'keto'] },
  allergies: list(text(80), 30),
  workoutDays: { type: Number, required: true, min: 1, max: 7, validate: Number.isInteger },
  equipment: { type: String, required: true, enum: ['none', 'home', 'gym'] },
}, options);
schema.index({ user: 1 }, { unique: true });
module.exports = define('Profile', schema);
