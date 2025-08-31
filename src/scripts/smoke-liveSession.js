require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Course = require('../models/Course');
const LiveSession = require('../models/LiveSession');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const [instructor, course] = await Promise.all([
      User.findOne({ email: 'demo.instructor@example.com' }),
      Course.findOne({ slug: 'ucat-masterclass-2025' })
    ]);
    if (!instructor) throw new Error('Demo instructor not found. Run smoke-user.');
    if (!course) throw new Error('Demo course not found. Run smoke-course.');

    // schedule for tomorrow 18:00–19:00 London time (approx without tz math here)
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const startAt = new Date(
      Date.UTC(
        tomorrow.getUTCFullYear(),
        tomorrow.getUTCMonth(),
        tomorrow.getUTCDate(),
        17, 0, 0
      )
    ); // 18:00 Europe/London ≈ 17:00 UTC when BST is in effect; this is fine for a smoke test
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

    const doc = await LiveSession.findOneAndUpdate(
      {
        hostUserId: instructor._id,
        courseId: course._id,
        title: 'UCAT Live Q&A'
      },
      {
        hostUserId: instructor._id,
        courseId: course._id,
        title: 'UCAT Live Q&A',
        description: 'Bring your questions for a focused UCAT Q&A session.',
        startAt,
        endAt,
        timezone: 'Europe/London',
        status: 'scheduled',
        visibility: 'course',
        capacity: 0, // unlimited
        zoom: {
          meetingId: '00000000000',
          joinUrl: 'https://zoom.example/j/00000000000',
          startUrl: 'https://zoom.example/s/00000000000',
          passcode: '123456'
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log('🗓️  live session upserted:', {
      id: doc._id.toString(),
      course: course.slug,
      title: doc.title,
      when: [doc.startAt.toISOString(), doc.endAt.toISOString()],
      status: doc.status,
      joinableNow: doc.isJoinableNow()
    });

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-livesession failed:', err.message || err);
    process.exit(1);
  }
})();
