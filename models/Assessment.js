const mongoose = require("mongoose");

const optionSchema = new mongoose.Schema({
  label: String,
  text: String,
});

const questionSchema = new mongoose.Schema({
  id: String,
  text: String,
  image: String,
  options: [optionSchema],
  subQuestions: [String],
  hasWorkspace: Boolean,
});

const sectionSchema = new mongoose.Schema({
  id: String,
  title: String,
  description: String,
  questions: [questionSchema],
});

const AssessmentSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    subjectName: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    type: {
      type: String, // Exam, CA 1, CA 2, CA 3, Pop Quiz, Practical
      required: true,
    },
    term: {
      type: String, // 1st, 2nd, 3rd
      required: true,
    },
    session: String,
    status: {
      type: String,
      enum: ["Draft", "Scheduled", "Completed"],
      default: "Completed",
    },
    duration: {
      type: Number, // in minutes
      default: 40,
    },
    format: {
      type: String,
      enum: ["mixed", "mcq", "theory"],
      default: "mixed",
    },
    questionCount: {
      type: Number,
      default: 20,
    },
    generationCount: {
      type: Number,
      default: 1,
    },
    topics: [String],
    sections: [sectionSchema],
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Assessment", AssessmentSchema);
