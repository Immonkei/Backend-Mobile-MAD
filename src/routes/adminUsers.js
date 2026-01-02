const express = require('express');
const router = express.Router();
const { admin, db } = require('../admin');

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

// GET /api/admin/users - Get all users with filters
router.get('/', async (req, res) => {
  try {
    const {
      search,
      role,
      verified,
      banned,
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      order = 'desc',
      showDeleted = false
    } = req.query;

    let query = db.collection('users');

    // Apply filters
    if (role) {
      query = query.where('role', '==', role);
    }

     if (showDeleted !== 'true') {
      query = query.where('isDeleted', '==', false);
    }

    if (verified !== undefined) {
      query = query.where('emailVerified', '==', verified === 'true');
    }

    if (banned !== undefined) {
      query = query.where('isBanned', '==', banned === 'true');
    }

    // Apply sorting
    if (sortBy === 'name') {
      query = order === 'asc' 
        ? query.orderBy('fullName', 'asc')
        : query.orderBy('fullName', 'desc');
    } else if (sortBy === 'email') {
      query = order === 'asc' 
        ? query.orderBy('email', 'asc')
        : query.orderBy('email', 'desc');
    } else {
      query = order === 'asc' 
        ? query.orderBy('createdAt', 'asc')
        : query.orderBy('createdAt', 'desc');
    }

    const snapshot = await query.get();
    const total = snapshot.size;
    const startAt = (page - 1) * limit;
    
    const users = [];
    let count = 0;
    
    snapshot.forEach(doc => {
      if (count >= startAt && users.length < limit) {
        const userData = doc.data();
        
        // Apply search filter
        if (search) {
          const searchLower = search.toLowerCase();
          const name = userData.fullName?.toLowerCase() || '';
          const email = userData.email?.toLowerCase() || '';
          
          if (name.includes(searchLower) || email.includes(searchLower)) {
            users.push({
              id: doc.id,
              ...userData,
              // Hide sensitive data
              // password: undefined
            });
          }
        } else {
          users.push({
            id: doc.id,
            ...userData,
            // Hide sensitive data
            // password: undefined
          });
        }
      }
      count++;
    });

    // Get additional stats for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        try {
          // Get application count
          const appsSnap = await db.collection('applications')
            .where('userId', '==', user.id)
            .get();
          
          user.stats = {
            applications: appsSnap.size,
            favorites: user.favorites?.length || 0,
            profileComplete: user.profileComplete || false
          };

          // Remove sensitive data
          delete user.password;
          delete user.refreshToken;
          delete user.__privateFields;

          return user;
        } catch (error) {
          console.error(`Error getting stats for user ${user.id}:`, error);
          user.stats = {
            applications: 0,
            favorites: 0,
            profileComplete: false
          };
          return user;
        }
      })
    );

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      users: usersWithStats,
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
        role: role || '',
        verified: verified || '',
        banned: banned || ''
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch users',
      message: error.message 
    });
  }
});

// GET /api/admin/users/:id - Get user details
router.get('/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Get user data
    const [userDoc, applicationsSnap] = await Promise.all([
      db.collection('users').doc(userId).get(),
      db.collection('applications')
        .where('userId', '==', userId)
        .orderBy('appliedAt', 'desc')
        .limit(50)
        .get()
    ]);
    
    if (!userDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    const userData = userDoc.data();
    
    // Get applications with job details
    const applications = [];
    applicationsSnap.forEach(doc => {
      applications.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    const applicationsWithJobs = await Promise.all(
      applications.map(async (app) => {
        try {
          const jobDoc = await db.collection('jobs').doc(app.jobId).get();
          if (jobDoc.exists) {
            app.job = {
              id: jobDoc.id,
              title: jobDoc.data().title,
              company: jobDoc.data().company
            };
          }
        } catch (error) {
          console.error(`Error fetching job ${app.jobId}:`, error);
        }
        return app;
      })
    );
    
    // Get favorite jobs
    const favoriteJobs = [];
    const favoriteIds = userData.favorites || [];
    
    for (const jobId of favoriteIds.slice(0, 20)) { // Limit to 20
      try {
        const jobDoc = await db.collection('jobs').doc(jobId).get();
        if (jobDoc.exists) {
          const jobData = jobDoc.data();
          favoriteJobs.push({
            id: jobDoc.id,
            title: jobData.title,
            company: jobData.company,
            status: jobData.status
          });
        }
      } catch (error) {
        console.error(`Error fetching favorite job ${jobId}:`, error);
      }
    }
    
    // Remove sensitive data
    const safeUserData = { ...userData };
    delete safeUserData.password;
    delete safeUserData.refreshToken;
    delete safeUserData.__privateFields;
    
    res.json({
      success: true,
      user: {
        id: userDoc.id,
        ...safeUserData
      },
      stats: {
        totalApplications: applications.length,
        pendingApplications: applications.filter(app => app.status === 'pending').length,
        acceptedApplications: applications.filter(app => app.status === 'accepted').length,
        totalFavorites: favoriteIds.length,
        profileComplete: userData.profileComplete || false,
        lastLogin: userData.lastLoginAt,
        memberSince: userData.createdAt
      },
      recentApplications: applicationsWithJobs.slice(0, 10), // Last 10 applications
      favoriteJobs: favoriteJobs.slice(0, 10) // Top 10 favorites
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch user details',
      message: error.message 
    });
  }
});

// PUT /api/admin/users/:id - Update user
router.put('/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const updates = req.body;
    
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // Fields that can be updated by admin
    const allowedFields = [
      'role',
      'fullName',
      'phone',
      'location',
      'headline',
      'skills',
      'experience',
      'education',
      'bio',
      'profileComplete',
      'preferences',
      'isBanned',
      'banReason',
      'bannedAt',
      'emailVerified'
    ];
    
    // Filter updates
    const filteredUpdates = {};
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });
    
    // Add timestamps for certain updates
    if (filteredUpdates.isBanned === true) {
      filteredUpdates.bannedAt = admin.firestore.FieldValue.serverTimestamp();
      filteredUpdates.bannedBy = req.user.uid;
    } else if (filteredUpdates.isBanned === false) {
      filteredUpdates.unbannedAt = admin.firestore.FieldValue.serverTimestamp();
      filteredUpdates.unbannedBy = req.user.uid;
      filteredUpdates.banReason = null;
    }
    
    filteredUpdates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    filteredUpdates.updatedBy = req.user.uid;
    
    await userRef.update(filteredUpdates);
    
    // If banning/unbanning, also update Firebase Auth
    if (filteredUpdates.isBanned !== undefined) {
      try {
        await admin.auth().updateUser(userId, {
          disabled: filteredUpdates.isBanned === true
        });
      } catch (authError) {
        console.error('Error updating Firebase Auth user:', authError);
        // Continue anyway - Firestore update succeeded
      }
    }
    
    // Get updated user data
    const updatedDoc = await userRef.get();
    const userData = updatedDoc.data();
    
    // Remove sensitive data
    const safeUserData = { ...userData };
    delete safeUserData.password;
    delete safeUserData.refreshToken;
    
    res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: updatedDoc.id,
        ...safeUserData
      }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update user',
      message: error.message 
    });
  }
});

// PATCH /api/admin/users/:id/role - Update user role
router.patch('/:id/role', async (req, res) => {
  try {
    const userId = req.params.id;
    const { role } = req.body;
    
    if (!role) {
      return res.status(400).json({ 
        success: false,
        error: 'Role is required' 
      });
    }
    
    const validRoles = ['user', 'employer', 'admin', 'moderator'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        success: false,
        error: `Invalid role. Valid roles: ${validRoles.join(', ')}` 
      });
    }
    
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // Check if trying to change own role
    if (userId === req.user.uid && role !== 'admin') {
      return res.status(400).json({ 
        success: false,
        error: 'Cannot remove admin role from yourself' 
      });
    }
    
    await userRef.update({
      role,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    });
    
    // Also update custom claims in Firebase Auth
    try {
      await admin.auth().setCustomUserClaims(userId, { role });
    } catch (authError) {
      console.error('Error setting custom claims:', authError);
      // Continue anyway - Firestore update succeeded
    }
    
    res.json({
      success: true,
      message: `User role updated to ${role}`,
      userId,
      role
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update role',
      message: error.message 
    });
  }
});

// PATCH /api/admin/users/:id/ban - Ban user
router.patch('/:id/ban', async (req, res) => {
  try {
    const userId = req.params.id;
    const { reason, duration } = req.body;
    
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    const userData = userDoc.data();
    
    // Check if already banned
    if (userData.isBanned) {
      return res.status(400).json({ 
        success: false,
        error: 'User is already banned' 
      });
    }
    
    // Check if trying to ban yourself
    if (userId === req.user.uid) {
      return res.status(400).json({ 
        success: false,
        error: 'Cannot ban yourself' 
      });
    }
    
    // Check if trying to ban another admin
    if (userData.role === 'admin') {
      return res.status(400).json({ 
        success: false,
        error: 'Cannot ban another admin' 
      });
    }
    
    const banData = {
      isBanned: true,
      banReason: reason || 'Violation of terms of service',
      bannedAt: admin.firestore.FieldValue.serverTimestamp(),
      bannedBy: req.user.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    };
    
    if (duration) {
      const durationMs = parseInt(duration) * 24 * 60 * 60 * 1000; // Convert days to ms
      banData.banExpiresAt = new Date(Date.now() + durationMs);
    }
    
    await userRef.update(banData);
    
    // Also disable user in Firebase Auth
    try {
      await admin.auth().updateUser(userId, {
        disabled: true
      });
    } catch (authError) {
      console.error('Error disabling user in Firebase Auth:', authError);
    }
    
    // Log the ban action
    await db.collection('adminLogs').add({
      action: 'ban_user',
      targetUserId: userId,
      targetUserEmail: userData.email,
      adminUserId: req.user.uid,
      adminUserEmail: req.user.email,
      reason: banData.banReason,
      duration: duration || 'permanent',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      message: 'User banned successfully',
      userId,
      banDetails: banData
    });
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to ban user',
      message: error.message 
    });
  }
});

// PATCH /api/admin/users/:id/unban - Unban user
router.patch('/:id/unban', async (req, res) => {
  try {
    const userId = req.params.id;
    const { reason } = req.body;
    
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    const userData = userDoc.data();
    
    // Check if not banned
    if (!userData.isBanned) {
      return res.status(400).json({ 
        success: false,
        error: 'User is not banned' 
      });
    }
    
    const unbanData = {
      isBanned: false,
      unbannedAt: admin.firestore.FieldValue.serverTimestamp(),
      unbannedBy: req.user.uid,
      unbanReason: reason || 'Ban lifted',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    };
    
    // Clear ban-related fields
    await userRef.update({
      ...unbanData,
      banReason: null,
      bannedAt: null,
      bannedBy: null,
      banExpiresAt: null
    });
    
    // Also enable user in Firebase Auth
    try {
      await admin.auth().updateUser(userId, {
        disabled: false
      });
    } catch (authError) {
      console.error('Error enabling user in Firebase Auth:', authError);
    }
    
    // Log the unban action
    await db.collection('adminLogs').add({
      action: 'unban_user',
      targetUserId: userId,
      targetUserEmail: userData.email,
      adminUserId: req.user.uid,
      adminUserEmail: req.user.email,
      reason: unbanData.unbanReason,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      message: 'User unbanned successfully',
      userId,
      unbanDetails: unbanData
    });
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to unban user',
      message: error.message 
    });
  }
});

// DELETE /api/admin/users/:id - Delete user (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const { reason, deleteData } = req.body;
    
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    const userData = userDoc.data();
    
    // Check if trying to delete yourself
    if (userId === req.user.uid) {
      return res.status(400).json({ 
        success: false,
        error: 'Cannot delete yourself' 
      });
    }
    
    // Check if trying to delete another admin
    if (userData.role === 'admin') {
      return res.status(400).json({ 
        success: false,
        error: 'Cannot delete another admin' 
      });
    }
    
    // Soft delete - mark as deleted
    const deleteDataObj = {
      isDeleted: true,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedBy: req.user.uid,
      deleteReason: reason || 'Account deletion by admin',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await userRef.update(deleteDataObj);
    
    // If deleteData is true, remove user data
    if (deleteData === true) {
      try {
        // Delete user from Firebase Auth
        await admin.auth().deleteUser(userId);
        
        // Delete user's applications
        const appsSnap = await db.collection('applications')
          .where('userId', '==', userId)
          .get();
        
        const batch = db.batch();
        appsSnap.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        
        // Delete user's uploaded files (in real app, delete from storage)
        
      } catch (deleteError) {
        console.error('Error deleting user data:', deleteError);
        // Continue with soft delete
      }
    } else {
      // Just disable the account
      try {
        await admin.auth().updateUser(userId, {
          disabled: true
        });
      } catch (authError) {
        console.error('Error disabling user in Firebase Auth:', authError);
      }
    }
    
    // Log the deletion
    await db.collection('adminLogs').add({
      action: 'delete_user',
      targetUserId: userId,
      targetUserEmail: userData.email,
      adminUserId: req.user.uid,
      adminUserEmail: req.user.email,
      reason: deleteDataObj.deleteReason,
      permanent: deleteData === true,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      message: deleteData === true ? 'User permanently deleted' : 'User deactivated',
      userId,
      deleteDetails: deleteDataObj
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete user',
      message: error.message 
    });
  }
});

// GET /api/admin/users/stats/overview - Get user statistics
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
    
    // Get all users
    const usersSnap = await db.collection('users').get();
    
    // Get all applications for activity
    const appsSnap = await db.collection('applications')
      .where('appliedAt', '>=', startDate)
      .get();
    
    // Process data
    const users = [];
    const applications = [];
    
    usersSnap.forEach(doc => {
      const userData = doc.data();
      users.push({
        id: doc.id,
        ...userData,
        createdAt: userData.createdAt || null
      });
    });
    
    appsSnap.forEach(doc => {
      applications.push(doc.data());
    });
    
    // Calculate statistics
    const stats = {
      totalUsers: users.length,
      activeUsers: users.filter(user => !user.isBanned && !user.isDeleted).length,
      newUsers: users.filter(user => {
        if (!user.createdAt) return false;
        const created = user.createdAt.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
        return created >= startDate;
      }).length,
      bannedUsers: users.filter(user => user.isBanned).length,
      deletedUsers: users.filter(user => user.isDeleted).length,
      usersByRole: {},
      usersWithApplications: 0,
      usersWithResumes: 0,
      usersCompleteProfile: 0,
      dailyRegistrations: [],
      userActivity: []
    };
    
    // Users by role
    users.forEach(user => {
      const role = user.role || 'user';
      stats.usersByRole[role] = (stats.usersByRole[role] || 0) + 1;
    });
    
    // User activity metrics
    const userIdsWithApps = new Set();
    applications.forEach(app => {
      userIdsWithApps.add(app.userId);
    });
    
    stats.usersWithApplications = userIdsWithApps.size;
    
    // Other metrics
    users.forEach(user => {
      if (user.resumeUrl) stats.usersWithResumes++;
      if (user.profileComplete) stats.usersCompleteProfile++;
    });
    
    // Daily registrations for last 7 days
    const dailyData = {};
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyData[dateStr] = { registrations: 0, applications: 0 };
    }
    
    // Count daily registrations
    users.forEach(user => {
      if (user.createdAt) {
        const date = user.createdAt.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
        const dateStr = date.toISOString().split('T')[0];
        if (dailyData[dateStr]) {
          dailyData[dateStr].registrations++;
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
    
    // Convert to arrays
    stats.dailyRegistrations = Object.entries(dailyData).map(([date, data]) => ({
      date,
      registrations: data.registrations
    }));
    
    stats.userActivity = Object.entries(dailyData).map(([date, data]) => ({
      date,
      applications: data.applications
    }));
    
    // Top 10 most active users
    const userActivityCount = {};
    applications.forEach(app => {
      userActivityCount[app.userId] = (userActivityCount[app.userId] || 0) + 1;
    });
    
    const topUsers = Object.entries(userActivityCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    stats.topActiveUsers = await Promise.all(
      topUsers.map(async ([userId, count]) => {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          return {
            userId,
            name: userData.fullName || 'Unknown',
            email: userData.email,
            applications: count,
            lastActivity: applications.find(app => app.userId === userId)?.appliedAt
          };
        }
        return {
          userId,
          name: 'Unknown User',
          applications: count
        };
      })
    );
    
    res.json({
      success: true,
      stats,
      timeRange
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch user statistics',
      message: error.message 
    });
  }
});

// GET /api/admin/users/search - Search users
router.get('/search/:query', async (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    
    const usersSnap = await db.collection('users').get();
    
    const results = [];
    usersSnap.forEach(doc => {
      const userData = doc.data();
      const name = userData.fullName?.toLowerCase() || '';
      const email = userData.email?.toLowerCase() || '';
      
      if (name.includes(query) || email.includes(query)) {
        results.push({
          id: doc.id,
          fullName: userData.fullName,
          email: userData.email,
          role: userData.role,
          isBanned: userData.isBanned || false,
          profileComplete: userData.profileComplete || false
        });
      }
    });
    
    res.json({
      success: true,
      results,
      total: results.length
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to search users',
      message: error.message 
    });
  }
});

// POST /api/admin/users/bulk-actions - Bulk user actions
router.post('/bulk-actions', async (req, res) => {
  try {
    const { action, userIds, data } = req.body;
    
    if (!action || !userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ 
        success: false,
        error: 'Action and user IDs array are required' 
      });
    }
    
    const validActions = ['ban', 'unban', 'change-role', 'send-email', 'export'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ 
        success: false,
        error: `Invalid action. Valid actions: ${validActions.join(', ')}` 
      });
    }
    
    // Limit batch size
    const limitedIds = userIds.slice(0, 100);
    
    let results = {
      success: 0,
      failed: 0,
      details: []
    };
    
    // Process each user
    for (const userId of limitedIds) {
      try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) {
          results.failed++;
          results.details.push({
            userId,
            status: 'failed',
            error: 'User not found'
          });
          continue;
        }
        
        const userData = userDoc.data();
        
        // Skip if trying to modify self or other admin for certain actions
        if (userId === req.user.uid && ['ban', 'change-role'].includes(action)) {
          results.failed++;
          results.details.push({
            userId,
            status: 'skipped',
            error: 'Cannot modify yourself'
          });
          continue;
        }
        
        if (userData.role === 'admin' && ['ban', 'change-role'].includes(action)) {
          results.failed++;
          results.details.push({
            userId,
            status: 'skipped',
            error: 'Cannot modify another admin'
          });
          continue;
        }
        
        // Perform action
        switch (action) {
          case 'ban':
            await userRef.update({
              isBanned: true,
              banReason: data?.reason || 'Bulk action',
              bannedAt: admin.firestore.FieldValue.serverTimestamp(),
              bannedBy: req.user.uid
            });
            
            try {
              await admin.auth().updateUser(userId, { disabled: true });
            } catch (authError) {
              console.error(`Error banning user ${userId} in Firebase Auth:`, authError);
            }
            break;
            
          case 'unban':
            await userRef.update({
              isBanned: false,
              unbannedAt: admin.firestore.FieldValue.serverTimestamp(),
              unbannedBy: req.user.uid
            });
            
            try {
              await admin.auth().updateUser(userId, { disabled: false });
            } catch (authError) {
              console.error(`Error unbanning user ${userId} in Firebase Auth:`, authError);
            }
            break;
            
          case 'change-role':
            if (!data?.role) {
              throw new Error('Role is required for change-role action');
            }
            
            await userRef.update({
              role: data.role,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedBy: req.user.uid
            });
            
            try {
              await admin.auth().setCustomUserClaims(userId, { role: data.role });
            } catch (authError) {
              console.error(`Error setting claims for user ${userId}:`, authError);
            }
            break;
            
          case 'send-email':
            // In a real app, you would integrate with an email service
            // For now, just log it
            console.log(`Would send email to ${userData.email}:`, data?.subject, data?.message);
            break;
        }
        
        results.success++;
        results.details.push({
          userId,
          status: 'success',
          email: userData.email,
          action
        });
        
      } catch (userError) {
        results.failed++;
        results.details.push({
          userId,
          status: 'failed',
          error: userError.message
        });
      }
    }
    
    // Log bulk action
    await db.collection('adminLogs').add({
      action: `bulk_${action}`,
      adminUserId: req.user.uid,
      adminUserEmail: req.user.email,
      userCount: limitedIds.length,
      successCount: results.success,
      failCount: results.failed,
      data: data || {},
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      message: `Bulk action completed: ${action}`,
      results,
      summary: {
        total: limitedIds.length,
        success: results.success,
        failed: results.failed
      }
    });
  } catch (error) {
    console.error('Bulk action error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to perform bulk action',
      message: error.message 
    });
  }
});

// GET /api/admin/users/activity/logs - Get admin logs
router.get('/activity/logs', async (req, res) => {
  try {
    const { page = 1, limit = 50, action, adminId } = req.query;
    
    let query = db.collection('adminLogs').orderBy('timestamp', 'desc');
    
    if (action) {
      query = query.where('action', '==', action);
    }
    
    if (adminId) {
      query = query.where('adminUserId', '==', adminId);
    }
    
    const snapshot = await query.get();
    const total = snapshot.size;
    const startAt = (page - 1) * limit;
    
    const logs = [];
    let count = 0;
    
    snapshot.forEach(doc => {
      if (count >= startAt && logs.length < limit) {
        logs.push({
          id: doc.id,
          ...doc.data()
        });
      }
      count++;
    });
    
    const totalPages = Math.ceil(total / limit);
    
    res.json({
      success: true,
      logs,
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
    console.error('Get admin logs error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch admin logs',
      message: error.message 
    });
  }
});

module.exports = router;