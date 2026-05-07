const cron = require('node-cron');
const User = require('../models/User');
const Classroom = require('../models/Classroom');
const { sendPushNotification } = require('../services/notificationService');

// Helper: parse "HH:MM" string into today's Date object
const parseTime = (timeStr, referenceDate) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const d = new Date(referenceDate);
  d.setHours(hours, minutes, 0, 0);
  return d;
};

// Helper: get today's 3-letter day abbreviation matching the schema
const getTodayDayCode = () => {
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return days[new Date().getDay()];
};

const initSubscriptionCron = () => {

  // ─────────────────────────────────────────────
  // 1. Subscription Expiry (runs every night at midnight)
  // ─────────────────────────────────────────────
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running subscription expiry check...');
    try {
      const now = new Date();

      // Expire overdue subscriptions
      const expiredUsers = await User.find({
        'settings.subscriptionPlan': { $ne: 'Free' },
        'settings.subscriptionExpiresAt': { $lte: now },
        'settings.pushToken': { $ne: null },
      });

      for (const user of expiredUsers) {
        const token = user.settings.pushToken;
        if (token) {
          await sendPushNotification(
            token,
            '📦 Subscription Expired',
            'Your plan has expired. Upgrade again to keep your AI features.',
            { type: 'subscription_expired' }
          );
        }
      }

      // Bulk downgrade expired users
      await User.updateMany(
        {
          'settings.subscriptionPlan': { $ne: 'Free' },
          'settings.subscriptionExpiresAt': { $lte: now },
        },
        {
          $set: {
            'settings.subscriptionPlan': 'Free',
            'settings.subscriptionExpiresAt': null,
            'settings.subscriptionStartedAt': null,
          },
        }
      );

      console.log(`[Cron] Expiry check done. Expired ${expiredUsers.length} users.`);
    } catch (error) {
      console.error('[Cron] Subscription expiry error:', error);
    }
  }, { scheduled: true, timezone: 'UTC' });


  // ─────────────────────────────────────────────
  // 2. Subscription Expiry Reminders (last 3 days)
  //    Runs every day at 8:00 AM
  // ─────────────────────────────────────────────
  cron.schedule('0 8 * * *', async () => {
    console.log('[Cron] Running subscription expiry reminders...');
    try {
      const now = new Date();

      for (const daysLeft of [3, 2, 1]) {
        const windowStart = new Date(now);
        const windowEnd = new Date(now);
        windowStart.setDate(now.getDate() + daysLeft);
        windowStart.setHours(0, 0, 0, 0);
        windowEnd.setDate(now.getDate() + daysLeft);
        windowEnd.setHours(23, 59, 59, 999);

        const users = await User.find({
          'settings.subscriptionPlan': { $ne: 'Free' },
          'settings.subscriptionExpiresAt': { $gte: windowStart, $lte: windowEnd },
          'settings.pushToken': { $ne: null },
        });

        for (const user of users) {
          const token = user.settings.pushToken;
          const dayWord = daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
          if (token) {
            await sendPushNotification(
              token,
              `⏳ Plan Expiring ${daysLeft === 1 ? 'Tomorrow' : `in ${daysLeft} Days`}`,
              `Your ${user.settings.subscriptionPlan} plan expires ${dayWord}. Renew to keep your access.`,
              { type: 'subscription_expiring', daysLeft }
            );
          }
        }
      }

      console.log('[Cron] Subscription reminders sent.');
    } catch (error) {
      console.error('[Cron] Subscription reminder error:', error);
    }
  }, { scheduled: true, timezone: 'UTC' });


  // ─────────────────────────────────────────────
  // 3. Class Reminders (15 min & 5 min before)
  //    Runs every minute
  // ─────────────────────────────────────────────
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const todayCode = getTodayDayCode();

      // Fetch all classrooms that have a period today
      const classrooms = await Classroom.find({
        'schedule.day': todayCode,
      }).populate({
        path: 'teacher',
        select: 'settings.pushToken',
      });

      for (const classroom of classrooms) {
        const teacher = classroom.teacher;
        if (!teacher || !teacher.settings?.pushToken) continue;

        const token = teacher.settings.pushToken;
        const todayPeriods = classroom.schedule.filter(p => p.day === todayCode);

        for (const period of todayPeriods) {
          const classStart = parseTime(period.startTime, now);
          const diffMs = classStart - now;
          const diffMins = Math.round(diffMs / 60000);

          if (diffMins === 15) {
            await sendPushNotification(
              token,
              '🔔 Class in 15 Minutes',
              `${period.subject} (${classroom.name}) starts at ${period.startTime}. Get ready!`,
              { type: 'class_reminder', classroomId: classroom._id, minutesBefore: 15 }
            );
          } else if (diffMins === 5) {
            await sendPushNotification(
              token,
              '⚡ Class Starting Soon!',
              `${period.subject} (${classroom.name}) starts in 5 minutes. Head to class!`,
              { type: 'class_reminder', classroomId: classroom._id, minutesBefore: 5 }
            );
          }
        }
      }
    } catch (error) {
      console.error('[Cron] Class reminder error:', error);
    }
  });

};

module.exports = initSubscriptionCron;
