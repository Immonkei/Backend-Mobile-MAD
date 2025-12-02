const admin = require('firebase-admin');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

// Initialize Firebase Admin SDK
// Try to load from GOOGLE_APPLICATION_CREDENTIALS env var (service account JSON)
// If not available, use applicationDefault() credentials (from gcloud or GOOGLE_APPLICATION_CREDENTIALS env)
let credential;
try {
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credsPath && fs.existsSync(credsPath)) {
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    // Verify it's a valid service account (not a Web config)
    if (creds.private_key && creds.client_email) {
      credential = admin.credential.cert(creds);
      console.log('Loaded Firebase service account from', credsPath);
    } else {
      throw new Error('File is not a valid service account (missing private_key or client_email)');
    }
  } else {
    // Fall back to application default credentials (gcloud auth, environment variables, etc.)
    credential = admin.credential.applicationDefault();
    console.log('Using Firebase applicationDefault() credentials');
  }
} catch (err) {
  console.error('Firebase initialization error:', err.message);
  console.error('To fix: Download a service account key from Firebase Console > Project Settings > Service Accounts > Generate New Private Key');
  console.error('Place it at the path specified in GOOGLE_APPLICATION_CREDENTIALS env var (default: ./serviceAccountKey.json)');
  process.exit(1);
}

admin.initializeApp({
  credential,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
});

const db = admin.firestore();

module.exports = { admin, db };