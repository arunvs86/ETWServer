// const express = require('express');
// const multer = require('multer');
// const path = require('path');
// const fs = require('fs');

// const router = express.Router();

// // ensure uploads dir exists
// const UP_DIR = path.join(__dirname, '..', '..', 'uploads');
// if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });

// // use disk storage
// const storage = multer.diskStorage({
//   destination: (_req, _file, cb) => cb(null, UP_DIR),
//   filename: (_req, file, cb) => {
//     const ext = path.extname(file.originalname) || '';
//     const base = path.basename(file.originalname, ext).replace(/\W+/g, '-').slice(0, 50);
//     const stamp = Date.now();
//     cb(null, `${base || 'file'}-${stamp}${ext.toLowerCase()}`);
//   },
// });
// const upload = multer({ storage });

// // POST /uploads  (expects form-data "file")
// router.post('/', upload.single('file'), (req, res) => {
//   if (!req.file) return res.status(400).json({ message: 'No file' });
//   const url = `${req.protocol}://${req.get('host')}/files/${req.file.filename}`;
//   res.status(201).json({ url, filename: req.file.filename, ok: true });
// });

// module.exports = router;


const express = require('express');
const multer = require('multer');
const path = require('path');
const cloudinary = require('../lib/cloudinary');

// Keep the same router & endpoint
const router = express.Router();

// Switch to memory storage so we can stream to Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Utility to build a clean public_id (keeps your old filename style)
function buildPublicId(originalname = '') {
  const ext = path.extname(originalname) || '';
  const base = path.basename(originalname, ext).replace(/\W+/g, '-').slice(0, 50) || 'file';
  const stamp = Date.now();
  // no extension in public_id; Cloudinary manages that
  return `${base}-${stamp}`;
}

/**
 * POST /uploads
 * form-data: "file" (unchanged)
 * Response: { url, filename, ok } (unchanged keys)
 *   - url: Cloudinary secure_url
 *   - filename: Cloudinary public_id (use this to delete later)
 */
// router.post('/', upload.single('file'), async (req, res) => {
//   try {
//     if (!req.file) return res.status(400).json({ message: 'No file' });

//     const folder = (process.env.CLOUDINARY_UPLOAD_FOLDER || 'uploads').trim();
//     const public_id = buildPublicId(req.file.originalname);

//     // Upload via stream so we don't write to disk
//     const result = await new Promise((resolve, reject) => {
//       const stream = cloudinary.uploader.upload_stream(
//         {
//           folder,
//           public_id,
//           resource_type: 'auto', // handles image/video/audio automatically
//           // Optional best-practice defaults:
//           // use_filename: true, unique_filename: false, overwrite: false
//         },
//         (err, res) => (err ? reject(err) : resolve(res))
//       );
//       stream.end(req.file.buffer);
//     });

//     // Keep the response shape your FE already expects
//     // url -> result.secure_url; filename -> public_id
//     res.status(201).json({
//       url: result.secure_url,
//       filename: result.public_id,  // store this to delete later
//       ok: true,
//       // You may also return result.resource_type, width/height/duration if you like
//     });
//   } catch (e) {
//     console.error('[uploads] cloudinary error:', e);
//     res.status(500).json({ message: 'Upload failed' });
//   }
// });

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file' });

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(500).json({ message: 'Cloudinary env vars missing' });
    }

    const folder = (process.env.CLOUDINARY_UPLOAD_FOLDER || 'uploads').trim();
    const public_id = buildPublicId(req.file.originalname);

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, public_id, resource_type: 'auto' },
        (err, res) => (err ? reject(err) : resolve(res))
      );
      stream.end(req.file.buffer);
    });

    res.status(201).json({
      url: result.secure_url,
      filename: result.public_id,
      ok: true,
      // type: result.resource_type
    });
  } catch (e) {
    console.error('[uploads] cloudinary error:', e);
    res.status(500).json({ message: 'Upload failed', error: e?.message || 'unknown' });
  }
});

/**
 * OPTIONAL: delete route using the "filename" (public_id) you stored
 * POST /uploads/delete { filename: "<public_id>" }
 */
router.post('/delete', express.json(), async (req, res) => {
  try {
    const { filename } = req.body || {};
    if (!filename) return res.status(400).json({ message: 'filename (public_id) required' });

    const result = await cloudinary.uploader.destroy(filename, { resource_type: 'auto' });
    res.json(result); // { result: 'ok' } on success
  } catch (e) {
    console.error('[uploads] delete error:', e);
    res.status(500).json({ message: 'Delete failed' });
  }
});

module.exports = router;
