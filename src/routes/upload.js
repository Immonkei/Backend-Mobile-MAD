const express = require('express');
const multer = require('multer');
const router = express.Router();
const { admin, db } = require('../admin');

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow PDF and common image formats
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word, and image files are allowed'), false);
    }
  }
});

// POST /api/upload/resume - Upload resume/CV
router.post('/resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const userId = req.user.uid;
    const bucket = admin.storage().bucket();
    
    // Generate unique filename
    const fileExtension = req.file.originalname.split('.').pop();
    const fileName = `resumes/${userId}/${Date.now()}_${req.file.originalname}`;
    const file = bucket.file(fileName);

    // Upload file to Firebase Storage
    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
        metadata: {
          uploadedBy: userId,
          uploadedAt: new Date().toISOString(),
          originalName: req.file.originalname
        }
      }
    });

    // Make the file publicly accessible
    await file.makePublic();
    
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    // Update user profile with resume info
    await db.collection('users').doc(userId).update({
      resume: {
        fileName: req.file.originalname,
        fileUrl: publicUrl,
        fileSize: req.file.size,
        uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
        fileType: req.file.mimetype
      },
      resumeUrl: publicUrl // Keep for backward compatibility
    });

    res.json({
      success: true,
      url: publicUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      message: 'Resume uploaded successfully'
    });

  } catch (err) {
    console.error('Upload error:', err);
    
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large. Maximum size is 5MB.' });
    }
    
    res.status(500).json({ message: 'Failed to upload resume: ' + err.message });
  }
});

// DELETE /api/upload/resume - Remove resume
router.delete('/resume', async (req, res) => {
  try {
    const userId = req.user.uid;
    
    // Get user current resume info
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData.resume) {
      return res.status(400).json({ message: 'No resume found to delete' });
    }

    // Delete file from Firebase Storage
    const bucket = admin.storage().bucket();
    const filePath = userData.resume.fileUrl.split('/').slice(3).join('/'); // Get path after storage.googleapis.com/bucket-name/
    const file = bucket.file(filePath);
    
    try {
      await file.delete();
    } catch (storageError) {
      console.log('File not found in storage, continuing with profile update');
    }

    // Update user profile
    await db.collection('users').doc(userId).update({
      resume: null,
      resumeUrl: null
    });

    res.json({
      success: true,
      message: 'Resume deleted successfully'
    });

  } catch (err) {
    console.error('Delete resume error:', err);
    res.status(500).json({ message: 'Failed to delete resume' });
  }
});

// GET /api/upload/resume - Get current resume info
router.get('/resume', async (req, res) => {
  try {
    const userId = req.user.uid;
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    res.json({
      resume: userData.resume || null,
      resumeUrl: userData.resumeUrl || null
    });
  } catch (err) {
    console.error('Get resume error:', err);
    res.status(500).json({ message: 'Failed to get resume info' });
  }
});

module.exports = router;