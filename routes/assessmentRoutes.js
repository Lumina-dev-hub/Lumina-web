const express = require('express');
const router = express.Router();
const {
  generateAssessment,
  getMyAssessments,
  getAssessmentById,
  updateAssessment,
  deleteAssessment,
  getAvailableTopics,
  regenerateAssessment
} = require('../controllers/assessmentController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.post('/generate', generateAssessment);
router.post('/:id/regenerate', regenerateAssessment);
router.get('/', getMyAssessments);
router.get('/topics', getAvailableTopics);
router.get('/:id', getAssessmentById);
router.put('/:id', updateAssessment);
router.delete('/:id', deleteAssessment);

module.exports = router;
