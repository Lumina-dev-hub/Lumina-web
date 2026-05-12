const cron = require("node-cron");
const axios = require("axios");
const User = require("../models/User");
const Classroom = require("../models/Classroom");
const { sendPushNotification } = require("../services/notificationService");

// Helper: parse "HH:MM" string into today's Date object
const parseTime = (timeStr, referenceDate) => {
  // Handles formats like "08:00 AM", "8:00 PM", or "13:00"
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return new Date(NaN);

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const modifier = match[3] ? match[3].toUpperCase() : null;

  if (modifier === 'PM' && hours < 12) {
    hours += 12;
  }
  if (modifier === 'AM' && hours === 12) {
    hours = 0;
  }

  const d = new Date(referenceDate);
  d.setHours(hours, minutes, 0, 0);
  return d;
};

// Helper: get today's 3-letter day abbreviation matching the schema in Lagos timezone
const getTodayDayCode = (referenceDate) => {
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const targetDate =
    referenceDate ||
    new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
  return days[targetDate.getDay()];
};

const initSubscriptionCron = () => {
  // ─────────────────────────────────────────────
  // 1. Subscription Expiry (runs every night at midnight)
  // ─────────────────────────────────────────────
  cron.schedule(
    "0 0 * * *",
    async () => {
      console.log("[Cron] Running subscription expiry check...");
      try {
        const now = new Date();

        // Expire overdue subscriptions
        const expiredUsers = await User.find({
          "settings.subscriptionPlan": { $ne: "Free" },
          "settings.subscriptionExpiresAt": { $lte: now },
          "settings.pushToken": { $ne: null },
        });

        for (const user of expiredUsers) {
          const token = user.settings.pushToken;
          if (token) {
            await sendPushNotification(
              token,
              "📦 Subscription Expired",
              "Your plan has expired. Upgrade again to keep your AI features.",
              { type: "subscription_expired" },
            );
          }
        }

        // Bulk downgrade expired users
        await User.updateMany(
          {
            "settings.subscriptionPlan": { $ne: "Free" },
            "settings.subscriptionExpiresAt": { $lte: now },
          },
          {
            $set: {
              "settings.subscriptionPlan": "Free",
              "settings.subscriptionExpiresAt": null,
              "settings.subscriptionStartedAt": null,
            },
          },
        );

        console.log(
          `[Cron] Expiry check done. Expired ${expiredUsers.length} users.`,
        );
      } catch (error) {
        console.error("[Cron] Subscription expiry error:", error);
      }
    },
    { scheduled: true, timezone: "Africa/Lagos" },
  );

  // ─────────────────────────────────────────────
  // 2. Subscription Expiry Reminders (last 3 days)
  //    Runs every day at 8:00 AM
  // ─────────────────────────────────────────────
  cron.schedule(
    "0 8 * * *",
    async () => {
      console.log("[Cron] Running subscription expiry reminders...");
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
            "settings.subscriptionPlan": { $ne: "Free" },
            "settings.subscriptionExpiresAt": {
              $gte: windowStart,
              $lte: windowEnd,
            },
            "settings.pushToken": { $ne: null },
          });

          for (const user of users) {
            const token = user.settings.pushToken;
            const dayWord = daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
            if (token) {
              await sendPushNotification(
                token,
                `⏳ Plan Expiring ${daysLeft === 1 ? "Tomorrow" : `in ${daysLeft} Days`}`,
                `Your ${user.settings.subscriptionPlan} plan expires ${dayWord}. Renew to keep your access.`,
                { type: "subscription_expiring", daysLeft },
              );
            }
          }
        }

        console.log("[Cron] Subscription reminders sent.");
      } catch (error) {
        console.error("[Cron] Subscription reminder error:", error);
      }
    },
    { scheduled: true, timezone: "Africa/Lagos" },
  );

  // ─────────────────────────────────────────────
  // 3. Class Reminders (15 min & 5 min before)
  //    Runs every minute
  // ─────────────────────────────────────────────
  cron.schedule(
    "* * * * *",
    async () => {
      try {
        // Get current time in Nigerian timezone (Africa/Lagos)
        const now = new Date(
          new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" }),
        );
        const todayCode = getTodayDayCode(now);

        console.log(
          `[Cron] Checking reminders at ${now.toISOString()} (Lagos). Day: ${todayCode}`,
        );

        // Fetch all classrooms that have a period today
        const classrooms = await Classroom.find({
          "schedule.day": todayCode,
        }).populate({
          path: "teacher",
          select: "settings.pushToken",
        });

        if (classrooms.length > 0) {
          console.log(
            `[Cron] Found ${classrooms.length} classrooms with periods today.`,
          );
        }

        for (const classroom of classrooms) {
          const teacher = classroom.teacher;
          
          if (!teacher) {
            console.log(`[Cron] No teacher found for classroom: ${classroom.name} (${classroom._id})`);
            continue;
          }

          if (!teacher.settings?.pushToken) {
            console.log(`[Cron] Teacher ${teacher._id} has no push token for classroom: ${classroom.name}`);
            continue;
          }

          const token = teacher.settings.pushToken;
          const todayPeriods = classroom.schedule.filter(
            (p) => p.day === todayCode,
          );

          console.log(`[Cron] Classroom ${classroom.name} has ${todayPeriods.length} periods today.`);

          for (const period of todayPeriods) {
            const classStart = parseTime(period.startTime, now);
            const diffMs = classStart - now;
            const diffMins = Math.round(diffMs / 60000);

            console.log(`[Cron] DEBUG: ${period.subject} | Start: ${period.startTime} | diffMins: ${diffMins}`);

            if (diffMins === 15) {
              console.log(
                `[Cron] TRIGGER: 15m reminder for ${period.subject} to ${teacher._id}`,
              );
              await sendPushNotification(
                token,
                "🔔 Class in 15 Minutes",
                `${period.subject} (${classroom.name}) starts at ${period.startTime}. Get ready!`,
                {
                  type: "class_reminder",
                  classroomId: classroom._id,
                  minutesBefore: 15,
                },
              );
            } else if (diffMins === 5) {
              console.log(
                `[Cron] TRIGGER: 5m reminder for ${period.subject} to ${teacher._id}`,
              );
              await sendPushNotification(
                token,
                "⚡ Class Starting Soon!",
                `${period.subject} (${classroom.name}) starts in 5 minutes. Head to class!`,
                {
                  type: "class_reminder",
                  classroomId: classroom._id,
                  minutesBefore: 5,
                },
              );
            }
          }
        }

      } catch (error) {
        console.error("[Cron] Class reminder error:", error);
      }
    },
    { scheduled: true, timezone: "Africa/Lagos" },
  );

  // ─────────────────────────────────────────────
  // 4. Keep-Alive Ping (prevents Render from sleeping)
  //    Runs every 10 minutes
  // ─────────────────────────────────────────────
  cron.schedule("*/10 * * * *", async () => {
    try {
      // If a backend URL is provided in env, use it, otherwise fallback to localhost
      const url =
        process.env.BACKEND_URL ||
        `http://localhost:${process.env.PORT || 5000}`;
      console.log(`[Cron] Pinging self at ${url}/api/health to keep alive...`);
      await axios.get(`${url}/api/health`);
    } catch (error) {
      console.error("[Cron] Keep-alive ping failed:", error.message);
    }
  });
};

module.exports = initSubscriptionCron;
