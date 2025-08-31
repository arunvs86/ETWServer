require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Course = require('../models/Course');
const WishlistItem = require('../models/WishlistItem');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const [user, course] = await Promise.all([
      User.findOne({ email: 'demo.student@example.com' }),
      Course.findOne({ slug: 'ucat-masterclass-2025' })
    ]);
    if (!user) throw new Error('Demo student not found.');
    if (!course) throw new Error('Demo course not found.');

    const doc = await WishlistItem.findOneAndUpdate(
      { userId: user._id, courseId: course._id },
      { userId: user._id, courseId: course._id, source: 'catalog' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log('🧡 wishlisted:', {
      id: doc._id.toString(),
      user: user.email,
      course: course.slug,
      addedAt: doc.addedAt.toISOString()
    });

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-wishlist failed:', err.message || err);
    process.exit(1);
  }
})();
