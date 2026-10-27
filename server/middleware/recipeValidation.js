const { body, param, query } = require('express-validator');
const { jsonBody, allowFields, validate } = require('./validate');
const { noQuery, noBody } = require('./fitnessValidation');
const safeText = (field, max) => body(field).isString().bail().trim().isLength({ min: 1, max }).matches(/^[^<>\x00-\x1f]+$/u);
const generateRules = () => [noQuery, jsonBody, allowFields(['ingredients', 'cuisine', 'dietType', 'allergies', 'calorieTarget', 'cookingTime', 'servings', 'regenerate']),
  body('ingredients').isArray({ min: 1, max: 40 }), safeText('ingredients.*', 100),
  safeText('cuisine', 80), body('dietType').isString().bail().isIn(['veg', 'non-veg', 'vegan', 'keto']),
  body('allergies').isArray({ max: 30 }), safeText('allergies.*', 80),
  ...[['calorieTarget', 100, 3000], ['cookingTime', 5, 240], ['servings', 1, 20]].map(([field, min, max]) => body(field).custom(value => Number.isInteger(value) && value >= min && value <= max).withMessage(`${field} must be an integer from ${min} to ${max}.`)),
  body('regenerate').optional().isBoolean({ strict: true }), validate];
const idRule = field => body(field).isString().bail().isMongoId();
const refineRules = () => [noQuery, jsonBody, allowFields(['recipeId', 'refinement', 'regenerate']), idRule('recipeId'),
  body('refinement').isString().bail().isIn(['healthier', 'higher-protein']), body('regenerate').optional().isBoolean({ strict: true }), validate];
const saveRules = () => [noQuery, jsonBody, allowFields(['recipeId']), idRule('recipeId'), validate];
const deleteRules = () => [noQuery, noBody, param('id').isMongoId(), validate];
const listRules = () => [noBody,
  (req, res, next) => { const keys = Object.keys(req.query); if (keys.some(key => !['page', 'limit'].includes(key))) return noQuery(req, res, next); next(); },
  query('page').optional().isInt({ min: 1, max: 1000 }).toInt(), query('limit').optional().isInt({ min: 1, max: 50 }).toInt(), validate];
module.exports = { generateRules, refineRules, saveRules, deleteRules, listRules };
