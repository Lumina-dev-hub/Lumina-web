const express = require('express');
const router = express.Router();
const { 
  generateLessonPlan, 
  getLessonPlanById, 
  updateLessonPlan, 
  getMyLessonPlans,
  regeneratePlan,
  regenerateLessonNote
} = require('../controllers/lessonPlanController');
const { protect } = require('../middleware/authMiddleware');

router.route('/').get(protect, getMyLessonPlans);
router.post('/generate', protect, generateLessonPlan);
router.post('/:id/regenerate', protect, regeneratePlan);
router.post('/:id/regenerate-note', protect, regenerateLessonNote);
router.route('/:id').get(protect, getLessonPlanById).put(protect, updateLessonPlan);

module.exports = router;
