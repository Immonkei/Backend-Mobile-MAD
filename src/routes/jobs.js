const express = require('express');
const router = express.Router();
const { db } = require('../admin');


// GET /api/jobs?q=&tags=&location=&page=&limit=
router.get('/', async (req, res) => {
try {
const { q, tags, location, page = 1, limit = 20 } = req.query;
let ref = db.collection('jobs').where('status', '==', 'published').orderBy('createdAt', 'desc');


// Basic tag filter
if (tags) {
const t = tags.split(',').map(s => s.trim());
ref = ref.where('tags', 'array-contains-any', t);
}


// Simple pagination (offset) - for demo only
const snapshot = await ref.get();
const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
const start = (page - 1) * limit;
const paged = all.slice(start, start + Number(limit));
res.json({ data: paged, total: all.length });
} catch (err) {
res.status(500).json({ message: err.message });
}
});


// GET job detail
router.get('/:id', async (req, res) => {
try {
const doc = await db.collection('jobs').doc(req.params.id).get();
if (!doc.exists) return res.status(404).json({ message: 'Job not found' });
// increment views (firestore increment)
await db.collection('jobs').doc(req.params.id).update({ views: admin.firestore.FieldValue.increment(1) });
res.json({ id: doc.id, ...doc.data() });
} catch (err) {
res.status(500).json({ message: err.message });
}
});


module.exports = router;