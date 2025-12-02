const express = require('express');
const router = express.Router();
const { db, admin } = require('../admin');
const { sendNotificationToUsers } = require('../utils/fcm');

// POST /api/apply/:id/apply
router.post('/:id/apply', async (req, res) => {
  try {
    const jobId = req.params.id;
    const uid = req.user.uid;
    const { resumeUrl, coverLetter, useSavedResume = true } = req.body;

    // Check if user has already applied
    const q = await db.collection('applications')
      .where('jobId', '==', jobId)
      .where('userId', '==', uid)
      .get();
    
    if (!q.empty) return res.status(400).json({ message: 'Already applied' });

    // Get user's profile to check for saved resume
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    
    let finalResumeUrl = resumeUrl;
    let usedSavedResume = false;

    // Determine which resume to use
    if (useSavedResume && userData.resumeUrl) {
      // Use user's saved resume from profile
      finalResumeUrl = userData.resumeUrl;
      usedSavedResume = true;
    } else if (resumeUrl) {
      // Use the resume URL provided in the request
      finalResumeUrl = resumeUrl;
      usedSavedResume = false;
    } else {
      // No resume available
      return res.status(400).json({ 
        message: 'No resume provided. Please upload a resume first or provide a resume URL.',
        suggestion: 'Use POST /api/upload/resume to upload a resume first'
      });
    }

    // Create application
    const appRef = db.collection('applications').doc();
    await appRef.set({ 
      jobId, 
      userId: uid, 
      resumeUrl: finalResumeUrl, 
      coverLetter, 
      status: 'pending', 
      appliedAt: admin.firestore.FieldValue.serverTimestamp(),
      usedSavedResume: usedSavedResume
    });

    // Increment applicants count
    await db.collection('jobs').doc(jobId).update({ 
      applicantsCount: admin.firestore.FieldValue.increment(1) 
    });

    // Notify admins
    const adminsSnap = await db.collection('users').where('role', '==', 'admin').get();
    const adminUids = adminsSnap.docs.map(d => d.id);
    
    await sendNotificationToUsers(adminUids, { 
      title: 'New Job Application', 
      body: `User ${userData.fullName || uid} applied to job ${jobId}` 
    });

    res.json({ 
      success: true,
      message: 'Application submitted successfully',
      usedSavedResume: usedSavedResume,
      resumeUrl: finalResumeUrl
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET my applications
router.get('/', async (req, res) => {
  try {
    const uid = req.user.uid;
    const snap = await db.collection('applications')
      .where('userId', '==', uid)
      .orderBy('appliedAt', 'desc')
      .get();
    
    const apps = snap.docs.map(d => ({ 
      id: d.id, 
      ...d.data(),
      // Add job details for each application
      job: null // You can populate this later if needed
    }));
    
    res.json({ data: apps });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;