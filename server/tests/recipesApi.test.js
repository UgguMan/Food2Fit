const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const sharp = require('sharp');
const fixture = require('./recipeFixture');
let database, app, models, gemini, original, token, otherToken, calls, image;
const input = { ingredients: ['chickpeas', 'spinach'], cuisine: 'Indian', dietType: 'vegan', allergies: ['milk'], calorieTarget: 350, cookingTime: 30, servings: 2 };
const send = (method, path, authToken = token) => request(app)[method](`/api/recipes${path}`).auth(authToken, { type: 'bearer' });
before(async () => {
  process.env.NODE_ENV = 'test'; delete process.env.VERCEL;
  process.env.CLIENT_URL = 'http://localhost:5173'; process.env.JWT_SECRET = randomBytes(48).toString('hex');
  // A fake model label only; every provider call is intercepted below.
  process.env.GEMINI_MODEL = 'test-model'; delete process.env.GEMINI_API_KEY;
  database = await MongoMemoryServer.create(); process.env.MONGO_URI = database.getUri('recipes_test');
  app = require('../app'); models = require('../models'); gemini = require('../services/geminiService'); original = gemini.generateJSON;
  await require('../config/db')();
  for (const [index, email] of ['recipe-a@example.com', 'recipe-b@example.com'].entries()) {
    const response = await request(app).post('/api/auth/register').send({ name: 'Private Name', email, password: 'long test password 123' }).expect(201);
    if (!index) token = response.body.token; else otherToken = response.body.token;
  }
  image = await sharp({ create: { width: 1500, height: 900, channels: 3, background: '#63a25a' } }).png().toBuffer();
});
beforeEach(async () => {
  calls = [];
  for (const name of ['Recipe', 'SavedRecipe', 'RecipeCache', 'RateLimit']) await models[name].deleteMany({});
  gemini.generateJSON = async params => { calls.push(params); return structuredClone(fixture); };
});
after(async () => { if (gemini) gemini.generateJSON = original; await mongoose.disconnect(); if (database) await database.stop(); });

test('generation stores history, canonical cache hits avoid AI, and regeneration bypasses cache', async () => {
  const first = await send('post', '/generate').send(input).expect(201);
  assert.equal(first.body.cached, false); assert.equal(first.body.nutritionBasis, 'per-serving');
  const second = await send('post', '/generate').send({ ...input, ingredients: [' SPINACH ', 'Chickpeas', 'chickpeas'], cuisine: 'indian' }).expect(201);
  assert.equal(second.body.cached, true); assert.equal(calls.length, 1);
  assert.equal(await models.Recipe.countDocuments({}), 2);
  assert.equal(await models.RecipeCache.countDocuments({}), 1);
  await send('post', '/generate').send({ ...input, regenerate: true }).expect(201);
  assert.equal(calls.length, 2);
  const prompt = JSON.stringify(calls[0]);
  assert.ok(!prompt.includes('Private Name') && !prompt.includes('example.com') && !prompt.includes(token));
});
test('cache entries are private and expired entries are ignored before TTL cleanup', async () => {
  await send('post', '/generate').send(input).expect(201);
  await send('post', '/generate', otherToken).send(input).expect(201);
  assert.equal(calls.length, 2); assert.equal(await models.RecipeCache.countDocuments({}), 2);
  await models.RecipeCache.updateMany({}, { $set: { expiresAt: new Date(0) } });
  await send('post', '/generate').send(input).expect(201); assert.equal(calls.length, 3);
});
test('input and output validation prevent unsafe persistence', async () => {
  await send('post', '/generate').send({ ...input, dietType: ['vegan'] }).expect(400);
  await send('post', '/generate').send({ ...input, servings: '2' }).expect(400);
  await send('post', '/generate').send({ ...input, ingredients: { $ne: null } }).expect(400);
  await send('post', '/generate').send({ ...input, email: 'private@example.com' }).expect(400);
  assert.equal(calls.length, 0);
  gemini.generateJSON = async () => ({ ...fixture, servings: 3 });
  await send('post', '/generate').send(input).expect(502);
  assert.equal(await models.Recipe.countDocuments({}), 0); assert.equal(await models.RecipeCache.countDocuments({}), 0);
});
test('a cached recipe with mismatched servings is replaced rather than returned', async () => {
  await send('post', '/generate').send(input).expect(201);
  await models.RecipeCache.updateMany({}, { $set: { 'recipe.servings': 3 } });
  const response = await send('post', '/generate').send(input).expect(201);
  assert.equal(response.body.cached, false);
  assert.equal(response.body.recipe.recipe.servings, 2);
  assert.equal(calls.length, 2);
});
test('favorites are idempotent, private and survive history expiry; refinements retain preferences', async () => {
  const first = await send('post', '/generate').send(input).expect(201);
  const recipeId = first.body.recipe._id;
  const saved = await send('post', '/save').send({ recipeId }).expect(200);
  await send('post', '/save').send({ recipeId }).expect(200);
  assert.equal(await models.SavedRecipe.countDocuments({}), 1);
  await send('post', '/save', otherToken).send({ recipeId }).expect(404);
  await send('post', '/refine', otherToken).send({ recipeId, refinement: 'healthier' }).expect(404);
  await models.Recipe.updateOne({ _id: recipeId }, { $set: { expiresAt: new Date(0) } });
  assert.equal((await send('get', '/history').expect(200)).body.recipes.length, 0);
  assert.equal((await send('get', '/favorites').expect(200)).body.recipes.length, 1);
  assert.equal((await send('get', '/favorites', otherToken).expect(200)).body.recipes.length, 0);
  const refined = await send('post', '/refine').send({ recipeId, refinement: 'higher-protein' }).expect(201);
  assert.deepEqual(refined.body.recipe.preferences.allergies, ['milk']);
  assert.equal(refined.body.recipe.preferences.dietType, 'vegan');
  assert.ok(calls.at(-1).parts[0].text.includes('higher-protein'));
  await send('delete', `/favorites/${saved.body.savedRecipe._id}`, otherToken).expect(404);
  await send('delete', `/favorites/${saved.body.savedRecipe._id}`).expect(204);
});
test('provider quota errors return only the requesting user’s recent saved recipes', async () => {
  const first = await send('post', '/generate').send(input).expect(201);
  await send('post', '/save').send({ recipeId: first.body.recipe._id }).expect(200);
  const { AppError } = require('../middleware/errors');
  gemini.generateJSON = async () => { throw new AppError(429, 'AI_QUOTA_EXCEEDED', 'AI limit reached.'); };
  const failed = await send('post', '/generate').send({ ...input, regenerate: true }).expect(429);
  assert.equal(failed.body.error.details.savedRecipes.length, 1);
  const other = await send('post', '/generate', otherToken).send(input).expect(429);
  assert.deepEqual(other.body.error.details.savedRecipes, []);
});
test('ingredient images are decoded, resized and sent inline without persistence', async () => {
  let inline;
  gemini.generateJSON = async params => { inline = params.parts[1].inlineData; return { ingredients: ['Chickpeas', 'spinach'] }; };
  const detected = await send('post', '/detect-ingredients').attach('image', image, { filename: 'fridge.png', contentType: 'image/png' }).expect(200);
  assert.equal(detected.body.requiresConfirmation, true);
  assert.deepEqual(detected.body.ingredients, ['chickpeas', 'spinach']);
  assert.equal(inline.mimeType, 'image/jpeg');
  const metadata = await sharp(Buffer.from(inline.data, 'base64')).metadata();
  assert.ok(metadata.width <= 1024 && metadata.height <= 1024); assert.equal(metadata.exif, undefined);
  assert.equal(await models.Recipe.countDocuments({}), 0); assert.equal(await models.RecipeCache.countDocuments({}), 0);
});
test('missing, spoofed, multiple and oversized image uploads are rejected', async () => {
  await send('post', '/detect-ingredients').expect(400);
  await send('post', '/detect-ingredients').attach('image', Buffer.from('not an image'), { filename: 'fake.png', contentType: 'image/png' }).expect(400);
  await send('post', '/detect-ingredients').attach('image', image, { filename: 'fake.jpg', contentType: 'image/jpeg' }).expect(400);
  await send('post', '/detect-ingredients').attach('image', Buffer.alloc(2 * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' }).expect(413);
  await send('post', '/detect-ingredients').attach('image', image, 'a.png').attach('image', image, 'b.png').expect(400);
  assert.equal(calls.length, 0);
});
test('AI routes share the five-per-minute quota while saved recipe reads remain available', async () => {
  for (let i = 0; i < 5; i++) await send('post', '/generate').send(input).expect(201);
  const blocked = await send('post', '/refine').send({}).expect(429);
  assert.equal(blocked.body.error.code, 'RATE_LIMITED'); assert.ok(blocked.headers['retry-after']);
  await send('get', '/favorites').expect(200);
});
test('history pagination and owner-scoped deletion work independently of favorites', async () => {
  const generated = await send('post', '/generate').send(input).expect(201);
  const id = generated.body.recipe._id;
  await send('post', '/save').send({ recipeId: id }).expect(200);
  await send('post', '/generate').send(input).expect(201);
  const list = await send('get', '/history?page=1&limit=1').expect(200);
  assert.equal(list.body.recipes.length, 1); assert.equal(list.body.hasMore, true);
  await send('get', '/history?limit=999').expect(400);
  await send('delete', `/${id}`, otherToken).expect(404);
  await send('delete', `/${id}`).expect(204);
  assert.equal((await send('get', '/favorites').expect(200)).body.recipes.length, 1);
});
