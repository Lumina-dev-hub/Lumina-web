const mongoose = require("mongoose");

const weekPlanSchema = new mongoose.Schema({
  weekNumber: {
    type: Number,
    required: true,
  },
  topic: {
    type: String,
    default: "Topic to be defined",
  },
  description: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    enum: ["Not Started", "In Progress", "Completed"],
    default: "Not Started",
  },
  lessonPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "LessonPlan",
  },
});

const SyllabusSchema = new mongoose.Schema(
  {
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    subjectName: {
      type: String,
      required: true,
    },
    term: {
      type: String,
      required: true,
    },
    weeks: [weekPlanSchema],
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Syllabus", SyllabusSchema);
