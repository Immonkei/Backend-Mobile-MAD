const { admin } = require('../admin');


async function authMiddleware(req, res, next) {
try {
const header = req.headers.authorization || '';
const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;
if (!token) return res.status(401).json({ message: 'No token provided' });


const decoded = await admin.auth().verifyIdToken(token);
req.user = { uid: decoded.uid, email: decoded.email, claims: decoded };
next();
} catch (err) {
return res.status(401).json({ message: 'Invalid or expired token', error: err.message });
}
}


module.exports = { authMiddleware };