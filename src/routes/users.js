const express = require('express');
const router = express.Router();
const { db, admin } = require('../admin');


// GET current user profile
router.get('/', async (req, res) => {
  try {
    const uid = req.user.uid;
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return res.status(404).json({ message: 'User not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// PUT update user profile
router.put('/', async (req, res) => {
  try {
    const uid = req.user.uid;
    await db.collection('users').doc(uid).update({
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


module.exports = router;
