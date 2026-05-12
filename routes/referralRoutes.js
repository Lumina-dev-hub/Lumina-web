const express = require("express");
const router = express.Router();
const Referral = require("../models/Referral");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");

// @desc    Get referral stats and code
// @route   GET /api/referrals/stats
// @access  Private
router.get("/stats", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const stats = user.settings.referralStats;
    const code = user.settings.referralCode;
    const unlockedRewards = user.settings.unlockedRewards;

    // Base URL for referral link - should be from env ideally
    const baseUrl = process.env.CLIENT_URL || "https://lumina-ai.app";
    const referralLink = `${baseUrl}/register?ref=${code}`;

    res.json({
      success: true,
      data: {
        code,
        referralLink,
        stats,
        unlockedRewards,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @desc    Get list of referrals
// @route   GET /api/referrals/list
// @access  Private
router.get("/list", protect, async (req, res) => {
  try {
    const referrals = await Referral.find({ referrer: req.user.id })
      .populate("referredUser", "fullName email")
      .sort("-createdAt");

    res.json({
      success: true,
      data: referrals,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
