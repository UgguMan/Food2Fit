const mongoose = require('mongoose');
const { Profile, Food, Exercise, MealPlan, WorkoutPlan, ProgressLog } = require('../models');
const { buildMealPlan, buildWorkoutPlan } = require('../services/fitnessEngine');
const { AppError } = require('../middleware/errors');
async function transaction(work) {
  const session = await mongoose.startSession();
  try {
    // Each attempt creates fresh documents. Native transaction retries avoid
    // Mongoose resetting strict embedded document version keys after an abort.
    return await session.withTransaction(() => work(session));
  } finally { await session.endSession(); }
}
async function createProfile(req, res) {
  const profile = await Profile.create({ ...req.validated, allergies: [...new Set(req.validated.allergies)], user: req.user._id });
  res.status(201).json({ profile });
}
async function getProfile(req, res) {
  const profile = await Profile.findOne({ user: req.user._id }).lean();
  if (!profile) throw new AppError(404, 'PROFILE_NOT_FOUND', 'Create your fitness profile first.');
  res.json({ profile });
}
async function updateProfile(req, res) {
  const profile = await Profile.findOneAndUpdate({ user: req.user._id }, { $set: { ...req.validated, allergies: [...new Set(req.validated.allergies)] } }, { returnDocument: 'after', runValidators: true });
  if (!profile) throw new AppError(404, 'PROFILE_NOT_FOUND', 'Create your fitness profile first.');
  res.json({ profile });
}
async function deleteProfile(req, res) {
  await transaction(async session => {
    const result = await Profile.deleteOne({ user: req.user._id }, { session });
    if (!result.deletedCount) throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
    await WorkoutPlan.deleteMany({ user: req.user._id }, { session });
    await MealPlan.deleteMany({ user: req.user._id }, { session });
  });
  res.status(204).end();
}
async function generatePlan(req, res) {
  let result;
  await transaction(async session => {
    const profile = await Profile.findOne({ user: req.user._id }).session(session).lean();
    if (!profile) throw new AppError(404, 'PROFILE_NOT_FOUND', 'Create your fitness profile first.');
    // Serialize against profile edits/deletion without changing the profile timestamp.
    await Profile.updateOne({ _id: profile._id }, { $inc: { __v: 1 } }, { session, timestamps: false });
    const filter = profile.dietPreference === 'non-veg' ? {} : { dietTags: profile.dietPreference };
    const foods = await Food.find(filter).sort({ normalizedName: 1 }).limit(2001).session(session).lean();
    const exercises = await Exercise.find({}).sort({ name: 1 }).limit(500).session(session).lean();
    if (foods.length > 2000) throw new AppError(422, 'DATASET_TOO_LARGE', 'This planner supports up to 2000 foods per diet. Import a curated subset.');
    const mealData = buildMealPlan(profile, foods);
    const workoutData = buildWorkoutPlan(profile, exercises);
    const [mealPlan] = await MealPlan.create([{ ...mealData, user: req.user._id, profileUpdatedAt: profile.updatedAt }], { session });
    const [workoutPlan] = await WorkoutPlan.create([{ ...workoutData, user: req.user._id, mealPlan: mealPlan._id }], { session });
    // Keep only the latest complete pair to protect the free database quota.
    await WorkoutPlan.deleteMany({ user: req.user._id, _id: { $ne: workoutPlan._id } }, { session });
    await MealPlan.deleteMany({ user: req.user._id, _id: { $ne: mealPlan._id } }, { session });
    result = { mealPlan, workoutPlan, stale: false };
  });
  res.status(201).json(result);
}
async function getPlan(req, res) {
  const profile = await Profile.findOne({ user: req.user._id }).lean();
  const workoutPlan = await WorkoutPlan.findOne({ user: req.user._id }).sort({ createdAt: -1 }).lean();
  const mealPlan = workoutPlan ? await MealPlan.findOne({ _id: workoutPlan.mealPlan, user: req.user._id }).lean() : null;
  if (!mealPlan || !profile) throw new AppError(404, 'PLAN_NOT_FOUND', 'Generate a fitness plan first.');
  res.json({ mealPlan, workoutPlan, stale: profile.updatedAt.getTime() !== mealPlan.profileUpdatedAt.getTime() });
}
async function logProgress(req, res) {
  const filter = { user: req.user._id, date: req.validated.date };
  const update = { $set: { ...req.validated, notes: req.validated.notes || '' } };
  let progress;
  try { progress = await ProgressLog.findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after', runValidators: true }); }
  catch (error) {
    if (error.code !== 11000) throw error;
    progress = await ProgressLog.findOneAndUpdate(filter, update, { returnDocument: 'after', runValidators: true });
  }
  res.json({ progress });
}
async function getProgress(req, res) {
  const progress = await ProgressLog.find({ user: req.user._id }).sort({ date: -1 }).limit(req.validated.limit || 90).lean();
  res.json({ progress: progress.reverse() });
}
module.exports = { createProfile, getProfile, updateProfile, deleteProfile, generatePlan, getPlan, logProgress, getProgress };
