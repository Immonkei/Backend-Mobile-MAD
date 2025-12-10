const express = require('express');
const router = express.Router();
const { admin, db } = require('../admin');
const { authLimiter } = require('../middleware/rateLimit');
const { authMiddleware } = require('../middleware/auth'); // Import middleware


// Debug route to check environment
router.get('/debug', (req, res) => {
  res.json({
    success: true,
    firebaseKey: process.env.FIREBASE_API_KEY ? '✅ Set' : '❌ Missing',
    timestamp: new Date().toISOString()
  });
});

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, fullName, phone } = req.body;

    // Validation
    if (!email || !password || !fullName) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and full name are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    // Create user with Firebase REST API
    const apiKey = process.env.FIREBASE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'FIREBASE_API_KEY not configured'
      });
    }

    const registerResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      }
    );

    const registerData = await registerResponse.json();
    
    if (!registerResponse.ok) {
      throw new Error(registerData.error?.message || 'Registration failed');
    }

    // Create user profile in Firestore
    await db.collection('users').doc(registerData.localId).set({
      email,
      fullName,
      phone: phone || '',
      role: 'user',
      resumeUrl: null,
      location: '',
      skills: [],
      experience: [],
      education: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      applicationsCount: 0,
      favorites: [],
      emailVerified: false,
      profileComplete: false
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        uid: registerData.localId,
        email: registerData.email,
        displayName: fullName
      },
      tokens: {
        idToken: registerData.idToken,
        refreshToken: registerData.refreshToken,
        expiresIn: registerData.expiresIn
      }
    });

  } catch (err) {
    console.error('Register error:', err.message);
    
    // Handle Firebase errors
    if (err.message.includes('EMAIL_EXISTS')) {
      return res.status(400).json({
        success: false,
        error: 'Email already exists'
      });
    }

    res.status(400).json({
      success: false,
      error: err.message || 'Registration failed'
    });
  }
});

// POST /api/auth/login (WORKING VERSION)
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and password are required' 
      });
    }

    const apiKey = process.env.FIREBASE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        success: false,
        error: 'FIREBASE_API_KEY not configured on server' 
      });
    }

    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      }
    );

    const data = await resp.json();
    
    if (!resp.ok) {
      return res.status(400).json({ 
        success: false,
        error: data.error?.message || 'Authentication failed',
        details: data 
      });
    }

    // Get or create user profile
    const userRef = db.collection('users').doc(data.localId);
    const userDoc = await userRef.get();
    
    let userProfile = {};
    
    if (userDoc.exists) {
      userProfile = userDoc.data();
      // Update last login
      await userRef.update({
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      // Create basic profile
      await userRef.set({
        email: data.email,
        fullName: data.displayName || '',
        role: 'user',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    return res.json({ 
      success: true,
      idToken: data.idToken, 
      refreshToken: data.refreshToken, 
      expiresIn: data.expiresIn, 
      uid: data.localId,
      user: {
        uid: data.localId,
        email: data.email,
        ...userProfile
      }
    });
    
  } catch (err) {
    return res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});
// Protected route - requires authentication
router.get('/me', authMiddleware, async (req, res) => {
  try {
    // Now req.user should be set by authMiddleware
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'User profile not found' 
      });
    }

    const userData = userDoc.data();
    
    res.json({
      success: true,
      user: {
        uid: req.user.uid,
        email: req.user.email,
        ...userData
      }
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get user profile',
      message: err.message 
    });
  }
});
module.exports = router;