const express = require('express');
const router = express.Router();
const { db, admin } = require('../admin');


// GET my favourites
router.get('/', async (req, res) => {
  try {
    const uid = req.user.uid;
    const snap = await db.collection('favourites').where('userId', '==', uid).get();
    const favs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ data: favs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// POST add favourite
router.post('/', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { jobId } = req.body;
    const ref = await db.collection('favourites').add({
      userId: uid,
      jobId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ id: ref.id, success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// DELETE favourite
router.delete('/:jobId', async (req, res) => {
  try {
    const uid = req.user.uid;
    const jobId = req.params.jobId;
    const snap = await db.collection('favourites').where('userId', '==', uid).where('jobId', '==', jobId).get();
    if (snap.empty) return res.status(404).json({ message: 'Favourite not found' });
    await snap.docs[0].ref.delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


module.exports = router;
