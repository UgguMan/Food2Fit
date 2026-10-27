const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

let database, app, models;
const credentials = { name: 'Test User', email: 'test@example.com', password: 'long test password 123' };
before(async () => {
  process.env.NODE_ENV = 'test';
  delete process.env.VERCEL;
  process.env.CLIENT_URL = 'http://localhost:5173';
  process.env.JWT_SECRET = randomBytes(48).toString('hex');
  database = await MongoMemoryServer.create();
  process.env.MONGO_URI = database.getUri('food2fit_test');
  app = require('../app');
  models = require('../models');
  await require('../config/db')();
  await Promise.all(Object.values(models).map(model => model.init()));
});
beforeEach(async () => {
  await Promise.all([models.User.deleteMany({}), models.RateLimit.deleteMany({})]);
});
after(async () => {
  await mongoose.disconnect();
  if (database) await database.stop();
});

test('registration normalizes email, hashes password, and returns a usable one-hour session', async () => {
  const response = await request(app).post('/api/auth/register').send({ ...credentials, name: ' Test User ', email: ' TEST@EXAMPLE.COM ' }).expect(201);
  assert.equal(response.body.user.name, 'Test User');
  assert.equal(response.body.user.email, credentials.email);
  assert.equal(response.body.expiresIn, 3600);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.body.user.passwordHash, undefined);
  const stored = await models.User.findOne({}).select('+passwordHash');
  assert.notEqual(stored.passwordHash, credentials.password);
  assert.ok(await bcrypt.compare(credentials.password, stored.passwordHash));
  assert.equal(bcrypt.getRounds(stored.passwordHash), 12);
  assert.equal(stored.toJSON().passwordHash, undefined);
  const me = await request(app).get('/api/auth/me').auth(response.body.token, { type: 'bearer' }).expect(200);
  assert.deepEqual(me.body.user, response.body.user);
});

test('simultaneous duplicate registrations create exactly one account', async () => {
  const results = await Promise.all([1, 2].map(() => request(app).post('/api/auth/register').send(credentials)));
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  assert.equal(await models.User.countDocuments({}), 1);
  assert.equal(results.find(result => result.status === 409).body.error.code, 'CONFLICT');
});

test('login accepts correct credentials and hides whether an account exists', async () => {
  await request(app).post('/api/auth/register').send(credentials).expect(201);
  const valid = await request(app).post('/api/auth/login').send({ email: credentials.email, password: credentials.password }).expect(200);
  assert.ok(valid.body.token);
  const wrong = await request(app).post('/api/auth/login').send({ email: credentials.email, password: 'incorrect password' }).expect(401);
  const missing = await request(app).post('/api/auth/login').send({ email: 'absent@example.com', password: 'incorrect password' }).expect(401);
  assert.deepEqual(wrong.body, missing.body);
});

test('invalid fields, MongoDB operator objects and extra fields never create accounts', async () => {
  const cases = [
    { ...credentials, email: { $ne: null } },
    { ...credentials, name: '<script>' },
    { ...credentials, password: 'short' },
    { ...credentials, password: 'é'.repeat(37) },
    { ...credentials, role: 'admin' },
    { ...credentials, name: ['User'] },
    { ...credentials, email: 'not-an-email' },
  ];
  for (const body of cases) {
    const response = await request(app).post('/api/auth/register').send(body).expect(400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.ok(!JSON.stringify(response.body).includes(credentials.password));
  }
  assert.equal(await models.User.countDocuments({}), 0);
});

test('protected route rejects missing, tampered, expired, wrong-audience and deleted-user sessions', async () => {
  await request(app).get('/api/auth/me').expect(401);
  const response = await request(app).post('/api/auth/register').send(credentials).expect(201);
  const options = { subject: response.body.user.id, issuer: 'food2fit-api', audience: 'food2fit-client' };
  const tokens = [
    response.body.token + 'invalid',
    jwt.sign({}, process.env.JWT_SECRET, { ...options, expiresIn: -1 }),
    jwt.sign({}, process.env.JWT_SECRET, { ...options, audience: 'wrong', expiresIn: '1h' }),
    jwt.sign({}, process.env.JWT_SECRET, { ...options, algorithm: 'HS384', expiresIn: '1h' }),
  ];
  for (const token of tokens) await request(app).get('/api/auth/me').auth(token, { type: 'bearer' }).expect(401);
  await models.User.deleteMany({});
  await request(app).get('/api/auth/me').auth(response.body.token, { type: 'bearer' }).expect(401);
});

test('auth requests share an IP limit and return Retry-After on exhaustion', async () => {
  for (let count = 0; count < 20; count++) {
    await request(app).post(count % 2 ? '/api/auth/login' : '/api/auth/register').send({}).expect(400);
  }
  const blocked = await request(app).post('/api/auth/login').send({}).expect(429);
  assert.ok(Number(blocked.headers['retry-after']) > 0);
  assert.equal(blocked.body.error.code, 'RATE_LIMITED');
  assert.ok(await models.RateLimit.countDocuments({}) > 0);
});

test('separate store instances atomically share counters and reset without waiting for TTL cleanup', async () => {
  const Store = require('../services/MongoRateLimitStore');
  const a = new Store('parallel');
  const b = new Store('parallel');
  a.init({ windowMs: 60000 }); b.init({ windowMs: 60000 });
  const originalNow = Date.now;
  const now = originalNow();
  try {
    Date.now = () => now;
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? a : b).increment('client')));
    assert.equal(Math.max(...results.map(value => value.totalHits)), 40);
    assert.equal(new Set(results.map(value => value.totalHits)).size, 40);
    const stored = await models.RateLimit.findOne({ _id: a.bucket('client').id }).lean();
    assert.equal(stored.count, 40);
    assert.ok(!stored._id.includes('client'));
    Date.now = () => now + 60000;
    assert.equal((await b.increment('client')).totalHits, 1);
  } finally { Date.now = originalNow; }
});

test('rate store failure denies requests instead of silently bypassing the quota', async () => {
  const Store = require('../services/MongoRateLimitStore');
  const store = new Store('failure'); store.init({ windowMs: 60000 });
  const original = models.RateLimit.findOneAndUpdate;
  try {
    models.RateLimit.findOneAndUpdate = () => { throw new Error('private connection details'); };
    await assert.rejects(store.increment('client'), error => error.status === 503 && error.code === 'RATE_LIMIT_UNAVAILABLE' && !error.message.includes('private'));
  } finally { models.RateLimit.findOneAndUpdate = original; }
});

test('history/cache expire after 30 days while saved recipe snapshots do not expire', async () => {
  const recipe = { title: 'Beans', description: 'A simple meal.', ingredients: [{ name: 'Beans', quantity: '100 g' }], instructions: ['Cook beans.'], prepTime: 5, cookTime: 20, servings: 1, nutrition: { calories: 100, protein: 8, carbs: 15, fat: 1, fiber: 5 } };
  const user = new mongoose.Types.ObjectId();
  const history = await models.Recipe.create({ user, recipe });
  assert.ok(Math.abs(history.expiresAt - Date.now() - 30 * 86400000) < 5000);
  const saved = await models.SavedRecipe.create({ user, recipeId: history._id, recipe });
  await models.Recipe.deleteOne({ _id: history._id });
  assert.equal((await models.SavedRecipe.findById(saved._id)).recipe.title, 'Beans');
  for (const model of [models.Recipe, models.RecipeCache, models.RateLimit]) {
    const indexes = await model.collection.indexes();
    assert.ok(indexes.some(index => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));
  }
  assert.ok(!(await models.SavedRecipe.collection.indexes()).some(index => index.expireAfterSeconds !== undefined));
});

test('security headers, CORS, parser errors and database readiness work together', async () => {
  const health = await request(app).get('/api/health').set('Origin', 'http://localhost:5173').expect(200);
  assert.equal(health.headers['access-control-allow-origin'], 'http://localhost:5173');
  assert.equal(health.headers['x-powered-by'], undefined);
  assert.equal(health.headers['x-content-type-options'], 'nosniff');
  await request(app).get('/api/health').set('Origin', 'https://evil.example').expect(403);
  await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{').expect(400);
  await request(app).post('/api/auth/login').type('form').send('email=test').expect(415);
  await request(app).post('/api/auth/login').send({ data: 'x'.repeat(1024 * 1024) }).expect(413);
  await request(app).get('/api/unknown').expect(404);
});

test('model validation rejects invalid nutrition and sparse plans', async () => {
  await assert.rejects(new models.Food({ name: 'Food', normalizedName: 'food', category: 'test', calories: -1 }).validate(), { name: 'ValidationError' });
  await assert.rejects(new models.MealPlan({ user: new mongoose.Types.ObjectId(), days: [] }).validate(), { name: 'ValidationError' });
  await assert.rejects(new models.Profile({ user: new mongoose.Types.ObjectId(), age: 12 }).validate(), { name: 'ValidationError' });
});
