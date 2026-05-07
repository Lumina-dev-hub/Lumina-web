const express = require('express');
const router = express.Router();
const { getSyllabus, updateSyllabusWeek } = require('../controllers/syllabusController');
const { protect } = require('../middleware/authMiddleware');

router.get('/:classId/subjects/:subjectName', protect, getSyllabus);
router.put('/:id/weeks', protect, updateSyllabusWeek);

module.exports = router;
