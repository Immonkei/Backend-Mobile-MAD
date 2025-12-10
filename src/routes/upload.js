const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { admin, db } = require('../admin');
const { validateFileUpload } = require('../middleware/validation');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
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

// Ensure uploads directory exists
const fs = require('fs');
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
}

// POST /api/upload/resume - Upload resume
router.post('/resume', upload.single('resume'), validateFileUpload, async (req, res) => {
  try {
    const userId = req.user.uid;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }
    
    // Create file URL (in production, you'd upload to cloud storage)
    const fileUrl = `/uploads/${req.file.filename}`;
    
    // Update user's resume URL
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
    
    // Delete uploaded file if error occurred
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
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
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }
    
    // Check if file is an image
    if (!req.file.mimetype.startsWith('image/')) {
      // Delete uploaded file
      fs.unlinkSync(req.file.path);
      
      return res.status(400).json({
        success: false,
        error: 'Only image files are allowed'
      });
    }
    
    // Create file URL
    const fileUrl = `/uploads/${req.file.filename}`;
    
    // Update user's profile picture URL
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
    
    // Delete uploaded file if error occurred
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
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
    
    // Get current user data
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData.resumeUrl) {
      return res.status(400).json({
        success: false,
        error: 'No resume found'
      });
    }
    
    // Extract filename from URL
    const fileName = userData.resumeUrl.split('/').pop();
    const filePath = path.join('uploads', fileName);
    
    // Delete file from filesystem
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Remove resume data from user document
    await db.collection('users').doc(userId).update({
      resumeUrl: null,
      resumeFileName: null,
      resumeFileSize: null,
      resumeUploadedAt: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      message: 'Resume deleted successfully'
    });
  } catch (error) {
    console.error('Delete resume error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete resume',
      message: error.message
    });
  }
});

// GET /api/upload/files - Get user's uploaded files
router.get('/files', async (req, res) => {
  try {
    const userId = req.user.uid;
    
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    const files = [];
    
    if (userData.resumeUrl) {
      files.push({
        type: 'resume',
        url: userData.resumeUrl,
        name: userData.resumeFileName,
        size: userData.resumeFileSize,
        uploadedAt: userData.resumeUploadedAt
      });
    }
    
    if (userData.profilePicture) {
      files.push({
        type: 'profilePicture',
        url: userData.profilePicture,
        name: 'profile-picture.jpg',
        uploadedAt: userData.updatedAt
      });
    }
    
    res.json({
      success: true,
      files,
      total: files.length
    });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch files',
      message: error.message
    });
  }
});

// Serve uploaded files statically
// Add this to your server.js: app.use('/uploads', express.static('uploads'));

module.exports = router;