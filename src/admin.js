const admin = require('firebase-admin');

let db = null;
let auth = null;

// Method 1: Vercel environment variable (for production)
if (process.env.FIREBASE_CREDENTIALS_BASE64) {
  try {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(
        Buffer.from(process.env.FIREBASE_CREDENTIALS_BASE64, 'base64').toString()
      );
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
        storageBucket: `${serviceAccount.project_id}.appspot.com`
      });
      
      console.log('✅ Firebase initialized from FIREBASE_CREDENTIALS_BASE64 (Vercel)');
    }
    
    db = admin.firestore();
    auth = admin.auth();
    
  } catch (error) {
    console.error('❌ Firebase initialization error:', error.message);
  }
}
// Method 2: Local development
else {
  try {
    if (!admin.apps.length) {
      const serviceAccount = require('../serviceAccountKey.json');
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
        storageBucket: `${serviceAccount.project_id}.appspot.com`
      });
      
      console.log('✅ Firebase initialized from serviceAccountKey.json (Local)');
    }
    
    db = admin.firestore();
    auth = admin.auth();
    
  } catch (error) {
    console.error('❌ Firebase local initialization error:', error.message);
  }
}

module.exports = { admin, db, auth };