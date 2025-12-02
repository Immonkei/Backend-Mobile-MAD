const admin = require('firebase-admin');

/**
 * Send notification to multiple users via FCM
 * @param {Array} userIds - Array of user UIDs to send notifications to
 * @param {Object} notification - Notification object with title and body
 * @param {Object} data - Additional data payload (optional)
 */
const sendNotificationToUsers = async (userIds, notification, data = {}) => {
  try {
    if (!userIds || userIds.length === 0) {
      console.log('No users to send notification to');
      return;
    }

    // Get FCM tokens for all users
    const tokens = await getFCMTokensForUsers(userIds);
    
    if (tokens.length === 0) {
      console.log('No FCM tokens found for users:', userIds);
      return;
    }

    const message = {
      notification: {
        title: notification.title || 'Job Portal Notification',
        body: notification.body || 'You have a new notification',
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      tokens: tokens, // Send to multiple tokens
    };

    // Send multicast message
    const response = await admin.messaging().sendEachForMulticast(message);
    
    console.log(`Notifications sent successfully:`, {
      successCount: response.successCount,
      failureCount: response.failureCount,
      totalUsers: userIds.length,
      tokensSent: tokens.length
    });

    // Log failures for debugging
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`Failed to send to token ${tokens[idx]}:`, resp.error);
        }
      });
    }

    return response;

  } catch (error) {
    console.error('Error sending FCM notifications:', error);
    throw error;
  }
};

/**
 * Get FCM tokens for a list of user IDs
 * @param {Array} userIds - Array of user UIDs
 * @returns {Array} Array of FCM tokens
 */
const getFCMTokensForUsers = async (userIds) => {
  try {
    const tokens = [];
    
    for (const userId of userIds) {
      try {
        // Get user document from Firestore
        const userDoc = await admin.firestore().collection('users').doc(userId).get();
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          // Check if user has FCM token stored
          if (userData.fcmToken) {
            tokens.push(userData.fcmToken);
          }
        }
      } catch (userError) {
        console.error(`Error getting token for user ${userId}:`, userError);
      }
    }

    // Remove duplicate tokens
    return [...new Set(tokens)];

  } catch (error) {
    console.error('Error getting FCM tokens:', error);
    return [];
  }
};

/**
 * Update user's FCM token (call this from your client/app)
 * @param {string} userId - User UID
 * @param {string} token - FCM token
 */
const updateUserFCMToken = async (userId, token) => {
  try {
    await admin.firestore().collection('users').doc(userId).update({
      fcmToken: token,
      fcmTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`FCM token updated for user: ${userId}`);
    return true;
  } catch (error) {
    console.error('Error updating FCM token:', error);
    throw error;
  }
};

/**
 * Send notification to a single user
 * @param {string} userId - User UID
 * @param {Object} notification - Notification object
 * @param {Object} data - Additional data
 */
const sendNotificationToUser = async (userId, notification, data = {}) => {
  return sendNotificationToUsers([userId], notification, data);
};

module.exports = {
  sendNotificationToUsers,
  sendNotificationToUser,
  updateUserFCMToken,
  getFCMTokensForUsers
};