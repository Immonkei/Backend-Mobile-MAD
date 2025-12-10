const { admin } = require('../admin');

async function authMiddleware(req, res, next) {
  try {
    console.log('🔐 Auth Middleware Triggered');
    console.log('Headers:', req.headers);
    
    const header = req.headers.authorization || '';
    console.log('Authorization Header:', header);
    
    const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;
    console.log('Token extracted:', token ? 'Yes' : 'No');
    
    if (!token) {
      console.log('❌ No token provided');
      return res.status(401).json({ 
        success: false,
        error: 'No token provided' 
      });
    }

    console.log('🔍 Verifying token...');
    const decoded = await admin.auth().verifyIdToken(token);
    console.log('✅ Token verified for user:', decoded.uid);
    
    req.user = { 
      uid: decoded.uid, 
      email: decoded.email, 
      claims: decoded 
    };
    
    console.log('✅ User authenticated:', req.user.uid);
    next();
  } catch (err) {
    console.log('❌ Token verification failed:', err.message);
    console.log('❌ Error code:', err.code);
    console.log('❌ Error stack:', err.stack);
    
    return res.status(401).json({ 
      success: false,
      error: 'Invalid or expired token',
      message: err.message 
    });
  }
}

module.exports = { authMiddleware };