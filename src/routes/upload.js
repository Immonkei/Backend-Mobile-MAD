// src/routes/upload.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { admin, db } = require('../admin');
const { validateFileUpload } = require('../middleware/validation');

// Use explicit env var if provided, otherwise use serverless tmp dir
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'uploads');

// Ensure upload directory exists, but don't crash if it fails
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log('Upload directory ready:', UPLOAD_DIR);
} catch (err) {
  console.warn('Could not create upload directory (falling back). Error:', err && err.message);
}

// Configure multer for file upload to UPLOAD_DIR
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/jpg'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, DOC, DOCX, JPG, PNG files are allowed.'));
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Helper: build public URL for returned file path (note: ephemeral on serverless)
function buildFileUrl(filename) {
  // If you serve uploads in dev via server.static, URLs will be /uploads/<name>
  // In production, this is ephemeral — consider uploading to Firebase Storage / S3.
  return `/uploads/${filename}`;
}

// POST /api/upload/resume - Upload resume
router.post('/resume', upload.single('resume'), validateFileUpload, async (req, res) => {
  try {
    const userId = req.user.uid;
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    const fileUrl = buildFileUrl(req.file.filename);
    
    // Update user's resume URL in Firestore
    await db.collection('users').doc(userId).update({
      resumeUrl: fileUrl,
      resumeFileName: req.file.originalname,
      resumeFileSize: req.file.size,
      resumeUploadedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      message: 'Resume uploaded successfully',
      file: {
        url: fileUrl,
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Upload resume error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    res.status(500).json({
      success: false,
      error: 'Failed to upload resume',
      message: error.message
    });
  }
});

// POST /api/upload/profile-picture - Upload profile picture
router.post('/profile-picture', upload.single('profilePicture'), async (req, res) => {
  try {
    const userId = req.user.uid;
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    if (!req.file.mimetype.startsWith('image/')) {
      if (fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
      return res.status(400).json({ success: false, error: 'Only image files are allowed' });
    }
    
    const fileUrl = buildFileUrl(req.file.filename);
    
    await db.collection('users').doc(userId).update({
      profilePicture: fileUrl,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      message: 'Profile picture uploaded successfully',
      file: {
        url: fileUrl,
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Upload profile picture error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({
      success: false,
      error: 'Failed to upload profile picture',
      message: error.message
    });
  }
});

// DELETE /api/upload/resume - Delete resume
router.delete('/resume', async (req, res) => {
  try {
    const userId = req.user.uid;
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData || !userData.resumeUrl) {
      return res.status(400).json({ success: false, error: 'No resume found' });
    }
    
    const fileName = userData.resumeUrl.split('/').pop();
    const filePath = path.join(UPLOAD_DIR, fileName);
    
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) { console.warn('Failed to delete file:', e.message); }
    }
    
    await db.collection('users').doc(userId).update({
      resumeUrl: null,
      resumeFileName: null,
      resumeFileSize: null,
      resumeUploadedAt: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ success: true, message: 'Resume deleted successfully' });
  } catch (error) {
    console.error('Delete resume error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete resume', message: error.message });
  }
});

// GET /api/upload/files - Get user's uploaded files
router.get('/files', async (req, res) => {
  try {
    const userId = req.user.uid;
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const files = [];
    
    if (userData && userData.resumeUrl) {
      files.push({
        type: 'resume',
        url: userData.resumeUrl,
        name: userData.resumeFileName,
        size: userData.resumeFileSize,
        uploadedAt: userData.resumeUploadedAt
      });
    }
    
    if (userData && userData.profilePicture) {
      files.push({
        type: 'profilePicture',
        url: userData.profilePicture,
        name: 'profile-picture.jpg',
        uploadedAt: userData.updatedAt
      });
    }
    
    res.json({ success: true, files, total: files.length });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch files', message: error.message });
  }
});

module.exports = router;
