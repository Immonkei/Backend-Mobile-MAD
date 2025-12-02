const admin = require('firebase-admin');

let firestore = null;

try {
  // Check if Firebase is already initialized
  if (!admin.apps.length) {
    // Method 1: Environment variable (Vercel)
    if (process.env.FIREBASE_CREDENTIALS_BASE64) {
      const serviceAccount = JSON.parse(
        Buffer.from(process.env.FIREBASE_CREDENTIALS_BASE64, 'base64').toString()
      );
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      
      console.log('✅ Firebase initialized from environment variable (Vercel)');
    } 
    // Method 2: Local development - check if file exists WITHOUT requiring it
    else if (process.env.NODE_ENV !== 'production') {
      // Use dynamic import to avoid synchronous require
      const fs = require('fs');
      const path = require('path');
      
      const keyPath = path.join(__dirname, '../serviceAccountKey.json');
      
      if (fs.existsSync(keyPath)) {
        // Only require if file exists
        const serviceAccount = require(keyPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase initialized from local file (Development)');
      } else {
        console.log('⚠️  Running without Firebase - serviceAccountKey.json not found locally');
        console.log('ℹ️  Create serviceAccountKey.json or set FIREBASE_CREDENTIALS_BASE64 env var');
      }
    }
    // Method 3: Production without env var
    else {
      console.log('⚠️  Running without Firebase - no credentials available in production');
    }
  }
  
  // Only initialize Firestore if Firebase was initialized
  if (admin.apps.length > 0) {
    firestore = admin.firestore();
    console.log('✅ Firestore initialized successfully');
  } else {
    console.log('ℹ️  Firestore not available - Firebase not initialized');
  }
  
} catch (error) {
  console.error('❌ Firebase initialization error:', error.message);
  // Continue without Firebase
}

module.exports = { admin, firestore };