const { Schema, text, list, options, define } = require('./shared');
const schema = new Schema({
  name: text(), muscleGroup: text(80),
  equipment: { type: String, required: true, enum: ['none', 'home', 'gym'] },
  difficulty: { type: String, required: true, enum: ['beginner', 'intermediate', 'advanced'] },
  goalTags: list({ type: String, enum: ['fat-loss', 'muscle-gain', 'maintenance'] }, 3, 1),
  movement: { type: String, required: true, enum: ['push', 'pull', 'legs', 'core', 'cardio'] },
}, options);
schema.index({ name: 1 }, { unique: true });
schema.index({ equipment: 1, movement: 1 });
module.exports = define('Exercise', schema);
