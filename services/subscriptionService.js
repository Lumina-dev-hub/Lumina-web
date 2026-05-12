const User = require("../models/User");

/**
 * Subscription Service
 * Handles trial granting, additive rewards, and plan checks.
 */

// Trial duration for new users (requested: 5 days for now)
const TRIAL_DAYS = 5;

// Regeneration limits per document for Pro plan
const PRO_REGEN_LIMIT = 3;

/**
 * Grant a free trial to a new user
 * @param {Object} user - User document
 */
exports.grantTrial = async (user) => {
  if (user.settings.hasUsedTrial) return user;

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + TRIAL_DAYS);

  // Keep plan as "Free" but set expiry for trial access
  user.settings.subscriptionPlan = "Free";
  user.settings.subscriptionStartedAt = now;
  user.settings.subscriptionExpiresAt = expiresAt;
  user.settings.hasUsedTrial = true;

  return await user.save();
};

/**
 * Add days to a user's subscription (Additive)
 * @param {string} userId - User ID
 * @param {number} days - Number of days to add
 * @param {string} planType - 'Pro' | 'Ultimate'
 */
exports.addSubscriptionDays = async (userId, days, planType = "Pro") => {
  const user = await User.findById(userId);
  if (!user) return null;

  const now = new Date();
  let currentExpiry = user.settings.subscriptionExpiresAt;

  // If subscription is expired or null, start from now
  if (!currentExpiry || currentExpiry < now) {
    currentExpiry = new Date(now);
  } else {
    currentExpiry = new Date(currentExpiry);
  }

  currentExpiry.setDate(currentExpiry.getDate() + days);

  user.settings.subscriptionExpiresAt = currentExpiry;
  
  // If moving to Ultimate, set it, otherwise upgrade to Pro
  if (planType === "Ultimate") {
    user.settings.subscriptionPlan = "Ultimate";
  } else {
    // If they were Free/Trial, upgrade to Pro
    if (user.settings.subscriptionPlan !== "Ultimate") {
      user.settings.subscriptionPlan = "Pro";
    }
  }

  return await user.save();
};

/**
 * Check if a user can generate/regenerate content
 * @param {Object} user - User object from req.user
 * @param {Object} document - The content document (for regeneration checks)
 * @param {boolean} isRegen - Whether this is a regeneration request
 * @returns {Object} { canGenerate: boolean, message: string }
 */
exports.checkLimits = (user, document = null, isRegen = false) => {
  const { subscriptionPlan, subscriptionExpiresAt } = user.settings;
  const now = new Date();

  // 1. Check if Ultimate (Unlimited)
  if (subscriptionPlan === "Ultimate") {
    if (subscriptionExpiresAt && subscriptionExpiresAt > now) {
      return { canGenerate: true };
    }
  }

  // 2. Check if Pro
  if (subscriptionPlan === "Pro") {
    if (subscriptionExpiresAt && subscriptionExpiresAt > now) {
      // Check regeneration limits for Pro
      if (isRegen && document) {
        const count = document.generationCount || document.noteGenerationCount || 0;
        if (count >= PRO_REGEN_LIMIT) {
          return {
            canGenerate: false,
            message: `Regeneration limit reached (${PRO_REGEN_LIMIT}). Upgrade to Ultimate for unlimited access.`,
            limitReached: true
          };
        }
      }
      return { canGenerate: true };
    }
  }

  // 3. Check if Free with active Trial
  if (subscriptionPlan === "Free") {
    if (subscriptionExpiresAt && subscriptionExpiresAt > now) {
      // Trial users get Pro features for 5 days
      if (isRegen && document) {
        const count = document.generationCount || document.noteGenerationCount || 0;
        if (count >= PRO_REGEN_LIMIT) {
          return {
            canGenerate: false,
            message: `Regeneration limit reached (${PRO_REGEN_LIMIT}) for your trial. Upgrade for more.`,
            limitReached: true
          };
        }
      }
      return { canGenerate: true };
    }
  }

  // 4. Fallback for expired users
  return {
    canGenerate: false,
    message: "Your access has expired. Please upgrade or invite friends to continue.",
    limitReached: true
  };
};
