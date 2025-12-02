const express = require('express');
const router = express.Router();
const { db, admin } = require('../admin');


// Create job (admin)
router.post('/', async (req, res) => {
try {
const payload = {
...req.body,
createdBy: req.user.uid,
createdAt: admin.firestore.FieldValue.serverTimestamp(),
applicantsCount: 0,
views: 0,
status: req.body.status || 'published'
};
const ref = await db.collection('jobs').add(payload);
const doc = await ref.get();
res.json({ id: ref.id, ...doc.data() });
} catch (err) {
res.status(500).json({ message: err.message });
}
});


// Update job
router.put('/:id', async (req, res) => {
try {
await db.collection('jobs').doc(req.params.id).update({ ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
res.json({ success: true });
} catch (err) {
res.status(500).json({ message: err.message });
}
});


// Delete job
router.delete('/:id', async (req, res) => {
try {
await db.collection('jobs').doc(req.params.id).delete();
res.json({ success: true });
} catch (err) {
res.status(500).json({ message: err.message });
}
});


module.exports = router;