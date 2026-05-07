const cron = require('node-cron');
const User = require('../models/User');

const initSubscriptionCron = () => {
  // Run every night at midnight (00:00)
  cron.schedule('0 0 * * *', async () => {
    console.log('Running subscription expiry check...');
    try {
      const now = new Date();
      
      // Find users whose subscription has expired and are not on the Free plan
      const expiredUsers = await User.updateMany(
        {
          'settings.subscriptionPlan': { $ne: 'Free' },
          'settings.subscriptionExpiresAt': { $lte: now }
        },
        {
          $set: {
            'settings.subscriptionPlan': 'Free',
            'settings.subscriptionExpiresAt': null,
            'settings.subscriptionStartedAt': null
          }
        }
      );

      console.log(`Subscription check complete. Updated ${expiredUsers.modifiedCount} users.`);
    } catch (error) {
      console.error('Error running subscription expiry check:', error);
    }
  }, {
    scheduled: true,
    timezone: "UTC"
  });
};

module.exports = initSubscriptionCron;
