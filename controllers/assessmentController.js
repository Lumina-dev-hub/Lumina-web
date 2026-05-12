const Assessment = require('../models/Assessment');
const LessonPlan = require('../models/LessonPlan');
const Syllabus = require('../models/Syllabus');
const Classroom = require('../models/Classroom');
const aiService = require('../utils/openRouterService');
const subscriptionService = require('../services/subscriptionService');
const referralService = require('../services/referralService');

// @desc    Generate an assessment using Gemini AI
// @route   POST /api/assessments/generate
exports.generateAssessment = async (req, res) => {
  try {
    const { 
      classroomId, 
      subjectName, 
      title, 
      type, 
      term, 
      format, 
      questionCount, 
      topics,
      intensity // For exams
    } = req.body;

    // Check subscription limits
    const limitCheck = subscriptionService.checkLimits(req.user);
    if (!limitCheck.canGenerate) {
      return res.status(403).json({
        success: false,
        message: limitCheck.message,
        limitReached: true,
      });
    }
    
    // Fetch classroom to get current session
    const classroom = await Classroom.findById(classroomId);
    
    // AI Generation
    const prefs = req.user.classroom || { studentLevel: 'Average' };
    const lang = (req.user.settings && req.user.settings.language) ? req.user.settings.language : 'en';

    const params = {
      subjectName,
      title,
      type,
      term,
      format,
      questionCount,
      topics,
      intensity
    };

    const preferences = {
      studentLevel: prefs.studentLevel
    };

    const generatedAssessment = await aiService.generateAssessmentWithAI(params, preferences, lang);

    const assessmentData = {
      teacher: req.user.id,
      classroom: classroomId,
      subjectName,
      title: generatedAssessment.title || title || `${subjectName} Assessment`,
      type,
      term: (classroom && classroom.term) ? classroom.term : term,
      format,
      questionCount,
      topics,
      sections: generatedAssessment.sections || [],
      session: classroom ? classroom.academicYear : null,
      status: 'Draft',
      generationCount: 1
    };

    const assessment = await Assessment.create(assessmentData);

    // Track referral first generation step
    await referralService.trackStep(req.user.id, 'firstGeneration');

    res.status(201).json({ success: true, data: assessment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Regenerate an assessment
// @route   POST /api/assessments/:id/regenerate
exports.regenerateAssessment = async (req, res) => {
  try {
    const assessment = await Assessment.findById(req.params.id);
    if (!assessment) {
      return res.status(404).json({ success: false, message: 'Assessment not found' });
    }

    // Check subscription limits for Pro plan
    const limitCheck = subscriptionService.checkLimits(req.user, assessment, true);
    if (!limitCheck.canGenerate) {
      return res.status(403).json({ 
        success: false, 
        message: limitCheck.message,
        limitReached: true
      });
    }

    // Use req.body if it contains data, otherwise use existing assessment
    const currentData = Object.keys(req.body).length > 0 ? req.body : assessment;

    // AI Generation for regeneration
    const lang = (req.user.settings && req.user.settings.language) ? req.user.settings.language : 'en';
    
    const generatedAssessment = await aiService.regenerateAssessmentWithAI(currentData, lang);

    assessment.generationCount += 1;
    assessment.title = generatedAssessment.title || assessment.title;
    assessment.sections = generatedAssessment.sections || assessment.sections;
    
    await assessment.save();
    res.status(200).json({ success: true, data: assessment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get all assessments for the current teacher
// @route   GET /api/assessments
exports.getMyAssessments = async (req, res) => {
  try {
    const { status, sort, timeline } = req.query;
    let query = { teacher: req.user.id };

    if (status && status !== 'all') {
      query.status = status.charAt(0).toUpperCase() + status.slice(1);
    }

    // Timeline filtering (basic mock for now)
    if (timeline && timeline !== 'recent_assessments') {
       // Mock term filtering logic
       query.term = timeline.includes('1') ? '1st Term' : timeline.includes('2') ? '2nd Term' : '3rd Term';
    }

    // Direct term and session filtering
    const { term, session } = req.query;
    if (term && term !== 'all') {
      if (term.toLowerCase().includes('term')) {
         query.term = term;
      } else {
         // Handle cases like "1", "2", "3"
         query.term = term === '1' ? '1st Term' : term === '2' ? '2nd Term' : term === '3' ? '3rd Term' : term;
      }
    }
    if (session) query.session = session;

    let assessments = Assessment.find(query).populate('classroom', 'name');

    if (sort === 'oldest') {
      assessments = assessments.sort({ createdAt: 1 });
    } else {
      assessments = assessments.sort({ createdAt: -1 });
    }

    const results = await assessments;
    res.status(200).json({ success: true, data: results });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get assessment by ID
// @route   GET /api/assessments/:id
exports.getAssessmentById = async (req, res) => {
  try {
    const assessment = await Assessment.findById(req.params.id).populate('classroom', 'name');
    if (!assessment) {
      return res.status(404).json({ success: false, message: 'Assessment not found' });
    }
    res.status(200).json({ success: true, data: assessment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Update assessment
// @route   PUT /api/assessments/:id
exports.updateAssessment = async (req, res) => {
  try {
    const assessment = await Assessment.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!assessment) {
      return res.status(404).json({ success: false, message: 'Assessment not found' });
    }
    res.status(200).json({ success: true, data: assessment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Delete assessment
// @route   DELETE /api/assessments/:id
exports.deleteAssessment = async (req, res) => {
  try {
    const assessment = await Assessment.findByIdAndDelete(req.params.id);
    if (!assessment) {
      return res.status(404).json({ success: false, message: 'Assessment not found' });
    }
    res.status(200).json({ success: true, message: 'Assessment deleted successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get available topics from lesson plans
// @route   GET /api/assessments/topics
exports.getAvailableTopics = async (req, res) => {
  try {
    const { classroomId, subjectName } = req.query;
    if (!classroomId || !subjectName) {
      return res.status(400).json({ success: false, message: 'Classroom and Subject are required' });
    }

    const plans = await LessonPlan.find({ 
      classroom: classroomId, 
      subjectName: subjectName 
    }).select('topic');

    const topics = [...new Set(plans.map(p => p.topic))];
    res.status(200).json({ success: true, data: topics });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
