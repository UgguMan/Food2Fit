const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGeminiService } = require('../services/geminiService');
const { recipeSchema, detectionSchema, parseOutput } = require('../services/recipeSchema');
const recipe = require('./recipeFixture');
const params = { parts: [{ text: 'Make a recipe.' }], schema: recipeSchema, systemInstruction: 'JSON only.' };

test('strict output parsing accepts JSON fences and rejects malformed, extra, missing and coerced fields', () => {
  assert.deepEqual(parseOutput('```json\n' + JSON.stringify(recipe) + '\n```', recipeSchema), recipe);
  for (const value of ['not json', JSON.stringify({ ...recipe, unexpected: true }), JSON.stringify({ ...recipe, title: null }), JSON.stringify({ ...recipe, servings: '2' }), JSON.stringify({ ...recipe, nutrition: { ...recipe.nutrition, fat: -1 } }), JSON.stringify({ ...recipe, instructions: [] }), JSON.stringify({ ...recipe, title: '<script>alert(1)</script>' })]) {
    assert.throws(() => parseOutput(value, recipeSchema), { code: 'AI_INVALID_RESPONSE' });
  }
  assert.deepEqual(parseOutput('{"ingredients":[]}', detectionSchema), { ingredients: [] });
});
test('request uses schema mode, abort signal, configured model and disables hidden SDK retries', async () => {
  let request;
  const service = createGeminiService({ generate: async input => { request = input; return { text: JSON.stringify(recipe), candidates: [{ finishReason: 'STOP' }] }; } });
  assert.deepEqual(await service(params), recipe);
  assert.equal(request.model, require('../config/env').geminiModel);
  assert.equal(request.config.httpOptions.retryOptions.attempts, 1);
  assert.equal(request.config.responseMimeType, 'application/json');
  assert.ok(request.config.abortSignal instanceof AbortSignal);
});
test('quota exhaustion retries exactly twice with exponential backoff and hides provider details', async () => {
  let calls = 0; const waits = [];
  const service = createGeminiService({ generate: async () => { calls++; throw { status: 429, message: 'private provider quota details' }; }, sleep: async delay => waits.push(delay) });
  await assert.rejects(service(params), { code: 'AI_QUOTA_EXCEEDED', status: 429 });
  assert.equal(calls, 3); assert.deepEqual(waits, [500, 1000]);
});
test('RESOURCE_EXHAUSTED retries can recover on the last attempt', async () => {
  let calls = 0;
  const service = createGeminiService({ generate: async () => { if (++calls < 3) throw { message: 'RESOURCE_EXHAUSTED' }; return { text: JSON.stringify(recipe) }; }, sleep: async () => {} });
  assert.deepEqual(await service(params), recipe); assert.equal(calls, 3);
});
test('timeouts cancel the request and return a bounded error', async () => {
  let signal;
  const service = createGeminiService({ timeoutMs: 10, generate: input => { signal = input.config.abortSignal; return new Promise(() => {}); } });
  await assert.rejects(service(params), { code: 'AI_TIMEOUT', status: 504 });
  assert.ok(signal.aborted);
});
test('safety blocks, truncated responses and provider failures are distinct and not retried', async () => {
  for (const [response, code] of [
    [{ promptFeedback: { blockReason: 'SAFETY' } }, 'AI_SAFETY_BLOCK'],
    [{ candidates: [{ finishReason: 'SAFETY' }] }, 'AI_SAFETY_BLOCK'],
    [{ text: JSON.stringify(recipe), candidates: [{ finishReason: 'MAX_TOKENS' }] }, 'AI_INVALID_RESPONSE'],
    [{ text: '```json\n{bad}\n```' }, 'AI_INVALID_RESPONSE'],
  ]) {
    let calls = 0;
    await assert.rejects(createGeminiService({ generate: async () => { calls++; return response; } })(params), { code });
    assert.equal(calls, 1);
  }
  await assert.rejects(createGeminiService({ generate: async () => { throw { status: 403, message: 'SECRET API KEY' }; } })(params), error => error.code === 'AI_UNAVAILABLE' && !error.message.includes('SECRET'));
});
