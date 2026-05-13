const express = require("express");
const router = express.Router();
const {
  getStats,
  getEngagementData,
  getActivityLogs,
  getTeachers,
  getLessonPlans,
  getReferrals,
  sendGlobalNotification,
} = require("../controllers/adminController");
const { protect, admin } = require("../middleware/authMiddleware");

// All routes are protected and admin-only
router.use(protect);
router.use(admin);

router.get("/stats", getStats);
router.get("/engagement", getEngagementData);
router.get("/activity", getActivityLogs);
router.get("/teachers", getTeachers);
router.get("/lessons", getLessonPlans);
router.get("/referrals", getReferrals);
router.post("/notifications/send", sendGlobalNotification);

module.exports = router;
