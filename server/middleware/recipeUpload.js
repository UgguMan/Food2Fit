const multer = require('multer');
const sharp = require('sharp');
const { AppError, asyncHandler } = require('./errors');
const MIME = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
const parseUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
  fileFilter(req, file, callback) { callback(MIME[file.mimetype] ? null : new AppError(415, 'INVALID_IMAGE', 'Upload a JPEG, PNG or WebP photo.'), Boolean(MIME[file.mimetype])); },
}).single('image');
const upload = (req, res, next) => parseUpload(req, res, error => {
  if (error && !(error instanceof AppError) && error.name !== 'MulterError') return next(new AppError(400, 'INVALID_UPLOAD', 'The image upload is incomplete or malformed.'));
  next(error);
});
const prepareImage = asyncHandler(async (req, res, next) => {
  if (!req.file) throw new AppError(400, 'IMAGE_REQUIRED', 'Choose an ingredient or dish photo.');
  try {
    const decoder = sharp(req.file.buffer, { limitInputPixels: 16000000, failOn: 'warning' });
    const metadata = await decoder.metadata();
    if (metadata.format !== MIME[req.file.mimetype] || (metadata.pages || 1) !== 1) throw new Error('Unsupported image');
    const buffer = await decoder.rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    req.ingredientImage = { mimeType: 'image/jpeg', data: buffer.toString('base64') };
  } catch { throw new AppError(400, 'INVALID_IMAGE', 'That image could not be read. Use a non-animated JPEG, PNG or WebP under 2 MB and 16 megapixels.'); }
  finally { delete req.file; }
  next();
});
module.exports = { upload, prepareImage };
