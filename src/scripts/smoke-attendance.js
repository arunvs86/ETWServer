require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Course = require('../models/Course');
const LiveSession = require('../models/LiveSession');
const Attendance = require('../models/Attendance');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const [student, course] = await Promise.all([
      User.findOne({ email: 'demo.student@example.com' }),
      Course.findOne({ slug: 'ucat-masterclass-2025' })
    ]);
    if (!student) throw new Error('Demo student not found. Run smoke-user.');
    if (!course) throw new Error('Demo course not found. Run smoke-course.');

    const session = await LiveSession.findOne({ courseId: course._id, title: 'UCAT Live Q&A' });
    if (!session) throw new Error('Live session not found. Run smoke-livesession first.');

    // simulate a 42-minute attendance window
    const joinAt = new Date(session.startAt.getTime() + 5 * 60 * 1000);  // joined 5 min after start
    const leaveAt = new Date(joinAt.getTime() + 42 * 60 * 1000);         // stayed 42 min

    const doc = await Attendance.findOneAndUpdate(
      { liveSessionId: session._id, userId: student._id, joinAt },
      {
        liveSessionId: session._id,
        userId: student._id,
        joinAt,
        leaveAt,
        source: 'manual'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log('🧾 attendance recorded:', {
      session: session.title,
      user: student.email,
      joinAt: doc.joinAt.toISOString(),
      leaveAt: doc.leaveAt?.toISOString(),
      durationSec: doc.durationSec
    });

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-attendance failed:', err.message || err);
    process.exit(1);
  }
})();
