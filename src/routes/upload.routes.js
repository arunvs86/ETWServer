const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// ensure uploads dir exists
const UP_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });

// use disk storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const base = path.basename(file.originalname, ext).replace(/\W+/g, '-').slice(0, 50);
    const stamp = Date.now();
    cb(null, `${base || 'file'}-${stamp}${ext.toLowerCase()}`);
  },
});
const upload = multer({ storage });

// POST /uploads  (expects form-data "file")
router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file' });
  const url = `${req.protocol}://${req.get('host')}/files/${req.file.filename}`;
  res.status(201).json({ url, filename: req.file.filename, ok: true });
});

module.exports = router;
