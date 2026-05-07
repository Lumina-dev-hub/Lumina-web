const mongoose = require('mongoose');

const stepSchema = new mongoose.Schema({
  number: Number,
  title: String,
  description: String
});

const assessmentSchema = new mongoose.Schema({
  type: String,
  tasks: [String]
});

const definitionSchema = new mongoose.Schema({
  term: String,
  def: String,
  icon: String
});

const processSchema = new mongoose.Schema({
  title: String,
  desc: String,
  image: String
});

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
    
    // Content
    objectives: [String],
    introduction: String,
    steps: [stepSchema],
    evaluation: String,
    assessment: assessmentSchema,
    
    // Lesson Note
    lessonNote: {
      summary: String,
      overview: String,
      definitions: [definitionSchema],
      process: [processSchema]
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('LessonPlan', LessonPlanSchema);
