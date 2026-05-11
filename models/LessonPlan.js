const mongoose = require('mongoose');

// ─── NEW: Presentation step (replaces old stepSchema) ───────────────────────
const presentationSchema = new mongoose.Schema({
  step: Number,
  title: String,
  teacherActivity: String,
  studentActivity: String,
  content: String,
  // Backward-compat: old field was "description"
  description: String,
}, { _id: false });

// ─── Assessment ───────────────────────────────────────────────────────────────
const assessmentSchema = new mongoose.Schema({
  type: String,
  questions: [String], // NEW field
  tasks: [String],     // KEPT for backward compat with old documents
}, { _id: false });

// ─── Evaluation object ────────────────────────────────────────────────────────
const evaluationSchema = new mongoose.Schema({
  method: String,
  criteria: [String],
}, { _id: false });

// ─── Lesson Note: mainContent ─────────────────────────────────────────────────
const mainContentSchema = new mongoose.Schema({
  heading: String,
  content: String,
  examples: [String],
  // Backward-compat: old field was "desc"
  desc: String,
  image: String,
}, { _id: false });

// ─── OLD schemas kept for backward compat (existing docs) ────────────────────
const definitionSchema = new mongoose.Schema({
  term: String,
  def: String,
  icon: String,
}, { _id: false });

const processSchema = new mongoose.Schema({
  title: String,
  desc: String,
  image: String,
}, { _id: false });

// ─── Main Schema ─────────────────────────────────────────────────────────────
const LessonPlanSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Classroom',
      required: true
    },
    syllabus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Syllabus'
    },
    subjectName: {
      type: String,
      required: true
    },
    weekNumber: Number,
    topic: {
      type: String,
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    },
    term: String,
    session: String,
    duration: String,

    // Settings
    philosophy: String,
    planStyle: String,
    studentType: String,

    // Tracking
    generationCount: {
      type: Number,
      default: 1
    },
    noteGenerationCount: {
      type: Number,
      default: 0
    },

    // ─── NEW Content Fields ────────────────────────────────────────────
    behavioralObjectives: [String],       // replaces: objectives
    instructionalMaterials: [String],     // new
    previousKnowledge: String,            // new
    classActivity: String,                // new
    introduction: String,
    presentation: [presentationSchema],   // replaces: steps
    evaluation: evaluationSchema,         // changed from String to object
    assignment: String,                   // new
    assessment: assessmentSchema,

    // ─── DEPRECATED (kept for backward compat — old documents) ────────
    objectives: [String],
    steps: [{ type: mongoose.Schema.Types.Mixed }],

    // ─── Lesson Note ─────────────────────────────────────────────────
    lessonNote: {
      topic: String,
      summary: String,
      introduction: String,             // new (replaces overview)
      mainContent: [mainContentSchema], // new (replaces process)
      keyPoints: [String],              // new
      conclusion: String,               // new
      evaluation: evaluationSchema,     // new (object)
      assignment: String,               // new

      // DEPRECATED (backward compat)
      overview: String,
      definitions: [definitionSchema],
      process: [processSchema],
    }
  },
  {
    timestamps: true,
    strict: false // Allow extra fields from old documents to pass through
  }
);

module.exports = mongoose.model('LessonPlan', LessonPlanSchema);
