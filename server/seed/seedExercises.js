const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Exercise = require('../models/Exercise');
const exercises = require('./data/exercises.json');
async function seedExercises() {
  for (const exercise of exercises) await new Exercise(exercise).validate();
  await Exercise.createIndexes();
  return Exercise.bulkWrite(exercises.map(exercise => ({
    updateOne: { filter: { name: exercise.name }, update: { $set: exercise }, upsert: true },
  })));
}
if (require.main === module) connectDB().then(seedExercises).then(result => {
  console.log(JSON.stringify({ upserted: result.upsertedCount, modified: result.modifiedCount }));
}).catch(() => { console.error('Exercise import failed. Check database access and seed data.'); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
module.exports = seedExercises;
