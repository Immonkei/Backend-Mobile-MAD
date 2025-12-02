const { db } = require('../admin');


function requireRole(role) {
return async (req, res, next) => {
try {
// prefer custom claim
if (req.user?.claims?.role) {
if (req.user.claims.role === role) return next();
return res.status(403).json({ message: 'Forbidden' });
}


const doc = await db.collection('users').doc(req.user.uid).get();
if (!doc.exists) return res.status(403).json({ message: 'Profile not found' });
const data = doc.data();
if (data.role !== role) return res.status(403).json({ message: 'Forbidden' });
next();
} catch (err) {
res.status(500).json({ message: err.message });
}
};
}


module.exports = { requireRole };