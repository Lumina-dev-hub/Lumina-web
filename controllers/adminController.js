const User = require("../models/User");
const LessonPlan = require("../models/LessonPlan");

/**
 * @desc    Get Admin Dashboard Stats
 * @route   GET /api/admin/stats
 * @access  Private/Admin
 */
exports.getStats = async (req, res) => {
  try {
    const totalTeachers = await User.countDocuments({ role: "teacher" });
    const totalLessonPlans = await LessonPlan.countDocuments();
    
    // Active Users Today (updated within last 24h)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeUsersToday = await User.countDocuments({ 
      updatedAt: { $gte: twentyFourHoursAgo },
      role: "teacher"
    });

    // Teachers with active paid plans
    const activePlanTeachers = await User.countDocuments({
      "settings.subscriptionPlan": { $in: ["Pro", "Ultimate"] },
      "settings.subscriptionExpiresAt": { $gt: new Date() }
    });

    // Calculate Monthly Revenue
    const proUsers = await User.countDocuments({
      "settings.subscriptionPlan": "Pro",
      "settings.subscriptionExpiresAt": { $gt: new Date() }
    });
    const ultimateUsers = await User.countDocuments({
      "settings.subscriptionPlan": "Ultimate",
      "settings.subscriptionExpiresAt": { $gt: new Date() }
    });
    
    const monthlyRevenue = (proUsers * 3000) + (ultimateUsers * 5000);

    // Simulated Storage Used (Approx 250KB per lesson plan)
    const storageUsedMB = (totalLessonPlans * 0.25).toFixed(2);

    // Plan Distribution
    const freePlanCount = await User.countDocuments({ 
      role: "teacher", 
      "settings.subscriptionPlan": "Free" 
    });
    const proPlanCount = await User.countDocuments({ 
      role: "teacher", 
      "settings.subscriptionPlan": "Pro" 
    });
    const ultimatePlanCount = await User.countDocuments({ 
      role: "teacher", 
      "settings.subscriptionPlan": "Ultimate" 
    });

    res.status(200).json({
      success: true,
      stats: {
        totalTeachers,
        activeUsersToday,
        totalLessonPlans,
        activePlanTeachers,
        monthlyRevenue,
        storageUsed: `${storageUsedMB} MB`,
        storageCapacity: "100%",
        planDistribution: {
          Free: freePlanCount,
          Pro: proPlanCount,
          Ultimate: ultimatePlanCount
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get Teacher Engagement Data (Chart)
 * @route   GET /api/admin/engagement
 * @access  Private/Admin
 */
exports.getEngagementData = async (req, res) => {
  try {
    // Simulated data for the last 7 days for the chart
    const data = [
      { name: "Mon", users: 1200 },
      { name: "Tue", users: 1900 },
      { name: "Wed", users: 1500 },
      { name: "Thu", users: 2100 },
      { name: "Fri", users: 1800 },
      { name: "Sat", users: 1400 },
      { name: "Sun", users: 2450 },
    ];

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get Recent Activity Logs
 * @route   GET /api/admin/activity
 * @access  Private/Admin
 */
exports.getActivityLogs = async (req, res) => {
  try {
    const recentPlans = await LessonPlan.find()
      .populate("teacher", "fullName")
      .sort({ createdAt: -1 })
      .limit(5);

    const logs = recentPlans.map(plan => ({
      id: plan._id,
      user: plan.teacher?.fullName || "Unknown User",
      action: `generated a ${plan.subjectName} Plan`,
      time: plan.createdAt,
      type: "plan"
    }));

    // Add some signup logs
    const recentSignups = await User.find({ role: "teacher" })
      .sort({ createdAt: -1 })
      .limit(3);
    
    recentSignups.forEach(user => {
      logs.push({
        id: user._id,
        user: user.fullName,
        action: "signed up as a new teacher",
        time: user.createdAt,
        type: "signup"
      });
    });

    // Sort combined logs
    logs.sort((a, b) => new Date(b.time) - new Date(a.time));

    res.status(200).json({ success: true, logs: logs.slice(0, 8) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get All Teachers
 * @route   GET /api/admin/teachers
 * @access  Private/Admin
 */
exports.getTeachers = async (req, res) => {
  try {
    const teachers = await User.find({ role: "teacher" })
      .select("fullName email professional classroom settings createdAt")
      .sort({ createdAt: -1 });

    // Map teacher stats
    const teacherData = await Promise.all(teachers.map(async (t) => {
      const planCount = await LessonPlan.countDocuments({ teacher: t._id });
      const isActive = t.settings?.subscriptionExpiresAt > new Date();
      
      return {
        id: t._id,
        name: t.fullName,
        email: t.email,
        school: t.professional?.institution || "N/A",
        subject: t.classroom?.subjects?.[0] || "General",
        plansCreated: planCount,
        status: isActive ? "Active" : "Inactive",
        profilePhoto: t.personal?.profilePhoto,
        onboarding: t.isOnboarded ? 100 : 40,
      };
    }));

    res.status(200).json({ success: true, teachers: teacherData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get All Lesson Plans
 * @route   GET /api/admin/lessons
 * @access  Private/Admin
 */
exports.getLessonPlans = async (req, res) => {
  try {
    const plans = await LessonPlan.find()
      .populate("teacher", "fullName personal.profilePhoto")
      .sort({ createdAt: -1 });

    const planData = plans.map(p => ({
      id: p._id,
      topic: p.topic,
      subject: p.subjectName,
      grade: p.studentType || "N/A",
      term: p.term || "N/A",
      week: p.weekNumber || 0,
      date: p.createdAt,
      teacher: p.teacher?.fullName || "Unknown",
      teacherPhoto: p.teacher?.personal?.profilePhoto,
      rating: "Highly Rated", // Mock
      views: p.generationCount * 4, // Mock
    }));

    res.status(200).json({ success: true, lessons: planData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
/**
 * @desc    Get Referral Stats & Logs
 * @route   GET /api/admin/referrals
 * @access  Private/Admin
 */
exports.getReferrals = async (req, res) => {
  try {
    const teachersWithReferrals = await User.find({
      $or: [
        { "settings.referredBy": { $ne: null } },
        { "settings.referralStats.totalInvited": { $gt: 0 } }
      ]
    })
    .select("fullName email settings.referralCode settings.referralStats settings.referredBy createdAt")
    .populate("settings.referredBy", "fullName email");

    const referralData = teachersWithReferrals.map(t => ({
      id: t._id,
      name: t.fullName,
      email: t.email,
      referralCode: t.settings?.referralCode || "N/A",
      invitedCount: t.settings?.referralStats?.totalInvited || 0,
      successCount: t.settings?.referralStats?.successfulReferrals || 0,
      rewardDays: t.settings?.referralStats?.daysEarned || 0,
      referredBy: t.settings?.referredBy?.fullName || "Organic",
      dateJoined: t.createdAt
    }));

    res.status(200).json({ success: true, referrals: referralData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Send Global Notifications (Bulk)
 * @route   POST /api/admin/notifications/send
 * @access  Private/Admin
 */
exports.sendGlobalNotification = async (req, res) => {
  const { sendPushNotification } = require("../services/notificationService");
  const { title, message, target } = req.body;

  try {
    let query = { role: "teacher", "settings.pushToken": { $ne: null } };

    if (target === "active") {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      query.updatedAt = { $gte: thirtyDaysAgo };
    } else if (target === "paid") {
      query["settings.subscriptionPlan"] = { $in: ["Pro", "Ultimate"] };
    } else if (target === "free") {
      query["settings.subscriptionPlan"] = "Free";
    }

    const users = await User.find(query).select("settings.pushToken");
    const tokens = users.map(u => u.settings.pushToken).filter(t => t);

    if (tokens.length === 0) {
      return res.status(400).json({ success: false, message: "No users found in this segment with push tokens" });
    }

    // Send in chunks of 100 to Expo
    let successCount = 0;
    for (const token of tokens) {
      try {
        await sendPushNotification(token, title, message, { type: "admin_broadcast" });
        successCount++;
      } catch (err) {
        console.error(`Failed to send to ${token}:`, err.message);
      }
    }

    res.status(200).json({ 
      success: true, 
      message: `Successfully broadcasted to ${successCount} users.` 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
