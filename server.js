const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const { admin, db } = require('./src/admin');

const authRoutes = require('./src/routes/auth');
const jobsRoutes = require('./src/routes/jobs');
const adminJobsRoutes = require('./src/routes/adminJobs');
const applyRoutes = require('./src/routes/apply');
const favouritesRoutes = require('./src/routes/favourites');
const usersRoutes = require('./src/routes/users');
const uploadRoutes = require('./src/routes/upload'); // Add this line

const { authMiddleware } = require('./src/middleware/auth');
const { requireRole } = require('./src/middleware/roles');

const app = express();
app.use(cors());
app.use(express.json());

// Public route
app.get('/', (req, res) => res.json({ message: 'Jobboard backend is running' }));

// Auth routes (some are optional; mobile clients may use Firebase SDK directly)
app.use('/api/auth', authRoutes);

// Jobs (public read)
app.use('/api/jobs', jobsRoutes);

// Protected actions
app.use('/api/apply', authMiddleware, applyRoutes);
app.use('/api/favourites', authMiddleware, favouritesRoutes);
app.use('/api/me', authMiddleware, usersRoutes);
app.use('/api/upload', authMiddleware, uploadRoutes); // Add this line

// Admin routes (protected + role)
app.use('/api/admin/jobs', authMiddleware, requireRole('admin'), adminJobsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

module.exports = app;