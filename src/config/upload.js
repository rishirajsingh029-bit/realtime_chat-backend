const multer = require('multer');
const path = require('path');

// Tell multer exactly WHERE and HOW to save uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // save into our uploads/ folder
  },
  filename: (req, file, cb) => {
    // Avoid filename collisions: prefix with a timestamp + random number
    // so two people uploading "photo.jpg" don't overwrite each other.
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname); // e.g. ".jpg"
    cb(null, uniqueSuffix + ext);
  },
});

// Only allow specific file types, and cap the size, so someone can't
// upload a 2GB video or an .exe file disguised as media.
const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|txt|docx/;

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.test(ext)) {
    cb(null, true); // accept
  } else {
    cb(new Error('File type not allowed'), false); // reject
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

module.exports = upload;