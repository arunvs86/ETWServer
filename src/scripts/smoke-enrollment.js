require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const [student, course] = await Promise.all([
      User.findOne({ email: 'demo.student@example.com' }),
      Course.findOne({ slug: 'ucat-masterclass-2025' })
    ]);
    if (!student) throw new Error('Demo student not found. Run smoke-user first.');
    if (!course) throw new Error('Demo course not found. Run smoke-course first.');

    const doc = await Enrollment.findOneAndUpdate(
      { userId: student._id, courseId: course._id },
      {
        userId: student._id,
        courseId: course._id,
        via: 'admin',            // just for smoke; later it’ll be 'purchase' or 'membership'
        status: 'active',
        activatedAt: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log('🎟️  enrollment upserted:', {
      id: doc._id.toString(),
      user: student.email,
      course: course.slug,
      status: doc.status,
      activeNow: doc.isCurrentlyActive()
    });

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-enrollment failed:', err.message || err);
    process.exit(1);
  }
})();
