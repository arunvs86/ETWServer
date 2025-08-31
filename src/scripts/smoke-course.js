require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Course = require('../models/Course');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    // find the demo instructor from the previous step
    const instructor = await User.findOne({ email: 'demo.instructor@example.com' }).select('+passwordHash').lean();
    if (!instructor) {
      throw new Error('Demo instructor not found. Run smoke-user first.');
    }

    const payload = {
      title: 'UCAT Masterclass 2025',
      instructorId: instructor._id,
      subtitle: 'High-yield strategies for UCAT success',
      description: 'Comprehensive prep with practice and walkthroughs.',
      language: 'en',
      category: 'ucat',
      tags: ['ucat', 'medicine'],
      level: 'beginner',
      thumbnail: '',
      promoVideoUrl: '',
      pricing: { amountMinor: 0, currency: 'GBP' }, // free for smoke
      status: 'draft'
    };

    // upsert by slug-friendly title
    const slug = require('../utils/slugify')(payload.title);
    const doc = await Course.findOneAndUpdate(
      { slug },
      { ...payload, slug },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log('📘 course upserted:', {
      id: doc._id.toString(),
      title: doc.title,
      slug: doc.slug,
      instructorId: doc.instructorId.toString(),
      isFree: doc.pricing.isFree
    });

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-course failed:', err);
    process.exit(1);
  }
})();
