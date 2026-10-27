const { Schema, text, number, owner, list, options, define } = require('./shared');
const schema = new Schema({
  user: owner,
  mealPlan: { type: Schema.Types.ObjectId, ref: 'MealPlan', required: true },
  restDays: list({ type: Number, min: 1, max: 7 }, 7),
  notes: list(text(500), 10),
  days: list(new Schema({
    day: { ...number(7), min: 1, validate: Number.isInteger }, title: text(100),
    exercises: list(new Schema({
      exercise: { type: Schema.Types.ObjectId, ref: 'Exercise', required: true },
      name: text(), sets: { ...number(10), min: 1, validate: Number.isInteger },
      reps: text(80), restSeconds: number(600),
    }, { _id: false }), 12, 1),
  }, { _id: false }), 7, 1),
}, options);
schema.index({ user: 1, createdAt: -1 });
module.exports = define('WorkoutPlan', schema);
