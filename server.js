const express = require('express');
const cors = require('cors');

// Load environment variables - only for local development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: '.env.local' });
}

const { admin, db } = require('./src/admin');

const authRoutes = require('./src/routes/auth');
const jobsRoutes = require('./src/routes/jobs');
const adminJobsRoutes = require('./src/routes/adminJobs');
const applyRoutes = require('./src/routes/apply');
const favouritesRoutes = require('./src/routes/favourites');
const usersRoutes = require('./src/routes/users');
const uploadRoutes = require('./src/routes/upload');

const { authMiddleware } = require('./src/middleware/auth');
const { requireRole } = require('./src/middleware/roles');

const app = express();

// CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'https://your-frontend.vercel.app'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint (for Vercel monitoring)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Jobboard backend is running',
    timestamp: new Date().toISOString(),
    firebase: db ? 'connected' : 'not connected'
  });
});

// Firebase test endpoint
app.get('/api/test-firebase', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        status: 'ERROR', 
        message: 'Firebase not initialized. Check FIREBASE_CREDENTIALS_BASE64 env var.' 
      });
    }
    
    // Test Firestore connection
    const testRef = db.collection('test').doc('connection');
    await testRef.set({
      test: 'success',
      timestamp: new Date().toISOString(),
      server: 'vercel'
    });
    
    const doc = await testRef.get();
    
    res.json({
      status: 'SUCCESS',
      message: 'Firestore is working!',
      data: doc.exists ? doc.data() : null
    });
    
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      message: 'Firebase test failed',
      error: error.message 
    });
  }
});

// Public route
app.get('/', (req, res) => res.json({ 
  message: 'Jobboard Backend API',
  endpoints: {
    health: '/api/health',
    test: '/api/test-firebase',
    auth: '/api/auth',
    jobs: '/api/jobs',
    apply: '/api/apply',
    favourites: '/api/favourites',
    upload: '/api/upload',
    admin: '/api/admin/jobs'
  }
}));

// Auth routes
app.use('/api/auth', authRoutes);

// Jobs (public read)
app.use('/api/jobs', jobsRoutes);

// Protected actions
app.use('/api/apply', authMiddleware, applyRoutes);
app.use('/api/favourites', authMiddleware, favouritesRoutes);
app.use('/api/me', authMiddleware, usersRoutes);
app.use('/api/upload', authMiddleware, uploadRoutes);

// Admin routes (protected + role)
app.use('/api/admin/jobs', authMiddleware, requireRole('admin'), adminJobsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Export for Vercel
module.exports = app;

// Only listen locally when not in Vercel environment
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
}