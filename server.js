const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// ============================================
// 1. Load Environment Variables
// ============================================

console.log('=== JOB PORTAL BACKEND STARTING ===');
console.log('Server file:', __filename);

// Load .env file
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Debug environment
console.log('Environment loaded:', {
  firebaseApiKey: process.env.FIREBASE_API_KEY ? '✅ Set' : '❌ Missing',
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development'
});

// ============================================
// 2. Import Dependencies
// ============================================

const { admin, db } = require('./src/admin');

// Middleware
const { authMiddleware } = require('./src/middleware/auth');
const { requireRole } = require('./src/middleware/roles');
const { apiLimiter } = require('./src/middleware/rateLimit');

// Routes
const authRoutes = require('./src/routes/auth');
const jobsRoutes = require('./src/routes/jobs');
const adminJobsRoutes = require('./src/routes/adminJobs');
const adminUsersRoutes = require('./src/routes/adminUsers');
const adminApplicationsRoutes = require('./src/routes/adminApplications');
const applyRoutes = require('./src/routes/apply');
const favouritesRoutes = require('./src/routes/favourites');
const usersRoutes = require('./src/routes/users');
const uploadRoutes = require('./src/routes/upload');

// ============================================
// 3. Initialize Express App
// ============================================

const app = express();

// Apply global rate limiting to API routes
app.use('/api/', apiLimiter);

// CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:8080'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// ============================================
// 4. Health Check & Info Endpoints
// ============================================

app.get('/', (req, res) => {
  res.json({ 
    success: true,
    message: 'Job Portal Backend API',
    version: '1.0.0',
    documentation: {
      authentication: '/api/auth',
      jobs: '/api/jobs',
      applications: '/api/apply',
      favorites: '/api/favourites',
      user: '/api/users/me',
      uploads: '/api/upload',
      admin: '/api/admin/jobs'
    },
    health: '/api/health',
    status: 'operational'
  });
});

app.get('/api/health', (req, res) => {
  const health = {
    success: true,
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    firebase: db ? 'connected' : 'disconnected',
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };
  
  res.json(health);
});

app.get('/api/info', (req, res) => {
  res.json({
    success: true,
    name: 'Job Portal API',
    version: '1.0.0',
    description: 'Backend API for Job Portal Application',
    features: [
      'User authentication & registration',
      'Job posting & management',
      'Job search with filters',
      'Application system',
      'Favorite jobs',
      'User profiles',
      'Resume upload',
      'Admin dashboard',
      'Analytics & statistics'
    ],
    technologies: ['Node.js', 'Express', 'Firebase', 'Firestore']
  });
});

// ============================================
// 5. Route Configuration
// ============================================

// Public routes
app.use('/api/auth', authRoutes); // public routes
app.use('/api/jobs', jobsRoutes);

// Protected routes (require authentication)
app.use('/api/apply', authMiddleware, applyRoutes);
app.use('/api/favourites', authMiddleware, favouritesRoutes);
app.use('/api/upload', authMiddleware, uploadRoutes);

// User profile routes
app.use('/api/users', authMiddleware, usersRoutes);

// Admin routes (require admin role)
app.use('/api/admin/jobs', authMiddleware, requireRole('admin'), adminJobsRoutes);
app.use('/api/admin/users', authMiddleware, requireRole('admin'), adminUsersRoutes);
app.use('/api/admin/applications', authMiddleware, requireRole('admin'), adminApplicationsRoutes);



// ============================================
// 6. Error Handling Middleware
// ============================================

// 404 Not Found handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: 'File size too large. Maximum size is 5MB.'
    });
  }

  // Multer file type error
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  const errorMessage = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;

  res.status(statusCode).json({
    success: false,
    error: errorMessage,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================
// 7. Start Server
// ============================================

const PORT = process.env.PORT || 3000;

// Only start server if not in test environment
if (require.main === module) {
  app.listen(PORT, () => {
    // Add to server.js to debug Firebase
console.log('Firebase db initialized:', !!db);
console.log('Firebase admin initialized:', !!admin);
    console.log('================================');
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Firebase: ${db ? 'Connected' : 'Not connected'}`);
    console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('================================');
    console.log('Available endpoints:');
    console.log(`  http://localhost:${PORT}/api/health`);
    console.log(`  http://localhost:${PORT}/api/auth/debug`);
    console.log(`  http://localhost:${PORT}/api/jobs`);
    console.log('================================');
  });
}

module.exports = app;