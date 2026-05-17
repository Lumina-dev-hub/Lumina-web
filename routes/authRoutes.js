const express = require('express');
const router = express.Router();
const {
  register,
  verifyOTP,
  resendOTP,
  login,
  getMe,
  updateProfile,
  completeOnboarding,
  updateOnboardingStep,
  uploadPhoto,
  changePassword,
  updatePushToken,
  testNotification,
  forgotPassword,
  resetPassword,
  googleAuth,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../config/cloudinary');

router.post('/register', register);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/login', login);
router.post('/google', googleAuth);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/onboarding', protect, completeOnboarding);
router.put('/onboarding-step', protect, updateOnboardingStep);
router.post('/upload-photo', protect, upload.single('image'), uploadPhoto);
router.put('/change-password', protect, changePassword);
router.put('/push-token', protect, updatePushToken);
router.post('/test-notification', protect, testNotification);


module.exports = router;
