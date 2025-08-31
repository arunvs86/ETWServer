require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Course = require('../models/Course');
const CourseLibraryItem = require('../models/CourseLibraryItem');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const [user, course] = await Promise.all([
      User.findOne({ email: 'demo.student@example.com' }),
      Course.findOne({ slug: 'ucat-masterclass-2025' })
    ]);
    if (!user) throw new Error('Demo student not found.');
    if (!course) throw new Error('Demo course not found.');

    // Save
    let item = await CourseLibraryItem.findOneAndUpdate(
      { userId: user._id, courseId: course._id },
      { userId: user._id, courseId: course._id, savedAt: new Date(), lastViewedAt: new Date(), pinned: false },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log('💾 saved:', { savedAt: !!item.savedAt, archivedAt: !!item.archivedAt });

    // Archive
    item = await CourseLibraryItem.findOneAndUpdate(
      { userId: user._id, courseId: course._id },
      { archivedAt: new Date() },
      { new: true }
    );
    console.log('🗄️ archived:', { savedAt: !!item.savedAt, archivedAt: !!item.archivedAt });

    // Unarchive
    item = await CourseLibraryItem.findOneAndUpdate(
      { userId: user._id, courseId: course._id },
      { archivedAt: null },
      { new: true }
    );
    console.log('📂 unarchived:', { savedAt: !!item.savedAt, archivedAt: !!item.archivedAt });

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-library failed:', err.message || err);
    process.exit(1);
  }
})();
