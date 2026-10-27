const router = require('express').Router();
const auth = require('../middleware/auth');
const { aiIpLimiter, aiUserLimiter } = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errors');
const { noQuery } = require('../middleware/fitnessValidation');
const { generateRules, refineRules, saveRules, deleteRules, listRules } = require('../middleware/recipeValidation');
const { upload, prepareImage } = require('../middleware/recipeUpload');
const controller = require('../controllers/recipeController');
const service = require('../services/recipeService');
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(auth);
const limits = [aiIpLimiter, aiUserLimiter];
router.post('/generate', limits, generateRules(), asyncHandler(controller.generate));
router.post('/refine', limits, refineRules(), asyncHandler(controller.refine));
router.post('/detect-ingredients', limits, noQuery, upload, prepareImage, asyncHandler(controller.detect));
router.post('/save', saveRules(), asyncHandler(controller.save));
router.get('/history', listRules(), asyncHandler(controller.history));
router.get('/favorites', listRules(), asyncHandler(controller.favorites));
router.delete('/favorites/:id', deleteRules(), asyncHandler(controller.unsave));
router.delete('/:id', deleteRules(), asyncHandler(controller.remove));
router.use(async (error, req, res, next) => {
  if (req.user && (String(error.code).startsWith('AI_') || error.code === 'RATE_LIMITED')) {
    try { error.details = { savedRecipes: await service.fallback(req.user._id) }; } catch { /* Preserve the original public error if storage is unavailable. */ }
  }
  next(error);
});
module.exports = router;
