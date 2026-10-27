const { validationResult, matchedData, body } = require('express-validator');
const { AppError } = require('./errors');

const jsonBody = (req, res, next) => {
  if (!req.is('application/json')) return next(new AppError(415, 'JSON_REQUIRED', 'Send an application/json request body.'));
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
    return next(new AppError(400, 'VALIDATION_ERROR', 'Request body must be an object.'));
  }
  next();
};
const allowFields = fields => (req, res, next) => {
  if (Object.keys(req.body || {}).some(key => !fields.includes(key))) {
    return next(new AppError(400, 'VALIDATION_ERROR', 'Request contains unsupported fields.'));
  }
  next();
};
const validate = (req, res, next) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return next(new AppError(400, 'VALIDATION_ERROR', 'Please check the submitted fields.',
      result.array({ onlyFirstError: true }).map(error => ({ field: error.path, message: error.msg }))));
  }
  req.validated = matchedData(req, { locations: ['body', 'params', 'query'] });
  next();
};
const emailRule = () => body('email').isString().withMessage('Email must be text.').bail()
  .trim().isLength({ max: 254 }).isEmail().withMessage('Enter a valid email address.').bail().toLowerCase();
const passwordRule = () => body('password').isString().withMessage('Password must be text.').bail()
  .custom(value => value.length >= 12 && Buffer.byteLength(value, 'utf8') <= 72)
  .withMessage('Use at least 12 characters and at most 72 UTF-8 bytes.');
module.exports = { jsonBody, allowFields, validate, emailRule, passwordRule };
