const User = require('../models/User');
const Referral = require('../models/Referral');
const DeviceLog = require('../models/DeviceLog');
const generateToken = require('../utils/generateToken');
const referralService = require('../services/referralService');
const subscriptionService = require('../services/subscriptionService');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  const { fullName, email, password, deviceId } = req.body;

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    let hasUsedTrial = false;
    if (deviceId) {
      const deviceExists = await DeviceLog.findOne({ deviceId });
      if (deviceExists) {
        hasUsedTrial = true; // Device already used for a free trial
      }
    }

    // Generate simulated OTP (Fixed to 123456 for testing)
    const otp = "123456";
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    const user = await User.create({
      fullName,
      email,
      password,
      otp,
      otpExpires,
      settings: {
        hasUsedTrial,
      }
    });

    if (deviceId) {
      await DeviceLog.create({ deviceId, userId: user._id });
    }

    // Handle Referral logic
    if (req.body.referralCode) {
      const referrer = await User.findOne({ 'settings.referralCode': req.body.referralCode });
      if (referrer && referrer._id.toString() !== user._id.toString()) {
        user.settings.referredBy = referrer._id;
        await user.save();

        await Referral.create({
          referrer: referrer._id,
          referredUser: user._id,
        });

        // Update Referrer total invited count
        referrer.settings.referralStats.totalInvited += 1;
        await referrer.save();
      }
    }

    // Generate referral code for the new user
    await referralService.generateReferralCode(user);

    if (user) {
      res.status(201).json({
        success: true,
        message: 'OTP sent to email (simulated)',
        email: user.email,
        debug_otp: otp 
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;

    // Grant 5-day trial if eligible
    await subscriptionService.grantTrial(user);

    // Track referral verification step
    await referralService.trackStep(user._id, 'verification');

    await user.save();

    res.status(200).json({
      success: true,
      token: generateToken(user._id),
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        isVerified: user.isVerified,
        isOnboarded: user.isOnboarded,
        settings: user.settings
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email }).select('+password');

    if (user && (await user.matchPassword(password))) {
      res.json({
        success: true,
        token: generateToken(user._id),
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          isVerified: user.isVerified,
          isOnboarded: user.isOnboarded,
          personal: user.personal,
          professional: user.professional,
          classroom: user.classroom,
          settings: user.settings
        }
      });
    } else {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (user) {
      // Update fields if provided
      if (req.body.fullName) user.fullName = req.body.fullName;

      // Use direct assignment for nested objects to avoid Mongoose validation issues with spread operator
      if (req.body.personal) {
        Object.keys(req.body.personal).forEach(key => {
          user.personal[key] = req.body.personal[key];
        });
      }
      if (req.body.professional) {
        Object.keys(req.body.professional).forEach(key => {
          user.professional[key] = req.body.professional[key];
        });
      }
      if (req.body.classroom) {
        Object.keys(req.body.classroom).forEach(key => {
          user.classroom[key] = req.body.classroom[key];
        });
      }
      if (req.body.settings) {
        Object.keys(req.body.settings).forEach(key => {
          user.settings[key] = req.body.settings[key];
        });
      }

      const updatedUser = await user.save();
      res.json({ success: true, user: updatedUser });
    } else {
      res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Complete Onboarding
// @route   PUT /api/auth/onboarding
// @access  Private
exports.completeOnboarding = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (user) {
      user.isOnboarded = true;
      
      if (req.body.personal) {
        Object.keys(req.body.personal).forEach(key => {
          user.personal[key] = req.body.personal[key];
        });
      }
      if (req.body.professional) {
        Object.keys(req.body.professional).forEach(key => {
          user.professional[key] = req.body.professional[key];
        });
      }
      if (req.body.classroom) {
        Object.keys(req.body.classroom).forEach(key => {
          user.classroom[key] = req.body.classroom[key];
        });
      }

      const updatedUser = await user.save();
      await referralService.trackStep(user._id, 'onboarding');
      res.json({ success: true, user: updatedUser });
    } else {
      res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Upload profile photo
// @route   POST /api/auth/upload-photo
// @access  Private
exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a file' });
    }

    res.status(200).json({
      success: true,
      url: req.file.path // Cloudinary URL from multer-storage-cloudinary
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Change Password
// @route   PUT /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if current password matches
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect current password' });
    }

    // Set new password (will be hashed by pre-save hook)
    user.password = newPassword;
    await user.save();

    res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update push token
// @route   PUT /api/auth/push-token
// @access  Private
exports.updatePushToken = async (req, res) => {
  const { pushToken } = req.body;

  try {
    const user = await User.findById(req.user.id);

    if (user) {
      user.settings.pushToken = pushToken;
      await user.save();
      res.json({ success: true, message: 'Push token updated' });
    } else {
      res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Test push notification
// @route   POST /api/auth/test-notification
// @access  Private
exports.testNotification = async (req, res) => {
  const { sendPushNotification } = require('../services/notificationService');

  try {
    const user = await User.findById(req.user.id);
    const token = user.settings.pushToken;

    if (!token) {
      return res.status(400).json({ success: false, message: 'No push token found for this user' });
    }

    await sendPushNotification(
      token,
      '🧪 Test Notification',
      'This is a manual test notification from Lumina AI!',
      { type: 'test' }
    );

    res.json({ success: true, message: 'Test notification sent' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


