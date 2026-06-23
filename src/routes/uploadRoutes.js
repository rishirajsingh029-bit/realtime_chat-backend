const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const upload = require('../config/upload');

// upload.single('file') -- expects ONE file, sent under the field
// name "file" in the multipart form data. After this middleware runs,
// multer attaches the file's info onto req.file for us to use.
router.post('/', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Figure out if this is an image or a generic file, so the
  // frontend knows whether to render an <img> or a download link.
  const isImage = /jpeg|jpg|png|gif|webp/i.test(req.file.mimetype);

  res.status(201).json({
    message: 'File uploaded successfully',
    mediaUrl: `/uploads/${req.file.filename}`,
    mediaType: isImage ? 'image' : 'file',
    originalName: req.file.originalname,
  });
});

module.exports = router;