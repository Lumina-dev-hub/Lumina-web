const LessonPlan = require('../models/LessonPlan');
const Syllabus = require('../models/Syllabus');
const Classroom = require('../models/Classroom');
const aiService = require('../utils/openRouterService');

// @desc    Generate a lesson plan using Gemini AI
// @route   POST /api/plans/generate
exports.generateLessonPlan = async (req, res) => {
  try {
    const { classroomId, subjectName, weekNumber, topic, philosophy, planStyle, studentType, isEmpty, includeAssessment } = req.body;
    
    // Fetch classroom to get current term and session
    const classroom = await Classroom.findById(classroomId);
    
    // Fallbacks if user details aren't populated
    const prefs = req.user.classroom || { studentLevel: 'Average', teachingPhilosophy: ['Constructivism'], planStyle: ['Detailed'] };
    const lang = (req.user.settings && req.user.settings.language) ? req.user.settings.language : 'en';

    let generatedPlan = {};
    let generatedNote = null;

    if (!isEmpty) {
      // 1. Generate Lesson Plan via AI
      const params = { subjectName, weekNumber, topic: topic || "New Topic", philosophy, planStyle, includeAssessment };
      const preferences = { studentLevel: studentType || prefs.studentLevel, teachingPhilosophy: prefs.teachingPhilosophy[0], planStyle: prefs.planStyle[0] };
      
      generatedPlan = await aiService.generateLessonPlanWithAI(params, preferences, lang);

      // 2. Auto-generate note and assessment if requested
      if (includeAssessment !== false) {
        generatedNote = await aiService.generateLessonNoteWithAI(generatedPlan, lang);
      }
    }

    const planData = {
      teacher: req.user.id,
      classroom: classroomId,
      subjectName,
      weekNumber: parseInt(weekNumber),
      topic: isEmpty ? (topic || "New Topic") : (generatedPlan.topic || topic || "New Topic"),
      philosophy: philosophy || prefs.teachingPhilosophy[0] || "Constructivism",
      planStyle: planStyle || prefs.planStyle[0] || "Detailed",
      studentType: studentType || prefs.studentLevel || "Mixed",
      duration: isEmpty ? "45 mins" : (generatedPlan.duration || "45 mins"),
      objectives: isEmpty ? [] : (generatedPlan.objectives || []),
      introduction: isEmpty ? "" : (generatedPlan.introduction || ""),
      steps: isEmpty ? [] : (generatedPlan.steps || []),
      evaluation: isEmpty ? "" : (generatedPlan.evaluation || ""),
      assessment: includeAssessment !== false ? (isEmpty ? { type: "", tasks: [] } : generatedPlan.assessment) : null,
      lessonNote: generatedNote,
      term: classroom ? classroom.term : null,
      session: classroom ? classroom.academicYear : null,
      generationCount: 1,
      noteGenerationCount: generatedNote ? 1 : 0
    };

    const lessonPlan = await LessonPlan.create(planData);
    
    // Update syllabus if exists
    const syllabus = await Syllabus.findOne({ classroom: classroomId, subjectName });
    if (syllabus) {
      const weekIndex = syllabus.weeks.findIndex(w => w.weekNumber === parseInt(weekNumber));
      if (weekIndex > -1) {
        syllabus.weeks[weekIndex].lessonPlanId = lessonPlan._id;
        syllabus.weeks[weekIndex].status = 'Completed';
        if (topic) syllabus.weeks[weekIndex].topic = topic;
        await syllabus.save();
      } else {
        syllabus.weeks.push({
          weekNumber: parseInt(weekNumber),
          topic: lessonPlan.topic,
          status: 'Completed',
          lessonPlanId: lessonPlan._id
        });
        syllabus.weeks.sort((a, b) => a.weekNumber - b.weekNumber);
        await syllabus.save();
      }
    }

    res.status(201).json({ success: true, data: lessonPlan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Regenerate a lesson plan
// @route   POST /api/plans/:id/regenerate
exports.regeneratePlan = async (req, res) => {
  try {
    const plan = await LessonPlan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Lesson plan not found' });
    }

    // Check subscription limits for Pro plan
    if (req.user.settings.subscriptionPlan === 'Pro' && plan.generationCount >= 5) {
      return res.status(403).json({ 
        success: false, 
        message: 'Regeneration limit reached for this plan. Please upgrade to Ultimate for unlimited regenerations.',
        limitReached: true
      });
    }

    // Use req.body if it contains data, otherwise use existing plan
    const currentData = Object.keys(req.body).length > 0 ? req.body : plan;

    // AI Logic to update the plan content
    const lang = (req.user.settings && req.user.settings.language) ? req.user.settings.language : 'en';
    const improvedPlan = await aiService.regenerateLessonPlanWithAI(currentData, lang);
    
    plan.generationCount += 1;
    plan.topic = improvedPlan.topic || plan.topic;
    plan.duration = improvedPlan.duration || plan.duration;
    plan.objectives = improvedPlan.objectives || plan.objectives;
    plan.introduction = improvedPlan.introduction || plan.introduction;
    plan.steps = improvedPlan.steps || plan.steps;
    plan.evaluation = improvedPlan.evaluation || plan.evaluation;
    if (improvedPlan.assessment) {
      plan.assessment = improvedPlan.assessment;
    }
    
    await plan.save();
    res.status(200).json({ success: true, data: plan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Regenerate a lesson note
// @route   POST /api/plans/:id/regenerate-note
exports.regenerateLessonNote = async (req, res) => {
  try {
    const plan = await LessonPlan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Lesson plan not found' });
    }

    // Check subscription limits for Pro plan
    if (req.user.settings.subscriptionPlan === 'Pro' && plan.noteGenerationCount >= 5) {
      return res.status(403).json({ 
        success: false, 
        message: 'Regeneration limit reached for this note. Please upgrade to Ultimate for unlimited regenerations.',
        limitReached: true
      });
    }

    // Use req.body if it contains data, otherwise use existing plan and its note
    const currentData = Object.keys(req.body).length > 0 ? req.body.lessonNote || req.body : plan.lessonNote || plan;

    // AI Logic to update the lesson note
    const lang = (req.user.settings && req.user.settings.language) ? req.user.settings.language : 'en';
    const improvedNote = await aiService.regenerateLessonNoteWithAI(currentData, lang);
    
    plan.noteGenerationCount += 1;
    plan.lessonNote = improvedNote;
    
    await plan.save();
    res.status(200).json({ success: true, data: plan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get lesson plan by ID
// @route   GET /api/plans/:id
exports.getLessonPlanById = async (req, res) => {
  try {
    const plan = await LessonPlan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Lesson plan not found' });
    }
    res.status(200).json({ success: true, data: plan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Update lesson plan
// @route   PUT /api/plans/:id
exports.updateLessonPlan = async (req, res) => {
  try {
    const plan = await LessonPlan.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Lesson plan not found' });
    }
    res.status(200).json({ success: true, data: plan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
// @desc    Get all lesson plans for the current teacher
// @route   GET /api/plans
exports.getMyLessonPlans = async (req, res) => {
  try {
    const { status, sort, timeline, classroomId, subjectName } = req.query;
    let query = { teacher: req.user.id };

    // Filter by classroom and/or subject
    if (classroomId) query.classroom = classroomId;
    if (subjectName) query.subjectName = subjectName;

    // Timeline filtering
    if (timeline) {
      const now = new Date();
      if (timeline === 'this_week') {
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        query.createdAt = { $gte: startOfWeek };
      } else if (timeline === 'this_month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        query.createdAt = { $gte: startOfMonth };
      } else if (timeline.includes('term')) {
        // Handle term filtering from timeline (e.g., 'term_1', 'term_2', 'term_3' or 'this_term')
        if (timeline === 'this_term' && classroomId) {
           const classroom = await Classroom.findById(classroomId);
           if (classroom) query.term = classroom.term;
        } else if (timeline.includes('term_')) {
          const termNum = timeline.split('_')[1];
          query.term = termNum === '1' ? '1st Term' : termNum === '2' ? '2nd Term' : '3rd Term';
        }
      }
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

    // Status filtering
    // Note: Model doesn't have status field yet, but we can infer it or add it. 
    // For now, let's just return all and let frontend handle it or add a simple check if we add a status field later.

    let plans = LessonPlan.find(query).populate('classroom', 'name');

    // Sorting
    if (sort === 'old') {
      plans = plans.sort({ createdAt: 1 });
    } else {
      plans = plans.sort({ createdAt: -1 });
    }

    const results = await plans;
    res.status(200).json({ success: true, data: results });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
