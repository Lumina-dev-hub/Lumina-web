const mongoose = require('mongoose');

const periodSchema = new mongoose.Schema({
  id: String,
  day: {
    type: String,
    enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    required: true
  }
});

const ClassroomSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: {
      type: String,
      required: [true, 'Please add a class name']
    },
    academicYear: {
      type: String,
      required: [true, 'Please add an academic year']
    },
    term: {
      type: String,
      required: [true, 'Please add a term']
    },
    studentCount: {
      type: Number,
      default: 0
    },
    subjects: [String],
    schedule: [periodSchema],
    color: {
      type: String,
      default: '#006D4E'
    },
    section: String,
    termHistory: [{
      term: String,
      academicYear: String,
      changedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Classroom', ClassroomSchema);
