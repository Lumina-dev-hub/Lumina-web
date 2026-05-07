const express = require('express');
const router = express.Router();
const {
  createClass,
  getClasses,
  getClassById,
  updateClass,
  deleteClass,
  getSchedule,
  getAcademicSessions
} = require('../controllers/classroomController');
const { protect } = require('../middleware/authMiddleware');

router.get('/sessions', protect, getAcademicSessions);
router.get('/schedule', protect, getSchedule);
router.get('/schedule/today', protect, getSchedule); // Keep for compatibility
router.route('/').post(protect, createClass).get(protect, getClasses);
router.route('/:id').get(protect, getClassById).put(protect, updateClass).delete(protect, deleteClass);

module.exports = router;
