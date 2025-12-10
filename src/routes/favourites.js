const express = require('express');
const router = express.Router();
const { admin, db } = require('../admin');

// GET /api/favourites - Get my favorite jobs
router.get('/', async (req, res) => {
  try {
    const userId = req.user.uid;
    
    // Get user's favorite job IDs
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const favoriteIds = userData?.favorites || [];
    
    if (favoriteIds.length === 0) {
      return res.json({
        success: true,
        favorites: [],
        total: 0
      });
    }
    
    // Get favorite jobs
    const favorites = [];
    
    for (const jobId of favoriteIds) {
      try {
        const jobDoc = await db.collection('jobs').doc(jobId).get();
        if (jobDoc.exists && jobDoc.data().status === 'published') {
          favorites.push({
            id: jobDoc.id,
            ...jobDoc.data(),
            isFavorited: true
          });
        }
      } catch (error) {
        console.error(`Error fetching favorite job ${jobId}:`, error);
      }
    }
    
    res.json({
      success: true,
      favorites,
      total: favorites.length
    });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch favorites',
      message: error.message 
    });
  }
});

// POST /api/favourites/:jobId - Add job to favorites
router.post('/:jobId', async (req, res) => {
  try {
    const userId = req.user.uid;
    const jobId = req.params.jobId;
    
    // Check if job exists
    const jobDoc = await db.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'Job not found' 
      });
    }
    
    // Get current favorites
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.data();
    const favorites = userData?.favorites || [];
    
    // Check if already favorited
    if (favorites.includes(jobId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Job already in favorites' 
      });
    }
    
    // Add to favorites
    favorites.push(jobId);
    await userRef.update({
      favorites,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      message: 'Job added to favorites',
      jobId,
      totalFavorites: favorites.length
    });
  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to add to favorites',
      message: error.message 
    });
  }
});

// DELETE /api/favourites/:jobId - Remove from favorites
router.delete('/:jobId', async (req, res) => {
  try {
    const userId = req.user.uid;
    const jobId = req.params.jobId;
    
    // Get current favorites
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.data();
    let favorites = userData?.favorites || [];
    
    // Check if in favorites
    if (!favorites.includes(jobId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Job not in favorites' 
      });
    }
    
    // Remove from favorites
    favorites = favorites.filter(id => id !== jobId);
    await userRef.update({
      favorites,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      message: 'Job removed from favorites',
      jobId,
      totalFavorites: favorites.length
    });
  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to remove from favorites',
      message: error.message 
    });
  }
});

// GET /api/favourites/check/:jobId - Check if job is favorited
router.get('/check/:jobId', async (req, res) => {
  try {
    const userId = req.user.uid;
    const jobId = req.params.jobId;
    
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const favorites = userData?.favorites || [];
    
    res.json({
      success: true,
      isFavorited: favorites.includes(jobId),
      totalFavorites: favorites.length
    });
  } catch (error) {
    console.error('Check favorite error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to check favorite status',
      message: error.message 
    });
  }
});

module.exports = router;