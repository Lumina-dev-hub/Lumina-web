const User = require('../models/User');
const Referral = require('../models/Referral');
const DeviceLog = require('../models/DeviceLog');
const generateToken = require('../utils/generateToken');
const referralService = require('../services/referralService');
const subscriptionService = require('../services/subscriptionService');
const { sendOTPEmail } = require('../utils/emailService');

// ─── Helper ────────────────────────────────────────────────────────────────────
/** Generates a cryptographically random 6-digit OTP string */
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  const { fullName, email, password, deviceId } = req.body;

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      // Scenario A: User registered but email is not verified yet
      if (!userExists.isVerified) {
        if (password) {
          userExists.password = password;
        }
        if (fullName) {
          userExists.fullName = fullName;
        }
        // Generate a new 6-digit OTP
        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
        
        userExists.otp = otp;
        userExists.otpExpires = otpExpires;
        await userExists.save();
        
        // Send OTP via email
        await sendOTPEmail(userExists.email, userExists.fullName, otp);
        
        return res.status(201).json({
          success: true,
          message: 'Account was not verified. A new OTP has been sent to your email.',
          email: userExists.email,
        });
      }
      
      // Scenario B: User is verified but has not completed onboarding
      if (!userExists.isOnboarded) {
        return res.status(400).json({
          success: false,
          code: 'ONBOARDING_INCOMPLETE',
          message: 'An account already exists with this email but onboarding is incomplete. Please log in to complete your setup.',
          email: userExists.email
        });
      }

      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    let hasUsedTrial = false;
    if (deviceId) {
      const deviceExists = await DeviceLog.findOne({ deviceId });
      if (deviceExists) {
        hasUsedTrial = true; // Device already used for a free trial
      }
    }

    // Generate a real 6-digit OTP
    const otp = generateOTP();
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

    // Send OTP via EmailJS
    await sendOTPEmail(user.email, user.fullName, otp);

    res.status(201).json({
      success: true,
      message: 'OTP sent to your email address',
      email: user.email,
    });
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
    user.onboardingStep = 'profile-identity';
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
        onboardingStep: user.onboardingStep,
        settings: user.settings
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Resend OTP
// @route   POST /api/auth/resend-otp
// @access  Public
exports.resendOTP = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, message: 'Email is already verified' });
    }

    // Generate a fresh OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    // Send the new OTP via EmailJS
    await sendOTPEmail(user.email, user.fullName, otp);

    res.status(200).json({
      success: true,
      message: 'A new OTP has been sent to your email address',
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
          onboardingStep: user.onboardingStep,
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
      user.onboardingStep = 'completed';
      
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

// @desc    Update Onboarding Step
// @route   PUT /api/auth/onboarding-step
// @access  Private
exports.updateOnboardingStep = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (user) {
      if (req.body.onboardingStep) {
        user.onboardingStep = req.body.onboardingStep;
      }
      
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
      res.json({ success: true, user: updatedUser });
    } else {
      res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Forgot Password — send OTP to email
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      // Generic message to prevent user enumeration
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, an OTP has been sent.',
      });
    }

    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    await sendOTPEmail(user.email, user.fullName, otp);

    res.status(200).json({
      success: true,
      message: 'OTP sent to your email address',
      email: user.email,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reset Password — verify OTP then update password
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  try {
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email, OTP, and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    // Clear OTP fields and set new password (hashed by pre-save hook)
    user.otp = undefined;
    user.otpExpires = undefined;
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now log in.',
    });
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

// @desc    Authenticate/Register user via Google OAuth
// @route   POST /api/auth/google
// @access  Public
exports.googleAuth = async (req, res) => {
  const { OAuth2Client } = require('google-auth-library');
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ success: false, message: 'Google ID token is required' });
  }

  try {
    const webClientId = process.env.GOOGLE_CLIENT_ID || '668245289397-m2g7482o1k9q84t5q8n9p5m2463e26m8.apps.googleusercontent.com';
    const androidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID || '668245289397-m2g7482o1k9q84t5q8n9p5m2463e26m8.apps.googleusercontent.com';
    const iosClientId = process.env.GOOGLE_IOS_CLIENT_ID;

    const client = new OAuth2Client();
    
    // Verify the Google ID Token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: [webClientId, androidClientId, iosClientId].filter(Boolean),
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name: fullName, picture } = payload;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Google account must have an email address' });
    }

    // 1. Search for existing user by googleId
    let user = await User.findOne({ googleId });

    // 2. If not found by googleId, search by email to link accounts
    if (!user) {
      user = await User.findOne({ email });

      if (user) {
        // Link googleId and update provider to google
        user.googleId = googleId;
        user.authProvider = 'google';
        user.isVerified = true; // Google accounts are pre-verified
        if (!user.personal) {
          user.personal = {};
        }
        if (!user.personal.profilePhoto && picture) {
          user.personal.profilePhoto = picture;
        }
        await user.save();
      }
    }

    // 3. If still not found, create a new user
    if (!user) {
      user = await User.create({
        fullName,
        email,
        googleId,
        authProvider: 'google',
        isVerified: true,
        onboardingStep: 'profile-identity',
        personal: {
          profilePhoto: picture || '',
        },
      });

      // Grant 5-day trial since they are a new user
      await subscriptionService.grantTrial(user);

      // Generate a referral code
      await referralService.generateReferralCode(user);

      // Track referral verification step
      await referralService.trackStep(user._id, 'verification');
    }

    // Generate JWT token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        isVerified: user.isVerified,
        isOnboarded: user.isOnboarded,
        personal: user.personal,
        professional: user.professional,
        classroom: user.classroom,
        onboardingStep: user.onboardingStep,
        settings: user.settings,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


