const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const initSubscriptionCron = require('./utils/subscriptionCron');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

// Initialize Cron Jobs
initSubscriptionCron();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request Logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Basic Route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'Backend is running correctly' });
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/classes', require('./routes/classroomRoutes'));
app.use('/api/syllabus', require('./routes/syllabusRoutes'));
app.use('/api/plans', require('./routes/lessonPlanRoutes'));
app.use('/api/assessments', require('./routes/assessmentRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/referrals', require('./routes/referralRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: err.message || 'Internal Server Error' 
  });
});

// Port configuration
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
