const { body, query } = require('express-validator');
const { ACTIVITY, GOALS, DIETS, ALLERGENS, normalizeAllergen } = require('../services/fitnessConstants');
const { jsonBody, allowFields, validate } = require('./validate');
const { AppError } = require('./errors');
const fields = ['age', 'gender', 'height', 'weight', 'activityLevel', 'goal', 'dietPreference', 'allergies', 'workoutDays', 'equipment'];
const numeric = (field, min, max, integer = false) => body(field).custom(value => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value))).withMessage(`${field} must be a number from ${min} to ${max}${integer ? ' (whole number)' : ''}.`);
const choice = (field, values) => body(field).isString().bail().isIn(values).withMessage(`Choose a supported ${field}.`);
const profileRules = () => [jsonBody, allowFields(fields),
  numeric('age', 18, 100, true), numeric('height', 100, 250), numeric('weight', 30, 350), numeric('workoutDays', 1, 7, true),
  choice('gender', ['male', 'female']), choice('activityLevel', Object.keys(ACTIVITY)), choice('goal', GOALS), choice('dietPreference', DIETS), choice('equipment', ['none', 'home', 'gym']),
  body('allergies').isArray({ max: 30 }).withMessage('Allergies must be a list of supported allergens.'),
  body('allergies.*').isString().bail().customSanitizer(normalizeAllergen).isIn(ALLERGENS).withMessage('Unsupported allergen. Add it to the dataset taxonomy before generating a plan.'), validate,
];
const noQuery = (req, res, next) => Object.keys(req.query).length
  ? next(new AppError(400, 'VALIDATION_ERROR', 'This endpoint does not accept query parameters.')) : next();
const noBody = (req, res, next) => req.body !== undefined && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)
  ? next(new AppError(400, 'VALIDATION_ERROR', 'This endpoint does not accept a request body.')) : next();
const progressRules = () => [jsonBody, allowFields(['date', 'weight', 'notes']), numeric('weight', 30, 350),
  body('date').isString().bail().matches(/^\d{4}-\d{2}-\d{2}$/).bail().custom(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '2000-01-01' && date.getTime() <= Date.now() + 86400000;
  }).withMessage('Use a real date from 2000 through today (one-day timezone tolerance).'),
  body('notes').optional().isString().bail().trim().isLength({ max: 500 }).matches(/^[^\x00-\x1f<>]*$/u), validate];
const progressQuery = [
  (req, res, next) => Object.keys(req.query).some(key => key !== 'limit') ? next(new AppError(400, 'VALIDATION_ERROR', 'Unsupported query parameter.')) : next(),
  query('limit').optional().isInt({ min: 1, max: 365 }).toInt(), validate,
];
module.exports = { profileRules, progressRules, progressQuery, noQuery, noBody };
