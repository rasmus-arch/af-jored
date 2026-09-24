const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');

const IMAGE_DIR = path.join(__dirname, '..', 'public', 'uploads', 'images');
const DOCUMENT_DIR = path.join(__dirname, '..', '..', 'uploads', 'documents');

fs.mkdirSync(IMAGE_DIR, { recursive: true });
fs.mkdirSync(DOCUMENT_DIR, { recursive: true });

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);
const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
]);

function randomFilename(originalname) {
  const ext = path.extname(originalname).toLowerCase();
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGE_DIR),
  filename: (req, file, cb) => cb(null, randomFilename(file.originalname)),
});

const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DOCUMENT_DIR),
  filename: (req, file, cb) => cb(null, randomFilename(file.originalname)),
});

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: config.uploadMaxSizeMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      return cb(new Error('Endast JPEG, PNG, WEBP eller SVG-bilder är tillåtna.'));
    }
    return cb(null, true);
  },
});

const uploadDocument = multer({
  storage: documentStorage,
  limits: { fileSize: config.uploadMaxSizeMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_DOCUMENT_TYPES.has(file.mimetype)) {
      return cb(new Error('Filtypen stöds inte.'));
    }
    return cb(null, true);
  },
});

function imagePublicUrl(filename) {
  return `/uploads/images/${filename}`;
}

module.exports = { uploadImage, uploadDocument, imagePublicUrl, DOCUMENT_DIR };
