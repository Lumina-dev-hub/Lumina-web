const LessonPlan = require("../models/LessonPlan");
const Syllabus = require("../models/Syllabus");
const Classroom = require("../models/Classroom");
const aiService = require("../utils/openRouterService");
const subscriptionService = require("../services/subscriptionService");
const referralService = require("../services/referralService");

// @desc    Generate a lesson plan using AI
// @route   POST /api/plans/generate
exports.generateLessonPlan = async (req, res) => {
  try {
    const {
      classroomId,
      subjectName,
      weekNumber,
      topic,
      philosophy,
      planStyle,
      studentType,
      isEmpty,
      includeAssessment,
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

    // Fetch classroom to get current term and session
    const classroom = await Classroom.findById(classroomId);

    // Fallbacks if user details aren't populated
    const prefs = req.user.classroom || {
      studentLevel: "Average",
      teachingPhilosophy: ["Constructivism"],
      planStyle: ["Detailed"],
    };
    const lang =
      req.user.settings && req.user.settings.language
        ? req.user.settings.language
        : "en";

    let generatedPlan = {};
    let generatedNote = null;

    if (!isEmpty) {
      // 1. Generate Lesson Plan via AI
      const params = {
        subjectName,
        weekNumber,
        topic: topic || "New Topic",
        philosophy,
        planStyle,
        includeAssessment,
      };
      const preferences = {
        studentLevel: studentType || prefs.studentLevel || "Mixed",
        teachingPhilosophy: philosophy || prefs.teachingPhilosophy?.[0] || "Constructivism",
        planStyle: planStyle || prefs.planStyle?.[0] || "Detailed",
      };

      generatedPlan = await aiService.generateLessonPlanWithAI(
        params,
        preferences,
        lang,
      );

      // 2. Auto-generate lesson note if requested
      if (includeAssessment !== false) {
        generatedNote = await aiService.generateLessonNoteWithAI(
          generatedPlan,
          lang,
        );
      }
    }

    // Safely extract evaluation — AI may return string, object, or array
    const normalizeEvaluation = (raw) => {
      if (!raw) return { method: "", criteria: [] };
      if (Array.isArray(raw)) return { method: "", criteria: raw }; // AI returned array of criteria
      if (typeof raw === "object")
        return { method: raw.method || "", criteria: raw.criteria || [] };
      return { method: raw, criteria: [] }; // AI returned plain string
    };

    const evaluation = isEmpty
      ? { method: "", criteria: [] }
      : normalizeEvaluation(generatedPlan.evaluation);
    const behavioralObjectives = isEmpty
      ? []
      : generatedPlan.behavioralObjectives || generatedPlan.objectives || [];
    const presentation = isEmpty
      ? []
      : generatedPlan.presentation || generatedPlan.steps || [];

    const assessmentData = (() => {
      if (includeAssessment === false) return null;
      if (isEmpty) return { type: "", questions: [] };
      const raw = generatedPlan.assessment;
      if (!raw) return null;
      return {
        type: raw.type || "",
        questions: raw.questions || raw.tasks || [],
      };
    })();

    const planData = {
      teacher: req.user.id,
      classroom: classroomId,
      subjectName,
      weekNumber: parseInt(weekNumber),
      topic: isEmpty
        ? topic || "New Topic"
        : generatedPlan.topic || topic || "New Topic",
      philosophy: philosophy || prefs.teachingPhilosophy?.[0] || "Constructivism",
      planStyle: planStyle || prefs.planStyle?.[0] || "Detailed",
      studentType: studentType || prefs.studentLevel || "Mixed",
      duration: isEmpty ? "40 minutes" : generatedPlan.duration || "40 minutes",
      classActivity: isEmpty ? "" : generatedPlan.classActivity || "",
      behavioralObjectives,
      instructionalMaterials: isEmpty
        ? []
        : generatedPlan.instructionalMaterials || [],
      previousKnowledge: isEmpty ? "" : generatedPlan.previousKnowledge || "",
      introduction: isEmpty ? "" : generatedPlan.introduction || "",
      presentation,
      evaluation,
      assignment: isEmpty ? "" : generatedPlan.assignment || "",
      assessment: assessmentData,
      lessonNote: generatedNote,
      term: classroom ? classroom.term : null,
      session: classroom ? classroom.academicYear : null,
      generationCount: 1,
      noteGenerationCount: generatedNote ? 1 : 0,
    };

    const lessonPlan = await LessonPlan.create(planData);

    // Track referral first generation step
    await referralService.trackStep(req.user.id, 'firstGeneration');

    // Update syllabus if exists
    const syllabus = await Syllabus.findOne({
      classroom: classroomId,
      subjectName,
    });
    if (syllabus) {
      const weekIndex = syllabus.weeks.findIndex(
        (w) => w.weekNumber === parseInt(weekNumber),
      );
      if (weekIndex > -1) {
        syllabus.weeks[weekIndex].lessonPlanId = lessonPlan._id;
        syllabus.weeks[weekIndex].status = "Completed";
        if (topic) syllabus.weeks[weekIndex].topic = topic;
        await syllabus.save();
      } else {
        syllabus.weeks.push({
          weekNumber: parseInt(weekNumber),
          topic: lessonPlan.topic,
          status: "Completed",
          lessonPlanId: lessonPlan._id,
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
      return res
        .status(404)
        .json({ success: false, message: "Lesson plan not found" });
    }

    // Check subscription limits for Pro plan
    const limitCheck = subscriptionService.checkLimits(req.user, plan, true);
    if (!limitCheck.canGenerate) {
      return res.status(403).json({
        success: false,
        message: limitCheck.message,
        limitReached: true,
      });
    }

    // Use req.body if it contains data, otherwise use existing plan
    const currentData = Object.keys(req.body).length > 0 ? req.body : plan;

    const lang =
      req.user.settings && req.user.settings.language
        ? req.user.settings.language
        : "en";
    const improvedPlan = await aiService.regenerateLessonPlanWithAI(
      currentData,
      lang,
    );

    plan.generationCount += 1;
    plan.topic = improvedPlan.topic || plan.topic;
    plan.duration = improvedPlan.duration || plan.duration;
    plan.classActivity = improvedPlan.classActivity || plan.classActivity;
    plan.previousKnowledge =
      improvedPlan.previousKnowledge || plan.previousKnowledge;
    plan.introduction = improvedPlan.introduction || plan.introduction;
    plan.assignment = improvedPlan.assignment || plan.assignment;

    // behavioralObjectives (handle old "objectives" fallback)
    plan.behavioralObjectives =
      improvedPlan.behavioralObjectives ||
      improvedPlan.objectives ||
      plan.behavioralObjectives ||
      plan.objectives ||
      [];

    // instructionalMaterials
    plan.instructionalMaterials =
      improvedPlan.instructionalMaterials || plan.instructionalMaterials || [];

    // presentation (handle old "steps" fallback)
    plan.presentation =
      improvedPlan.presentation ||
      improvedPlan.steps ||
      plan.presentation ||
      plan.steps ||
      [];

    // evaluation (handle old string fallback and array fallback)
    if (improvedPlan.evaluation !== undefined) {
      if (Array.isArray(improvedPlan.evaluation)) {
        plan.evaluation = { method: "", criteria: improvedPlan.evaluation };
      } else if (
        typeof improvedPlan.evaluation === "object" &&
        improvedPlan.evaluation !== null
      ) {
        plan.evaluation = improvedPlan.evaluation;
      } else if (improvedPlan.evaluation) {
        plan.evaluation = { method: improvedPlan.evaluation, criteria: [] };
      }
    }

    // assessment (normalize questions/tasks)
    if (improvedPlan.assessment) {
      plan.assessment = {
        type: improvedPlan.assessment.type || "",
        questions:
          improvedPlan.assessment.questions ||
          improvedPlan.assessment.tasks ||
          [],
      };
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
      return res
        .status(404)
        .json({ success: false, message: "Lesson plan not found" });
    }

    // Check subscription limits for Pro plan
    const limitCheck = subscriptionService.checkLimits(req.user, { generationCount: plan.noteGenerationCount }, true);
    if (!limitCheck.canGenerate) {
      return res.status(403).json({
        success: false,
        message: limitCheck.message,
        limitReached: true,
      });
    }

    // Use req.body if it contains data, otherwise use existing plan and its note
    const currentData =
      Object.keys(req.body).length > 0
        ? req.body.lessonNote || req.body
        : plan.lessonNote || plan;

    const lang =
      req.user.settings && req.user.settings.language
        ? req.user.settings.language
        : "en";
    const improvedNote = await aiService.regenerateLessonNoteWithAI(
      currentData,
      lang,
    );

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
      return res
        .status(404)
        .json({ success: false, message: "Lesson plan not found" });
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
      runValidators: false, // Disabled to allow partial updates and backward compat
    });
    if (!plan) {
      return res
        .status(404)
        .json({ success: false, message: "Lesson plan not found" });
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
      if (timeline === "this_week") {
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        query.createdAt = { $gte: startOfWeek };
      } else if (timeline === "this_month") {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        query.createdAt = { $gte: startOfMonth };
      } else if (timeline.includes("term")) {
        if (timeline === "this_term" && classroomId) {
          const classroom = await Classroom.findById(classroomId);
          if (classroom) query.term = classroom.term;
        } else if (timeline.includes("term_")) {
          const termNum = timeline.split("_")[1];
          query.term =
            termNum === "1"
              ? "1st Term"
              : termNum === "2"
                ? "2nd Term"
                : "3rd Term";
        }
      }
    }

    // Direct term and session filtering
    const { term, session } = req.query;
    if (term && term !== "all") {
      if (term.toLowerCase().includes("term")) {
        query.term = term;
      } else {
        query.term =
          term === "1"
            ? "1st Term"
            : term === "2"
              ? "2nd Term"
              : term === "3"
                ? "3rd Term"
                : term;
      }
    }
    if (session) query.session = session;

    let plans = LessonPlan.find(query).populate("classroom", "name");

    // Sorting
    if (sort === "old") {
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

// @desc    Delete lesson plan
// @route   DELETE /api/plans/:id
exports.deleteLessonPlan = async (req, res) => {
  try {
    const plan = await LessonPlan.findByIdAndDelete(req.params.id);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Lesson plan not found' });
    }
    res.status(200).json({ success: true, message: 'Lesson plan deleted successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
