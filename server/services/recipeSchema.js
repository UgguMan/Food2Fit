const { AppError } = require('../middleware/errors');
const string = maxLength => ({ type: 'string', minLength: 1, maxLength });
const number = maximum => ({ type: 'number', minimum: 0, maximum });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const nutritionSchema = object(Object.fromEntries(['calories', 'protein', 'carbs', 'fat', 'fiber'].map(key => [key, number(key === 'calories' ? 10000 : 1000)])));
const recipeSchema = object({
  title: string(160), description: string(2000),
  ingredients: { type: 'array', minItems: 1, maxItems: 80, items: object({ name: string(200), quantity: string(100) }) },
  instructions: { type: 'array', minItems: 1, maxItems: 50, items: string(2000) },
  prepTime: number(1440), cookTime: number(1440), servings: { type: 'integer', minimum: 1, maximum: 20 },
  nutrition: nutritionSchema,
});
const detectionSchema = object({ ingredients: { type: 'array', maxItems: 40, items: string(100) } });
function matches(value, schema) {
  if (schema.type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === schema.required.length && schema.required.every(key => Object.hasOwn(value, key) && matches(value[key], schema.properties[key]));
  if (schema.type === 'array') return Array.isArray(value) && value.length >= (schema.minItems || 0) && value.length <= schema.maxItems && value.every(item => matches(item, schema.items));
  if (schema.type === 'string') return typeof value === 'string' && value.trim().length >= schema.minLength && value.length <= schema.maxLength && !/[<>\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);
  return typeof value === 'number' && Number.isFinite(value) && value >= schema.minimum && value <= schema.maximum && (schema.type !== 'integer' || Number.isInteger(value));
}
function parseOutput(text, schema) {
  try {
    if (typeof text !== 'string' || text.length > 80000) throw new Error('Invalid size');
    const json = text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1').trim();
    const value = JSON.parse(json);
    if (!matches(value, schema)) throw new Error('Invalid schema');
    return value;
  } catch { throw new AppError(502, 'AI_INVALID_RESPONSE', 'The AI returned an incomplete recipe response. Please try again.'); }
}
module.exports = { recipeSchema, detectionSchema, matches, parseOutput };
