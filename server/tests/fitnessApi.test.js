const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const request = require('supertest');
let database, app, models, token, otherToken;
const profile = { age: 30, gender: 'male', height: 175, weight: 75, activityLevel: 'moderate', goal: 'maintenance', dietPreference: 'vegan', allergies: [], workoutDays: 3, equipment: 'none' };
const csv = fs.readFileSync(path.join(__dirname, '../seed/data/sample-foods.csv'), 'utf8');
const send = (method, route, authToken = token) => request(app)[method](`/api/fitness${route}`).auth(authToken, { type: 'bearer' });
before(async () => {
  process.env.NODE_ENV = 'test'; delete process.env.VERCEL;
  process.env.CLIENT_URL = 'http://localhost:5173'; process.env.JWT_SECRET = randomBytes(48).toString('hex');
  database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = database.getUri('fitness_test');
  app = require('../app'); models = require('../models');
  await require('../config/db')();
  const { importFoods } = require('../services/foodImport');
  await importFoods(csv, 'TEST SAMPLE', models.Food);
  await require('../seed/seedExercises')();
  for (const [index, email] of ['a@example.com', 'b@example.com'].entries()) {
    const response = await request(app).post('/api/auth/register').send({ name: 'Test', email, password: 'long test password 123' }).expect(201);
    if (index === 0) token = response.body.token; else otherToken = response.body.token;
  }
});
beforeEach(async () => {
  for (const name of ['Profile', 'MealPlan', 'WorkoutPlan', 'ProgressLog', 'RateLimit']) await models[name].deleteMany({});
});
after(async () => { await mongoose.disconnect(); if (database) await database.stop(); });

test('seeds are idempotent and invalid imports do not clear existing food data', async () => {
  const { importFoods } = require('../services/foodImport');
  const count = await models.Food.countDocuments({});
  const report = await importFoods(csv, 'TEST SAMPLE', models.Food);
  assert.equal(report.upserted, 0); assert.equal(await models.Food.countDocuments({}), count);
  await assert.rejects(importFoods('name\nBad', 'TEST', models.Food));
  assert.equal(await models.Food.countDocuments({}), count);
  await require('../seed/seedExercises')();
  assert.equal(await models.Exercise.countDocuments({}), 24);
});

test('profile CRUD validates input and isolates users', async () => {
  await request(app).get('/api/fitness/profile').expect(401);
  await send('get', '/profile').expect(404);
  await send('post', '/profile').send({ ...profile, user: new mongoose.Types.ObjectId() }).expect(400);
  await send('post', '/profile').send({ ...profile, allergies: ['unmapped allergen'] }).expect(400);
  await send('post', '/profile').send({ ...profile, weight: { $gt: 0 } }).expect(400);
  const created = await send('post', '/profile').send({ ...profile, allergies: ['Dairy', 'soya'] }).expect(201);
  assert.deepEqual(created.body.profile.allergies, ['milk', 'soy']);
  await send('post', '/profile').send(profile).expect(409);
  await send('get', '/profile', otherToken).expect(404);
  const updated = await send('put', '/profile').send({ ...profile, weight: 76 }).expect(200);
  assert.equal(updated.body.profile.weight, 76);
  await send('delete', '/profile').expect(204);
  await send('get', '/profile').expect(404);
});

test('complete plans persist together, become stale after edits and remain private', async () => {
  await send('post', '/generate-plan').expect(404);
  await send('post', '/profile').send(profile).expect(201);
  const result = await send('post', '/generate-plan').expect(201);
  assert.equal(result.body.mealPlan.days.length, 7);
  assert.equal(result.body.workoutPlan.days.length, 3);
  assert.equal(result.body.workoutPlan.mealPlan, result.body.mealPlan._id);
  assert.equal(result.body.stale, false);
  const persisted = await send('get', '/plan').expect(200);
  assert.equal(persisted.body.mealPlan._id, result.body.mealPlan._id);
  await send('get', '/plan', otherToken).expect(404);
  await send('put', '/profile').send({ ...profile, weight: 80 }).expect(200);
  assert.equal((await send('get', '/plan').expect(200)).body.stale, true);
  await send('post', '/generate-plan').expect(201);
  assert.equal(await models.MealPlan.countDocuments({}), 1);
  assert.equal(await models.WorkoutPlan.countDocuments({}), 1);
  await send('delete', '/profile').expect(204);
  assert.equal(await models.MealPlan.countDocuments({}), 0);
  assert.equal(await models.WorkoutPlan.countDocuments({}), 0);
});

test('failed plan persistence rolls back and preserves the previous pair', async () => {
  await send('post', '/profile').send(profile).expect(201);
  const original = await send('post', '/generate-plan').expect(201);
  const create = models.WorkoutPlan.create;
  try {
    models.WorkoutPlan.create = async () => { throw new Error('simulated persistence failure'); };
    const failed = await send('post', '/generate-plan').expect(500);
    assert.equal(failed.body.error.code, 'INTERNAL_ERROR');
  } finally { models.WorkoutPlan.create = create; }
  assert.equal(await models.MealPlan.countDocuments({}), 1);
  assert.equal((await send('get', '/plan').expect(200)).body.mealPlan._id, original.body.mealPlan._id);
});

test('concurrent generations retain one consistent complete pair', async () => {
  await send('post', '/profile').send(profile).expect(201);
  const results = await Promise.all([send('post', '/generate-plan'), send('post', '/generate-plan')]);
  assert.deepEqual(results.map(result => result.status), [201, 201]);
  assert.equal(await models.MealPlan.countDocuments({}), 1);
  assert.equal(await models.WorkoutPlan.countDocuments({}), 1);
  const result = await send('get', '/plan').expect(200);
  assert.equal(result.body.workoutPlan.mealPlan, result.body.mealPlan._id);
});

test('progress updates the same date, sorts chronologically, and stays private', async () => {
  await send('post', '/log-progress').send({ date: '2026-02-30', weight: 75 }).expect(400);
  await send('post', '/log-progress').send({ date: '2026-01-01', weight: 75, notes: 'Initial entry' }).expect(200);
  await send('post', '/log-progress').send({ date: '2026-01-01', weight: 74 }).expect(200);
  await send('post', '/log-progress').send({ date: '2026-01-02', weight: 73.9 }).expect(200);
  const result = await send('get', '/progress?limit=2').expect(200);
  assert.equal(result.body.progress.length, 2);
  assert.equal(result.body.progress[0].weight, 74);
  assert.deepEqual((await send('get', '/progress', otherToken).expect(200)).body.progress, []);
  await send('get', '/progress?limit=1000').expect(400);
  await send('get', '/progress?user=someone').expect(400);
});
