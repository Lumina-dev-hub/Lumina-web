const mongoose = require("mongoose");

const ReferralSchema = new mongoose.Schema(
  {
    referrer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    referredUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // A user can only be referred once
    },
    status: {
      type: String,
      enum: ["pending", "successful"],
      default: "pending",
    },
    completedSteps: {
      signup: { type: Boolean, default: true },
      verification: { type: Boolean, default: false },
      onboarding: { type: Boolean, default: false },
      firstGeneration: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Referral", ReferralSchema);
