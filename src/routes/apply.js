const express = require('express');
const router = express.Router();
const { admin, db } = require('../admin');
const { validateFileUpload } = require('../middleware/validation');


// POST /api/apply/:jobId/apply - Apply for a job
router.post('/:jobId/apply', async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const userId = req.user.uid;
    const { coverLetter, additionalInfo } = req.body;

    // Check if job exists
    const jobDoc = await db.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'Job not found' 
      });
    }

    const jobData = jobDoc.data();
    
    // Check if job is accepting applications
    if (jobData.status !== 'published') {
      return res.status(400).json({ 
        success: false,
        error: 'This job is no longer accepting applications' 
      });
    }

    // Check application deadline
    if (jobData.applicationDeadline) {
      const deadline = new Date(jobData.applicationDeadline);
      if (deadline < new Date()) {
        return res.status(400).json({ 
          success: false,
          error: 'Application deadline has passed' 
        });
      }
    }

    // Check if user has already applied
    const existingAppQuery = await db.collection('applications')
      .where('jobId', '==', jobId)
      .where('userId', '==', userId)
      .limit(1)
      .get();
    
    if (!existingAppQuery.empty) {
      const existingApp = existingAppQuery.docs[0].data();
      return res.status(400).json({ 
        success: false,
        error: 'You have already applied to this job',
        applicationId: existingAppQuery.docs[0].id,
        status: existingApp.status,
        appliedAt: existingApp.appliedAt
      });
    }

    // Get user's resume
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData.resumeUrl) {
      return res.status(400).json({ 
        success: false,
        error: 'Please upload a resume before applying',
        suggestion: 'Use POST /api/upload/resume to upload your resume'
      });
    }

    // Create application
    const appRef = db.collection('applications').doc();
    const applicationData = {
      jobId,
      userId,
      jobTitle: jobData.title,
      jobCompany: jobData.company,
      userName: userData.fullName || userData.email,
      userEmail: userData.email,
      userPhone: userData.phone || '',
      resumeUrl: userData.resumeUrl,
      coverLetter: coverLetter || '',
      additionalInfo: additionalInfo || {},
      status: 'pending',
      stage: 'applied',
      appliedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      viewedByAdmin: false,
      notes: ''
    };

    await appRef.set(applicationData);

    // Update job applicants count
    await db.collection('jobs').doc(jobId).update({
      applicantsCount: admin.firestore.FieldValue.increment(1),
      lastApplicationAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update user's application count
    await db.collection('users').doc(userId).update({
      applicationsCount: admin.firestore.FieldValue.increment(1),
      lastAppliedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // TODO: Send notifications

    res.json({
      success: true,
      message: 'Application submitted successfully',
      applicationId: appRef.id,
      appliedAt: new Date().toISOString(),
      nextSteps: 'Your application is under review. You will be notified of any updates.'
    });
  } catch (error) {
    console.error('Application error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to submit application',
      message: error.message 
    });
  }
});

// GET /api/apply/check/:jobId - Check if already applied
router.get('/check/:jobId', async (req, res) => {
  try {
    const userId = req.user.uid;
    const jobId = req.params.jobId;

    const query = await db.collection('applications')
      .where('jobId', '==', jobId)
      .where('userId', '==', userId)
      .limit(1)
      .get();
    
    if (query.empty) {
      return res.json({
        success: true,
        hasApplied: false,
        canApply: true
      });
    }

    const appDoc = query.docs[0];
    const appData = appDoc.data();
    
    res.json({
      success: true,
      hasApplied: true,
      applicationId: appDoc.id,
      status: appData.status,
      appliedAt: appData.appliedAt,
      canApply: false,
      message: 'You have already applied to this job'
    });
  } catch (error) {
    console.error('Check application error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to check application status',
      message: error.message 
    });
  }
});

// GET /api/apply - Get my applications
router.get('/', async (req, res) => {
  try {
    const userId = req.user.uid;
    const { 
      status, 
      page = 1, 
      limit = 20,
      sortBy = 'appliedAt',
      order = 'desc'
    } = req.query;

    let query = db.collection('applications')
      .where('userId', '==', userId);

    if (status) {
      query = query.where('status', '==', status);
    }

    // Sorting
    if (sortBy === 'appliedAt') {
      query = order === 'asc' 
        ? query.orderBy('appliedAt', 'asc')
        : query.orderBy('appliedAt', 'desc');
    }

    const snapshot = await query.get();
    const total = snapshot.size;
    const startAt = (page - 1) * limit;
    
    const applications = [];
    let count = 0;
    
    snapshot.forEach(doc => {
      if (count >= startAt && applications.length < limit) {
        applications.push({
          id: doc.id,
          ...doc.data()
        });
      }
      count++;
    });

    // Get job details for each application
    const applicationsWithDetails = await Promise.all(
      applications.map(async (app) => {
        try {
          const jobDoc = await db.collection('jobs').doc(app.jobId).get();
          if (jobDoc.exists) {
            const jobData = jobDoc.data();
            app.job = {
              id: jobDoc.id,
              title: jobData.title,
              company: jobData.company,
              location: jobData.location,
              type: jobData.type,
              status: jobData.status
            };
          }
        } catch (error) {
          console.error(`Error fetching job ${app.jobId}:`, error);
          app.job = null;
        }
        return app;
      })
    );

    const totalPages = Math.ceil(total / limit);

    // Calculate status counts
    const statusCounts = {
      pending: 0,
      reviewed: 0,
      shortlisted: 0,
      interview: 0,
      accepted: 0,
      rejected: 0,
      withdrawn: 0
    };

    snapshot.forEach(doc => {
      const appData = doc.data();
      if (statusCounts[appData.status] !== undefined) {
        statusCounts[appData.status]++;
      }
    });

    res.json({
      success: true,
      applications: applicationsWithDetails,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalItems: total,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit: Number(limit)
      },
      summary: {
        total,
        ...statusCounts
      }
    });
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch applications',
      message: error.message 
    });
  }
});

// GET /api/apply/:applicationId - Get single application
router.get('/:applicationId', async (req, res) => {
  try {
    const userId = req.user.uid;
    const { applicationId } = req.params;

    const appDoc = await db.collection('applications').doc(applicationId).get();
    
    if (!appDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'Application not found' 
      });
    }

    const appData = appDoc.data();

    // Check if user owns the application
    if (appData.userId !== userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Not authorized to view this application' 
      });
    }

    // Get job details
    const jobDoc = await db.collection('jobs').doc(appData.jobId).get();
    let jobDetails = null;
    
    if (jobDoc.exists) {
      const jobData = jobDoc.data();
      jobDetails = {
        id: jobDoc.id,
        title: jobData.title,
        company: jobData.company,
        location: jobData.location,
        type: jobData.type,
        description: jobData.description,
        salary: jobData.salary,
        requirements: jobData.requirements
      };
    }

    res.json({
      success: true,
      application: {
        id: appDoc.id,
        ...appData,
        job: jobDetails
      },
      canWithdraw: ['pending', 'reviewed', 'shortlisted'].includes(appData.status)
    });
  } catch (error) {
    console.error('Get application error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch application',
      message: error.message 
    });
  }
});

// DELETE /api/apply/:applicationId - Withdraw application
router.delete('/:applicationId', async (req, res) => {
  try {
    const userId = req.user.uid;
    const { applicationId } = req.params;

    const appDoc = await db.collection('applications').doc(applicationId).get();
    
    if (!appDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'Application not found' 
      });
    }

    const appData = appDoc.data();

    // Check if user owns the application
    if (appData.userId !== userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Not authorized to withdraw this application' 
      });
    }

    // Check if application can be withdrawn
    const cannotWithdrawStatuses = ['accepted', 'hired'];
    if (cannotWithdrawStatuses.includes(appData.status)) {
      return res.status(400).json({ 
        success: false,
        error: `Cannot withdraw application that has been ${appData.status}`,
        allowedStatuses: ['pending', 'reviewed', 'shortlisted', 'rejected']
      });
    }

    // Update status to withdrawn
    await db.collection('applications').doc(applicationId).update({
      status: 'withdrawn',
      withdrawnAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });

    // Decrement job applicants count (optional)
    // await db.collection('jobs').doc(appData.jobId).update({
    //   applicantsCount: admin.firestore.FieldValue.increment(-1)
    // });

    // Decrement user's application count
    await db.collection('users').doc(userId).update({
      applicationsCount: admin.firestore.FieldValue.increment(-1)
    });

    res.json({
      success: true,
      message: 'Application withdrawn successfully',
      applicationId,
      withdrawnAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Withdraw application error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to withdraw application',
      message: error.message 
    });
  }
});

module.exports = router;