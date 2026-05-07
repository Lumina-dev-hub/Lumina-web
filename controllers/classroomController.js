const Classroom = require('../models/Classroom');

// @desc    Create new classroom
// @route   POST /api/classes
exports.createClass = async (req, res) => {
  try {
    const classroom = await Classroom.create({
      ...req.body,
      teacher: req.user.id
    });
    res.status(201).json({ success: true, data: classroom });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get all classrooms for teacher
// @route   GET /api/classes
exports.getClasses = async (req, res) => {
  try {
    const { academicYear } = req.query;
    const query = { teacher: req.user.id };
    if (academicYear) {
      query.academicYear = academicYear;
    }
    const classes = await Classroom.find(query);
    res.status(200).json({ success: true, count: classes.length, data: classes });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get single classroom
// @route   GET /api/classes/:id
exports.getClassById = async (req, res) => {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.id, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).json({ success: false, message: 'Classroom not found' });
    }
    res.status(200).json({ success: true, data: classroom });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Update classroom
// @route   PUT /api/classes/:id
exports.updateClass = async (req, res) => {
  try {
    let classroom = await Classroom.findOne({ _id: req.params.id, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).json({ success: false, message: 'Classroom not found' });
    }

    // Track term history if term or academicYear changes
    if ((req.body.term && req.body.term !== classroom.term) || 
        (req.body.academicYear && req.body.academicYear !== classroom.academicYear)) {
      classroom.termHistory.push({
        term: classroom.term,
        academicYear: classroom.academicYear,
        changedAt: new Date()
      });
      await classroom.save();
    }
    
    classroom = await Classroom.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({ success: true, data: classroom });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Delete classroom
// @route   DELETE /api/classes/:id
exports.deleteClass = async (req, res) => {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.id, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).json({ success: false, message: 'Classroom not found' });
    }

    await classroom.deleteOne();
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get schedule across all classes
// @route   GET /api/schedule
exports.getSchedule = async (req, res) => {
  try {
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const { day: queryDay } = req.query;
    const today = queryDay || dayNames[new Date().getDay()];
    
    const classrooms = await Classroom.find({ teacher: req.user.id });
    
    let schedule = [];
    classrooms.forEach(cls => {
      const todayPeriods = cls.schedule.filter(p => p.day === today);
      todayPeriods.forEach(p => {
        schedule.push({
          id: p.id || p._id,
          subject: p.subject,
          classId: cls._id,
          class: cls.name,
          time: `${p.startTime} - ${p.endTime}`,
          startTime: p.startTime,
          endTime: p.endTime,
          students: cls.studentCount,
          color: cls.color
        });
      });
    });

    // Simple time sorting (assuming format like "08:00 AM")
    const parseTime = (timeStr) => {
      const [time, modifier] = timeStr.split(' ');
      let [hours, minutes] = time.split(':');
      if (hours === '12') hours = '00';
      if (modifier === 'PM') hours = parseInt(hours, 10) + 12;
      return `${hours.toString().padStart(2, '0')}:${minutes}`;
    };

    schedule.sort((a, b) => parseTime(a.startTime).localeCompare(parseTime(b.startTime)));

    res.status(200).json({ success: true, data: schedule });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get all unique academic sessions for teacher
// @route   GET /api/classes/sessions
exports.getAcademicSessions = async (req, res) => {
  try {
    const sessions = await Classroom.distinct('academicYear', { teacher: req.user.id });
    // Sort sessions in descending order (assuming format like "2023/24")
    sessions.sort((a, b) => b.localeCompare(a));
    res.status(200).json({ success: true, data: sessions });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
