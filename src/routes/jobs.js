const express = require('express');
const router = express.Router();
const { admin, db } = require('../admin');
const { validateJobPost } = require('../middleware/validation');


// GET /api/jobs - Get all jobs with filters
router.get('/', async (req, res) => {
  try {
    const {
      search,
      location,
      type,
      employmentType,
      minSalary,
      maxSalary,
      category,
      remote,
      experienceLevel,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    let query = db.collection('jobs')
      .where('status', '==', 'published');

    // Apply filters
    if (location) {
      query = query.where('location', '==', location);
    }

    if (type) {
      query = query.where('type', '==', type);
    }

    if (employmentType) {
      query = query.where('employmentType', '==', employmentType);
    }

    if (category) {
      query = query.where('category', '==', category);
    }

    if (remote !== undefined) {
      query = query.where('remote', '==', remote === 'true');
    }

    if (experienceLevel) {
      query = query.where('experienceLevel', '==', experienceLevel);
    }

    // Apply sorting
    if (sortBy === 'salary') {
      query = order === 'asc' 
        ? query.orderBy('salary.min', 'asc')
        : query.orderBy('salary.max', 'desc');
    } else if (sortBy === 'date') {
      query = order === 'asc' 
        ? query.orderBy('createdAt', 'asc')
        : query.orderBy('createdAt', 'desc');
    } else if (sortBy === 'title') {
      query = order === 'asc' 
        ? query.orderBy('title', 'asc')
        : query.orderBy('title', 'desc');
    } else {
      query = query.orderBy('createdAt', 'desc');
    }

    // Execute query
    const snapshot = await query.get();
    const total = snapshot.size;
    const startAt = (page - 1) * limit;
    
    // Get paginated results
    const jobs = [];
    let count = 0;
    
    snapshot.forEach(doc => {
      if (count >= startAt && jobs.length < limit) {
        const jobData = doc.data();
        
        // Apply salary filter after fetching
        let includeJob = true;
        
        if (minSalary && jobData.salary?.min < Number(minSalary)) {
          includeJob = false;
        }
        
        if (maxSalary && jobData.salary?.max > Number(maxSalary)) {
          includeJob = false;
        }
        
        // Apply search filter
        if (search && includeJob) {
          const searchLower = search.toLowerCase();
          const title = jobData.title?.toLowerCase() || '';
          const company = jobData.company?.toLowerCase() || '';
          const description = jobData.description?.toLowerCase() || '';
          
          if (!title.includes(searchLower) && 
              !company.includes(searchLower) && 
              !description.includes(searchLower)) {
            includeJob = false;
          }
        }
        
        if (includeJob) {
          jobs.push({
            id: doc.id,
            ...jobData,
            // Calculate if user has applied/favorited
            hasApplied: false,
            isFavorited: false
          });
        }
      }
      count++;
    });

    const totalPages = Math.ceil(total / limit);

    // If user is authenticated, check their status
    if (req.user && req.user.uid) {
      const userId = req.user.uid;
      
      // Get user's applications and favorites
      const [applicationsSnap, userDoc] = await Promise.all([
        db.collection('applications')
          .where('userId', '==', userId)
          .get(),
        db.collection('users').doc(userId).get()
      ]);
      
      const appliedJobIds = [];
      applicationsSnap.forEach(doc => {
        appliedJobIds.push(doc.data().jobId);
      });
      
      const userData = userDoc.data();
      const favoriteJobIds = userData?.favorites || [];
      
      // Update job status
      jobs.forEach(job => {
        job.hasApplied = appliedJobIds.includes(job.id);
        job.isFavorited = favoriteJobIds.includes(job.id);
      });
    }

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
      },
      filters: {
        search: search || '',
        location: location || '',
        type: type || '',
        minSalary: minSalary || '',
        maxSalary: maxSalary || '',
        category: category || '',
        remote: remote || '',
        experienceLevel: experienceLevel || ''
      }
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch jobs',
      message: error.message 
    });
  }
});

// GET /api/jobs/:id - Get single job
router.get('/:id', async (req, res) => {
  try {
    const jobId = req.params.id;
    const jobRef = db.collection('jobs').doc(jobId);
    const doc = await jobRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'Job not found' 
      });
    }

    // Increment view count
    await jobRef.update({
      views: admin.firestore.FieldValue.increment(1),
      lastViewedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const jobData = doc.data();
    const response = {
      id: doc.id,
      ...jobData,
      hasApplied: false,
      isFavorited: false,
      canApply: jobData.status === 'published'
    };

    // Check if user has applied/favorited
    if (req.user && req.user.uid) {
      const userId = req.user.uid;
      
      const [applicationSnap, userDoc] = await Promise.all([
        db.collection('applications')
          .where('jobId', '==', jobId)
          .where('userId', '==', userId)
          .limit(1)
          .get(),
        db.collection('users').doc(userId).get()
      ]);
      
      response.hasApplied = !applicationSnap.empty;
      
      const userData = userDoc.data();
      response.isFavorited = userData?.favorites?.includes(jobId) || false;
    }

    // Get similar jobs
    if (jobData.category) {
      const similarQuery = db.collection('jobs')
        .where('category', '==', jobData.category)
        .where('status', '==', 'published')
        .where('id', '!=', jobId)
        .limit(4);
      
      const similarSnap = await similarQuery.get();
      const similarJobs = [];
      
      similarSnap.forEach(doc => {
        similarJobs.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      response.similarJobs = similarJobs;
    }

    res.json({
      success: true,
      job: response
    });
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch job',
      message: error.message 
    });
  }
});

// GET /api/jobs/categories - Get all categories
router.get('/categories/all', async (req, res) => {
  try {
    const categories = [
      'IT & Software',
      'Healthcare',
      'Finance',
      'Marketing',
      'Sales',
      'Education',
      'Engineering',
      'Design',
      'Customer Service',
      'Human Resources',
      'Operations',
      'Legal',
      'Other'
    ];

    res.json({
      success: true,
      categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch categories'
    });
  }
});

// GET /api/jobs/types - Get all job types
router.get('/types/all', async (req, res) => {
  try {
    const types = [
      'full-time',
      'part-time',
      'contract',
      'internship',
      'freelance',
      'temporary'
    ];

    res.json({
      success: true,
      types
    });
  } catch (error) {
    console.error('Error fetching types:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch types'
    });
  }
});

// GET /api/jobs/experience-levels - Get experience levels
router.get('/experience-levels/all', async (req, res) => {
  try {
    const experienceLevels = [
      'entry',
      'mid',
      'senior',
      'executive',
      'intern'
    ];

    res.json({
      success: true,
      experienceLevels
    });
  } catch (error) {
    console.error('Error fetching experience levels:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch experience levels'
    });
  }
});

module.exports = router;