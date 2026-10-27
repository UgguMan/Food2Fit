const { GoogleGenAI } = require('@google/genai');
const { setTimeout: delay } = require('node:timers/promises');
const env = require('../config/env');
const { AppError } = require('../middleware/errors');
const { parseOutput } = require('./recipeSchema');

function quotaError(error) {
  return Number(error.status || error.code) === 429 || error.status === 'RESOURCE_EXHAUSTED'
    || /RESOURCE_EXHAUSTED/.test(String(error.message || ''));
}
// Dependencies are injectable for deterministic tests; no test-only HTTP endpoint.
function createGeminiService({ generate, sleep = delay, timeoutMs = 12000 } = {}) {
  return async function generateJSON({ parts, schema, systemInstruction }) {
    if (!generate && (!env.geminiApiKey || !env.geminiModel)) {
      throw new AppError(503, 'AI_NOT_CONFIGURED', 'Recipe AI is not configured yet. Saved recipes are still available.');
    }
    const call = generate || (params => new GoogleGenAI({ apiKey: env.geminiApiKey }).models.generateContent(params));
    for (let attempt = 0; attempt < 3; attempt++) {
      const abort = new AbortController();
      let timer;
      try {
        const timeout = new Promise((resolve, reject) => {
          timer = setTimeout(() => { abort.abort(); reject(new AppError(504, 'AI_TIMEOUT', 'Recipe AI took too long. Please try again.')); }, timeoutMs);
        });
        const response = await Promise.race([call({ model: env.geminiModel,
          contents: [{ role: 'user', parts }], config: {
            systemInstruction, responseMimeType: 'application/json', responseJsonSchema: schema,
            maxOutputTokens: 6000, temperature: 0.7, abortSignal: abort.signal,
            httpOptions: { timeout: timeoutMs, retryOptions: { attempts: 1 } },
          } }), timeout]);
        if (response.promptFeedback?.blockReason || response.candidates?.some(candidate => ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'RECITATION', 'IMAGE_SAFETY'].includes(candidate.finishReason))) {
          throw new AppError(422, 'AI_SAFETY_BLOCK', 'The AI could not process that request. Try a different food description or photo.');
        }
        if (response.candidates?.some(candidate => candidate.finishReason && candidate.finishReason !== 'STOP')) {
          throw new AppError(502, 'AI_INVALID_RESPONSE', 'The AI response was incomplete. Please try again.');
        }
        return parseOutput(response.text, schema);
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (quotaError(error)) {
          if (attempt < 2) { clearTimeout(timer); await sleep(500 * 2 ** attempt); continue; }
          throw new AppError(429, 'AI_QUOTA_EXCEEDED', 'The AI limit has been reached. Please try again later, or use a saved recipe.');
        }
        if (abort.signal.aborted || ['AbortError', 'TimeoutError'].includes(error.name) || [408, 504].includes(Number(error.status))) {
          throw new AppError(504, 'AI_TIMEOUT', 'Recipe AI took too long. Please try again.');
        }
        throw new AppError(503, 'AI_UNAVAILABLE', 'Recipe AI is temporarily unavailable. Please try again later.');
      } finally { clearTimeout(timer); }
    }
  };
}
module.exports = { createGeminiService, generateJSON: createGeminiService() };
