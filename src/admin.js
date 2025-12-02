const admin = require('firebase-admin');

let db = null;

// Method 1: Vercel environment variable (PRIORITY)
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
    console.log('✅ Firestore initialized successfully');
    
  } catch (error) {
    console.error('❌ Firebase initialization error from FIREBASE_CREDENTIALS_BASE64:', error.message);
  }
}
// Method 2: Local development with serviceAccountKey.json
else if (process.env.NODE_ENV !== 'production') {
  try {
    if (!admin.apps.length) {
      // Use dynamic import to avoid crashing if file doesn't exist
      const fs = require('fs');
      const path = require('path');
      const keyPath = path.join(__dirname, '../serviceAccountKey.json');
      
      if (fs.existsSync(keyPath)) {
        const serviceAccount = require(keyPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id,
          storageBucket: `${serviceAccount.project_id}.appspot.com`
        });
        console.log('✅ Firebase initialized from serviceAccountKey.json (Local)');
      } else {
        console.log('⚠️  serviceAccountKey.json not found. Running without Firebase.');
      }
    }
    
    if (admin.apps.length > 0) {
      db = admin.firestore();
      console.log('✅ Firestore initialized successfully');
    }
    
  } catch (error) {
    console.error('❌ Firebase local initialization error:', error.message);
  }
}
// Method 3: Production without credentials
else {
  console.log('⚠️  No Firebase credentials found. Running without Firebase.');
  console.log('ℹ️  Add FIREBASE_CREDENTIALS_BASE64 environment variable in Vercel');
}

module.exports = { admin, db };