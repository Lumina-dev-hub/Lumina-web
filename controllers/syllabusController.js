const Syllabus = require('../models/Syllabus');
const Classroom = require('../models/Classroom');

// @desc    Get syllabus for class and subject
// @route   GET /api/classes/:classId/subjects/:subjectName/syllabus
exports.getSyllabus = async (req, res) => {
  try {
    const { classId, subjectName } = req.params;
    let syllabus = await Syllabus.findOne({ classroom: classId, subjectName });
    
    if (!syllabus) {
      const classroom = await Classroom.findById(classId);
      if (!classroom) {
        return res.status(404).json({ success: false, message: 'Classroom not found' });
      }

      // Create a blank syllabus container if it doesn't exist
      syllabus = await Syllabus.create({
        classroom: classId,
        subjectName,
        term: classroom.term || 'First Term',
        weeks: []
      });
    }
    
    res.status(200).json({ success: true, data: syllabus });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Add or update a week in the syllabus
// @route   PUT /api/syllabus/:id/weeks
exports.updateSyllabusWeek = async (req, res) => {
  try {
    const { id } = req.params;
    const { weekNumber, topic, description, status } = req.body;
    
    let syllabus = await Syllabus.findById(id);
    if (!syllabus) {
      return res.status(404).json({ success: false, message: 'Syllabus not found' });
    }
    
    const weekIndex = syllabus.weeks.findIndex(w => w.weekNumber === weekNumber);
    
    if (weekIndex > -1) {
      // Update existing week
      syllabus.weeks[weekIndex].topic = topic !== undefined ? topic : syllabus.weeks[weekIndex].topic;
      syllabus.weeks[weekIndex].description = description !== undefined ? description : syllabus.weeks[weekIndex].description;
      syllabus.weeks[weekIndex].status = status !== undefined ? status : syllabus.weeks[weekIndex].status;
    } else {
      // Add new week
      syllabus.weeks.push({ weekNumber, topic, description, status });
    }
    
    // Sort weeks by weekNumber
    syllabus.weeks.sort((a, b) => a.weekNumber - b.weekNumber);
    
    await syllabus.save();
    res.status(200).json({ success: true, data: syllabus });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
