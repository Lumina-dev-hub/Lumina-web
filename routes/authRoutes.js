const express = require('express');
const router = express.Router();
const {
  register,
  verifyOTP,
  login,
  getMe,
  updateProfile,
  completeOnboarding,
  uploadPhoto,
  changePassword,
  updatePushToken,
  testNotification,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../config/cloudinary');

router.post('/register', register);
router.post('/verify-otp', verifyOTP);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/onboarding', protect, completeOnboarding);
router.post('/upload-photo', protect, upload.single('image'), uploadPhoto);
router.put('/change-password', protect, changePassword);
router.put('/push-token', protect, updatePushToken);
router.post('/test-notification', protect, testNotification);


module.exports = router;
