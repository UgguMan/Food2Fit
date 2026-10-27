const router = require('express').Router();
const { body } = require('express-validator');
const controller = require('../controllers/authController');
const auth = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errors');
const { jsonBody, allowFields, validate, emailRule, passwordRule } = require('../middleware/validate');

router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.post('/register', authLimiter, jsonBody, allowFields(['name', 'email', 'password']),
  body('name').isString().withMessage('Name must be text.').bail().trim()
    .isLength({ min: 1, max: 80 }).withMessage('Name must contain 1–80 characters.')
    .matches(/^[^\x00-\x1f\x7f<>]+$/u).withMessage('Name contains unsupported characters.'),
  emailRule(), passwordRule(), validate, asyncHandler(controller.register));
router.post('/login', authLimiter, jsonBody, allowFields(['email', 'password']),
  emailRule(), passwordRule(), validate, asyncHandler(controller.login));
router.get('/me', auth, asyncHandler(controller.me));
module.exports = router;
