const express = require('express');
const router = express.Router();
const { admin, db } = require('../admin');
const { validateJobPost } = require('../middleware/validation');

// Middleware to check admin role
const checkAdmin = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (userData.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'Admin access required' 
      });
    }
    
    next();
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to verify admin role' 
    });
  }
};

// Apply admin check to all routes
router.use(checkAdmin);

// POST /api/admin/jobs - Create a new job
router.post('/', validateJobPost, async (req, res) => {
  try {
    const userId = req.user.uid;
    const {
      title,
      description,
      company,
      location,
      type = 'full-time',
      employmentType = 'permanent',
      category = 'general',
      remote = false,
      experienceLevel = 'entry',
      salary = { min: 0, max: 0, currency: 'USD' },
      requirements = [],
      benefits = [],
      skills = [],
      tags = [],
      applicationDeadline = null,
      applicationLink = '',
      companyLogo = '',
      status = 'published'
    } = req.body;

    // Create job document
    const jobRef = db.collection('jobs').doc();
    const jobData = {
      title,
      description,
      company,
      location,
      type,
      employmentType,
      category,
      remote,
      experienceLevel,
      salary,
      requirements,
      benefits,
      skills,
      tags,
      applicationDeadline: applicationDeadline ? new Date(applicationDeadline) : null,
      applicationLink,
      companyLogo,
      status,
      postedBy: userId,
      postedByName: req.user.email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      applicantsCount: 0,
      views: 0,
      featured: false
    };

    await jobRef.set(jobData);

    res.status(201).json({
      success: true,
      message: 'Job created successfully',
      job: {
        id: jobRef.id,
        ...jobData
      }
    });
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create job',
      message: error.message 
    });
  }
});

// PUT /api/admin/jobs/:id - Update a job
router.put('/:id', validateJobPost, async (req, res) => {
  try {
    const jobId = req.params.id;
    const updates = req.body;
    
    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    
    if (!jobDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'Job not found' 
      });
    }
    
    // Fields that cannot be updated
    const restrictedFields = [
      'postedBy', 'postedByName', 'createdAt',
      'applicantsCount', 'views'
    ];
    
    // Filter updates
    const filteredUpdates = { ...updates };
    restrictedFields.forEach(field => {
      delete filteredUpdates[field];
    });
    
    // Add updated timestamp
    filteredUpdates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    
    await jobRef.update(filteredUpdates);
    
    // Get updated job
    const updatedDoc = await jobRef.get();
    
    res.json({
      success: true,
      message: 'Job updated successfully',
      job: {
        id: updatedDoc.id,
        ...updatedDoc.data()
      }
    });
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update job',
      message: error.message 
    });
  }
});

// DELETE /api/admin/jobs/:id - Delete a job
router.delete('/:id', async (req, res) => {
  try {
    const jobId = req.params.id;
    
    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    
    if (!jobDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'Job not found' 
      });
    }
    
    // Soft delete - change status to archived
    await jobRef.update({
      status: 'archived',
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      archivedBy: req.user.uid
    });
    
    // Optionally delete all applications for this job
    if (req.query.deleteApplications === 'true') {
      const applicationsSnap = await db.collection('applications')
        .where('jobId', '==', jobId)
        .get();
      
      const batch = db.batch();
      applicationsSnap.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    }
    
    res.json({
      success: true,
      message: 'Job archived successfully'
    });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete job',
      message: error.message 
    });
  }
});

// GET /api/admin/jobs - Get all jobs (admin view)
router.get('/', async (req, res) => {
  try {
    const {
      status,
      page = 1,
      limit = 50,
      search,
      company
    } = req.query;
    
    let query = db.collection('jobs');
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    if (company) {
      query = query.where('company', '==', company);
    }
    
    // Search in title and description
    // Note: Firestore doesn't support native full-text search
    // This is a basic implementation
    
    query = query.orderBy('createdAt', 'desc');
    
    const snapshot = await query.get();
    const total = snapshot.size;
    const startAt = (page - 1) * limit;
    
    const jobs = [];
    let count = 0;
    
    snapshot.forEach(doc => {
      if (count >= startAt && jobs.length < limit) {
        const jobData = doc.data();
        
        // Apply search filter if provided
        if (search) {
          const searchLower = search.toLowerCase();
          const title = jobData.title?.toLowerCase() || '';
          const description = jobData.description?.toLowerCase() || '';
          
          if (title.includes(searchLower) || description.includes(searchLower)) {
            jobs.push({
              id: doc.id,
              ...jobData
            });
          }
        } else {
          jobs.push({
            id: doc.id,
            ...jobData
          });
        }
      }
      count++;
    });
    
    const totalPages = Math.ceil(total / limit);
    
    res.json({
      success: true,
      jobs,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalItems: total,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit: Number(limit)
      }
    });
  } catch (error) {
    console.error('Get admin jobs error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch jobs',
      message: error.message 
    });
  }
});

// GET /api/admin/jobs/:id - Get job with applications
router.get('/:id', async (req, res) => {
  try {
    const jobId = req.params.id;
    
    const [jobDoc, applicationsSnap] = await Promise.all([
      db.collection('jobs').doc(jobId).get(),
      db.collection('applications')
        .where('jobId', '==', jobId)
        .orderBy('appliedAt', 'desc')
        .get()
    ]);
    
    if (!jobDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'Job not found' 
      });
    }
    
    const jobData = jobDoc.data();
    const applications = [];
    
    applicationsSnap.forEach(doc => {
      applications.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Get applicant details
    const applicationsWithUsers = await Promise.all(
      applications.map(async (app) => {
        try {
          const userDoc = await db.collection('users').doc(app.userId).get();
          if (userDoc.exists) {
            app.applicant = {
              id: userDoc.id,
              name: userDoc.data().fullName,
              email: userDoc.data().email,
              phone: userDoc.data().phone,
              resumeUrl: userDoc.data().resumeUrl
            };
          }
        } catch (error) {
          console.error(`Error fetching user ${app.userId}:`, error);
        }
        return app;
      })
    );
    
    res.json({
      success: true,
      job: {
        id: jobDoc.id,
        ...jobData
      },
      applications: applicationsWithUsers,
      totalApplications: applications.length,
      applicationStats: {
        pending: applications.filter(app => app.status === 'pending').length,
        reviewed: applications.filter(app => app.status === 'reviewed').length,
        shortlisted: applications.filter(app => app.status === 'shortlisted').length,
        interview: applications.filter(app => app.status === 'interview').length,
        accepted: applications.filter(app => app.status === 'accepted').length,
        rejected: applications.filter(app => app.status === 'rejected').length
      }
    });
  } catch (error) {
    console.error('Get admin job error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch job details',
      message: error.message 
    });
  }
});

// PATCH /api/admin/jobs/:id/status - Update job status
router.patch('/:id/status', async (req, res) => {
  try {
    const jobId = req.params.id;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ 
        success: false,
        error: 'Status is required' 
      });
    }
    
    const validStatuses = ['draft', 'published', 'archived', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        error: `Invalid status. Valid statuses: ${validStatuses.join(', ')}` 
      });
    }
    
    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    
    if (!jobDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'Job not found' 
      });
    }
    
    await jobRef.update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    });
    
    res.json({
      success: true,
      message: `Job status updated to ${status}`,
      jobId,
      status
    });
  } catch (error) {
    console.error('Update job status error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update job status',
      message: error.message 
    });
  }
});

// PATCH /api/admin/jobs/:id/feature - Feature/unfeature a job
router.patch('/:id/feature', async (req, res) => {
  try {
    const jobId = req.params.id;
    const { featured } = req.body;
    
    if (featured === undefined) {
      return res.status(400).json({ 
        success: false,
        error: 'Featured status is required' 
      });
    }
    
    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    
    if (!jobDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'Job not found' 
      });
    }
    
    await jobRef.update({
      featured: featured === true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      message: featured ? 'Job featured successfully' : 'Job unfeatured successfully',
      jobId,
      featured: featured === true
    });
  } catch (error) {
    console.error('Feature job error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update featured status',
      message: error.message 
    });
  }
});

// GET /api/admin/jobs/stats - Get job statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    // Calculate time range
    const now = new Date();
    let startDate = new Date();
    
    switch (timeRange) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }
    
    // Get all jobs
    const jobsSnap = await db.collection('jobs')
      .where('createdAt', '>=', startDate)
      .get();
    
    // Get all applications
    const appsSnap = await db.collection('applications')
      .where('appliedAt', '>=', startDate)
      .get();
    
    // Process data
    const jobs = [];
    const applications = [];
    
    jobsSnap.forEach(doc => {
      jobs.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    appsSnap.forEach(doc => {
      applications.push(doc.data());
    });
    
    // Calculate statistics
    const stats = {
      totalJobs: jobs.length,
      publishedJobs: jobs.filter(job => job.status === 'published').length,
      draftJobs: jobs.filter(job => job.status === 'draft').length,
      archivedJobs: jobs.filter(job => job.status === 'archived').length,
      featuredJobs: jobs.filter(job => job.featured).length,
      totalApplications: applications.length,
      averageApplicationsPerJob: jobs.length > 0 ? (applications.length / jobs.length).toFixed(2) : 0,
      jobsByCategory: {},
      jobsByType: {},
      applicationsByStatus: {
        pending: 0,
        reviewed: 0,
        shortlisted: 0,
        interview: 0,
        accepted: 0,
        rejected: 0,
        withdrawn: 0
      },
      dailyJobs: [],
      dailyApplications: []
    };
    
    // Jobs by category
    jobs.forEach(job => {
      const category = job.category || 'Uncategorized';
      stats.jobsByCategory[category] = (stats.jobsByCategory[category] || 0) + 1;
    });
    
    // Jobs by type
    jobs.forEach(job => {
      const type = job.type || 'full-time';
      stats.jobsByType[type] = (stats.jobsByType[type] || 0) + 1;
    });
    
    // Applications by status
    applications.forEach(app => {
      if (stats.applicationsByStatus[app.status] !== undefined) {
        stats.applicationsByStatus[app.status]++;
      }
    });
    
    // Daily data for last 7 days
    const dailyData = {};
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyData[dateStr] = { jobs: 0, applications: 0 };
    }
    
    // Count daily jobs
    jobs.forEach(job => {
      if (job.createdAt) {
        const date = job.createdAt.toDate ? job.createdAt.toDate() : new Date(job.createdAt);
        const dateStr = date.toISOString().split('T')[0];
        if (dailyData[dateStr]) {
          dailyData[dateStr].jobs++;
        }
      }
    });
    
    // Count daily applications
    applications.forEach(app => {
      if (app.appliedAt) {
        const date = app.appliedAt.toDate ? app.appliedAt.toDate() : new Date(app.appliedAt);
        const dateStr = date.toISOString().split('T')[0];
        if (dailyData[dateStr]) {
          dailyData[dateStr].applications++;
        }
      }
    });
    
    // Convert to array
    stats.dailyJobs = Object.entries(dailyData).map(([date, data]) => ({
      date,
      jobs: data.jobs
    }));
    
    stats.dailyApplications = Object.entries(dailyData).map(([date, data]) => ({
      date,
      applications: data.applications
    }));
    
    // Top 5 jobs by applications
    const jobApplicationCount = {};
    applications.forEach(app => {
      jobApplicationCount[app.jobId] = (jobApplicationCount[app.jobId] || 0) + 1;
    });
    
    const topJobs = Object.entries(jobApplicationCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    stats.topJobs = await Promise.all(
      topJobs.map(async ([jobId, count]) => {
        const jobDoc = await db.collection('jobs').doc(jobId).get();
        return {
          jobId,
          title: jobDoc.exists ? jobDoc.data().title : 'Unknown Job',
          applicationCount: count,
          status: jobDoc.exists ? jobDoc.data().status : 'unknown'
        };
      })
    );
    
    res.json({
      success: true,
      stats,
      timeRange
    });
  } catch (error) {
    console.error('Get job stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch statistics',
      message: error.message 
    });
  }
});



module.exports = router;