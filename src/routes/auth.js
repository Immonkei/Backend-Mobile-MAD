const express = require('express');
const router = express.Router();
const { admin, db } = require('../admin');


// Optional: create user server-side (mobile can use Firebase SDK directly)
router.post('/create-user', async (req, res) => {
try {
const { email, password, fullName } = req.body;
const userRecord = await admin.auth().createUser({ email, password, displayName: fullName });
// create profile in firestore
await db.collection('users').doc(userRecord.uid).set({
  email,
  fullName,
  role: 'employee',
  resume: null, // Add resume field
  resumeUrl: null, // URL to uploaded resume
  createdAt: admin.firestore.FieldValue.serverTimestamp()
});
res.json({ uid: userRecord.uid });
} catch (err) {
res.status(400).json({ error: err.message });
}
});


// POST /api/auth/login
// Server-side sign-in with email/password using Firebase Auth REST API
// Returns the Firebase ID token (use in `Authorization: Bearer <idToken>`)
router.post('/login', async (req, res) => {
	try {
		const { email, password } = req.body;
		if (!email || !password) return res.status(400).json({ message: 'Missing email or password' });

		const apiKey = process.env.FIREBASE_API_KEY;
		if (!apiKey) return res.status(500).json({ message: 'FIREBASE_API_KEY not configured on server' });

		const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, password, returnSecureToken: true })
		});

		const data = await resp.json();
		if (!resp.ok) return res.status(400).json({ message: data.error?.message || 'Authentication failed', details: data });

		// data contains idToken (Firebase ID token), refreshToken, expiresIn, localId (uid)
		return res.json({ idToken: data.idToken, refreshToken: data.refreshToken, expiresIn: data.expiresIn, uid: data.localId });
	} catch (err) {
		return res.status(500).json({ message: err.message });
	}
});


module.exports = router;