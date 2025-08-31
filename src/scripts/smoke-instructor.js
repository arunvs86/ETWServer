require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Course = require('../models/Course');
const InstructorProfile = require('../models/InstructorProfile');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const instructor = await User.findOne({ email: 'demo.instructor@example.com' });
    if (!instructor) throw new Error('Demo instructor not found. Run smoke-user.');

    // ensure there is a profile doc (basic info)
    await InstructorProfile.findOneAndUpdate(
      { userId: instructor._id },
      {
        userId: instructor._id,
        headline: 'UCAT & Medical School Admissions Coach',
        bio: 'Years of experience guiding students to top scores.',
        socials: { linkedin: 'https://example.com/in' },
        credentials: ['MBBS', 'UCAT Top 1%']
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // publish the demo course so it counts toward aggregates
    const course = await Course.findOneAndUpdate(
      { slug: 'ucat-masterclass-2025' },
      { status: 'published', publishedAt: new Date() },
      { new: true }
    );
    if (!course) throw new Error('Demo course not found. Run smoke-course.');

    // recalc aggregates
    const agg = await InstructorProfile.recalcAggregatesFor(instructor._id);

    console.log('👨‍🏫 instructor aggregates:', {
      ratingAvg: agg.ratingAvg,
      ratingCount: agg.ratingCount,
      studentsTaughtCount: agg.studentsTaughtCount,
      coursesCount: agg.coursesCount
    });

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-instructor failed:', err.message || err);
    process.exit(1);
  }
})();
