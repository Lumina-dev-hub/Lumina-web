const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Please add a full name"],
    },
    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please add a valid email",
      ],
    },
    password: {
      type: String,
      required: [true, "Please add a password"],
      minlength: 6,
      select: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    otp: String,
    otpExpires: Date,
    isOnboarded: {
      type: Boolean,
      default: false,
    },
    // Profile Details
    personal: {
      phone: String,
      bio: String,
      profilePhoto: String,
    },
    professional: {
      institution: String,
      position: String,
      yearsExperience: String,
    },
    classroom: {
      studentLevel: {
        type: String,
        enum: [
          "Slow",
          "Average",
          "Fast",
          "Mixed",
          "Beginner",
          "Intermediate",
          "Advanced",
        ],
        default: "Average",
      },
      lessonTemplate: {
        type: String,
        default: "Standard Weekly",
      },
      subjects: [String],
      teachingPhilosophy: [String],
      planStyle: [String],
    },
    settings: {
      language: {
        type: String,
        default: "en",
      },
      isNotificationsEnabled: {
        type: Boolean,
        default: true,
      },
      subscriptionPlan: {
        type: String,
        enum: ["Free", "Pro", "Ultimate"],
        default: "Free",
      },
      // Set when user activates a paid plan; used by cron to expire it after 30 days
      subscriptionStartedAt: {
        type: Date,
        default: null,
      },
      subscriptionExpiresAt: {
        type: Date,
        default: null,
      },
      pushToken: {
        type: String,
        default: null,
      },
      hasUsedTrial: {
        type: Boolean,
        default: false,
      },
      referralCode: {
        type: String,
        unique: true,
        sparse: true,
      },
      referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      referralStats: {
        totalInvited: { type: Number, default: 0 },
        successfulReferrals: { type: Number, default: 0 },
        daysEarned: { type: Number, default: 0 },
      },
      unlockedRewards: {
        type: [String], // e.g., ["tier_3", "tier_5"]
        default: [],
      },
    },
  },
  {
    timestamps: true,
  },
);

// Encrypt password using bcrypt
UserSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);
