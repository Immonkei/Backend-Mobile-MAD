const express = require('express');
const router = express.Router();
const { admin, db } = require('../admin');

// GET /api/users/me - Get my profile
router.get('/me', async (req, res) => {
  try {
    const userId = req.user.uid;
    
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'User profile not found' 
      });
    }
    
    const userData = userDoc.data();
    
    // Remove sensitive data if needed
    const safeData = { ...userData };
    
    res.json({
      success: true,
      user: {
        uid: userId,
        email: req.user.email,
        ...safeData
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch profile',
      message: error.message 
    });
  }
});

// PUT /api/users/me - Update my profile
router.put('/me', async (req, res) => {
  try {
    const userId = req.user.uid;
    const updates = req.body;
    
    // List of allowed fields to update
    const allowedFields = [
      'fullName', 'phone', 'location', 'headline',
      'skills', 'experience', 'education', 'bio',
      'linkedin', 'github', 'portfolio', 'preferences'
    ];
    
    // Filter updates to only allowed fields
    const filteredUpdates = {};
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });
    
    // Add updated timestamp
    filteredUpdates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    filteredUpdates.profileComplete = true;
    
    await db.collection('users').doc(userId).update(filteredUpdates);
    
    // Get updated user data
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        uid: userId,
        email: req.user.email,
        ...userData
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update profile',
      message: error.message 
    });
  }
});

// PUT /api/users/me/password - Change password
router.put('/me/password', async (req, res) => {
  try {
    const userId = req.user.uid;
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        error: 'Current password and new password are required' 
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false,
        error: 'New password must be at least 6 characters' 
      });
    }
    
    // Note: Firebase Admin SDK doesn't have direct password change
    // This should be done via Firebase Client SDK or REST API
    // For now, we'll return instructions
    
    res.json({
      success: true,
      message: 'Please use Firebase Client SDK to change password',
      instruction: 'Call updatePassword() on the authenticated user object'
    });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to change password',
      message: error.message 
    });
  }
});

// GET /api/users/me/applications - Get my applications (alias for /api/apply)
router.get('/me/applications', async (req, res) => {
  try {
    const userId = req.user.uid;
    
    const snapshot = await db.collection('applications')
      .where('userId', '==', userId)
      .orderBy('appliedAt', 'desc')
      .get();
    
    const applications = [];
    snapshot.forEach(doc => {
      applications.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Get job details for each
    const applicationsWithDetails = await Promise.all(
      applications.map(async (app) => {
        try {
          const jobDoc = await db.collection('jobs').doc(app.jobId).get();
          if (jobDoc.exists) {
            app.job = {
              id: jobDoc.id,
              title: jobDoc.data().title,
              company: jobDoc.data().company,
              location: jobDoc.data().location
            };
          }
        } catch (error) {
          console.error(`Error fetching job ${app.jobId}:`, error);
        }
        return app;
      })
    );
    
    res.json({
      success: true,
      applications: applicationsWithDetails,
      total: applications.length
    });
  } catch (error) {
    console.error('Get user applications error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch applications',
      message: error.message 
    });
  }
});

// GET /api/users/me/stats - Get my statistics
router.get('/me/stats', async (req, res) => {
  try {
    const userId = req.user.uid;
    
    const [applicationsSnap, userDoc] = await Promise.all([
      db.collection('applications')
        .where('userId', '==', userId)
        .get(),
      db.collection('users').doc(userId).get()
    ]);
    
    const userData = userDoc.data();
    
    // Calculate stats
    const applications = [];
    applicationsSnap.forEach(doc => {
      applications.push(doc.data());
    });
    
    const stats = {
      totalApplications: applications.length,
      pending: applications.filter(app => app.status === 'pending').length,
      reviewed: applications.filter(app => app.status === 'reviewed').length,
      shortlisted: applications.filter(app => app.status === 'shortlisted').length,
      interview: applications.filter(app => app.status === 'interview').length,
      accepted: applications.filter(app => app.status === 'accepted').length,
      rejected: applications.filter(app => app.status === 'rejected').length,
      totalFavorites: userData?.favorites?.length || 0,
      profileComplete: userData?.profileComplete || false
    };
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch statistics',
      message: error.message 
    });
  }
});

module.exports = router;