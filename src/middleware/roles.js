const { db } = require('../admin');

// Middleware to require specific role
const requireRole = (requiredRole) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
      }

      const userId = req.user.uid;
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        return res.status(404).json({ 
          success: false,
          error: 'User not found' 
        });
      }

      const userData = userDoc.data();
      const userRole = userData.role || 'user';

      if (userRole !== requiredRole && userRole !== 'admin') {
        return res.status(403).json({ 
          success: false,
          error: `Insufficient permissions. Required role: ${requiredRole}` 
        });
      }

      // Add role to request object for later use
      req.user.role = userRole;
      
      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to verify user role' 
      });
    }
  };
};

// Check if user has at least one of the required roles
const requireAnyRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
      }

      const userId = req.user.uid;
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        return res.status(404).json({ 
          success: false,
          error: 'User not found' 
        });
      }

      const userData = userDoc.data();
      const userRole = userData.role || 'user';

      // Admin has access to everything
      if (userRole === 'admin') {
        req.user.role = userRole;
        return next();
      }

      // Check if user has one of the allowed roles
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ 
          success: false,
          error: `Insufficient permissions. Allowed roles: ${allowedRoles.join(', ')}` 
        });
      }

      req.user.role = userRole;
      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to verify user role' 
      });
    }
  };
};

// Check if user is the owner of a resource
const isOwnerOrAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.user.uid) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
    }

    const userId = req.user.uid;
    const resourceId = req.params.id || req.params.userId;
    
    if (!resourceId) {
      return res.status(400).json({ 
        success: false,
        error: 'Resource ID required' 
      });
    }

    // Check user role
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const userRole = userData.role || 'user';

    // Admin can access anything
    if (userRole === 'admin') {
      req.user.role = userRole;
      return next();
    }

    // Check if user is the owner
    if (userId === resourceId) {
      req.user.role = userRole;
      return next();
    }

    return res.status(403).json({ 
      success: false,
      error: 'Access denied. You can only access your own resources.' 
    });
  } catch (error) {
    console.error('Owner check error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to verify resource ownership' 
    });
  }
};

module.exports = {
  requireRole,
  requireAnyRole,
  isOwnerOrAdmin
};