const admin = require('firebase-admin');

let db = null;
let firestore = null;

try {
  // Check if Firebase is already initialized
  if (!admin.apps.length) {
    // For Vercel deployment
    if (process.env.FIREBASE_CREDENTIALS_BASE64) {
      const serviceAccount = JSON.parse(
        Buffer.from(process.env.FIREBASE_CREDENTIALS_BASE64, 'base64').toString()
      );
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        // Note: Firestore doesn't need databaseURL like Realtime Database
      });
      
      console.log('✅ Firebase initialized successfully (Vercel)');
    } 
    // For local development
    else if (process.env.NODE_ENV !== 'production') {
      try {
        const serviceAccount = require('../serviceAccountKey.json');
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase initialized successfully (Local)');
      } catch (fileError) {
        console.log('⚠️  Running without Firebase - serviceAccountKey.json not found');
      }
    }
  }
  
  // Initialize Firestore (NOT Realtime Database)
  firestore = admin.firestore();
  console.log('✅ Firestore initialized successfully');
  
} catch (error) {
  console.error('❌ Firebase initialization error:', error.message);
}

module.exports = { admin, firestore };