const User = require("../models/User");
const Referral = require("../models/Referral");
const subscriptionService = require("./subscriptionService");
const crypto = require("crypto");

/**
 * Referral Service
 * Handles code generation, tracking, and reward logic.
 */

const REWARD_TIERS = [
  { count: 3, days: 7, plan: "Pro", id: "tier_3" },
  { count: 5, days: 14, plan: "Pro", id: "tier_5" },
  { count: 10, days: 30, plan: "Pro", id: "tier_10" },
  { count: 25, days: 30, plan: "Ultimate", id: "tier_25" },
];

/**
 * Generate a unique referral code for a user
 * @param {Object} user - User document
 */
exports.generateReferralCode = async (user) => {
  if (user.settings.referralCode) return user.settings.referralCode;

  // Format: Firstname + Random 4 chars
  const firstName = user.fullName.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "");
  const randomSuffix = crypto.randomBytes(2).toString("hex").toUpperCase();
  const code = `${firstName}${randomSuffix}`;

  user.settings.referralCode = code;
  await user.save();
  return code;
};

/**
 * Track a step completion for a referral
 * @param {string} userId - The user completing the step
 * @param {string} step - 'verification' | 'onboarding' | 'firstGeneration'
 */
exports.trackStep = async (userId, step) => {
  const referral = await Referral.findOne({ referredUser: userId });
  if (!referral || referral.status === "successful") return;

  // Mark step as complete
  referral.completedSteps[step] = true;

  // Check if all steps are complete for "Successful" status
  const { signup, verification, onboarding, firstGeneration } = referral.completedSteps;
  if (signup && verification && onboarding && firstGeneration) {
    referral.status = "successful";
    
    // Update Referrer's stats
    const referrer = await User.findById(referral.referrer);
    if (referrer) {
      referrer.settings.referralStats.successfulReferrals += 1;
      await referrer.save();
      
      // Check for rewards
      await this.checkAndApplyRewards(referrer);
    }
  }

  await referral.save();
};

/**
 * Check if referrer reached a new tier and apply rewards
 * @param {Object} referrer - User document
 */
exports.checkAndApplyRewards = async (referrer) => {
  const count = referrer.settings.referralStats.successfulReferrals;
  const unlocked = referrer.settings.unlockedRewards || [];

  for (const tier of REWARD_TIERS) {
    if (count >= tier.count && !unlocked.includes(tier.id)) {
      // Apply the reward
      await subscriptionService.addSubscriptionDays(referrer._id, tier.days, tier.plan);
      
      // Mark as unlocked
      referrer.settings.unlockedRewards.push(tier.id);
      referrer.settings.referralStats.daysEarned += tier.days;
      
      // In a real app, send a push notification here
      console.log(`[Referral] User ${referrer.email} unlocked ${tier.id}`);
    }
  }

  await referrer.save();
};
