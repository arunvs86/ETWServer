require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const upsert = async (email, role, name) => {
      const doc = await User.findOneAndUpdate(
        { email },
        { email, role, name, passwordHash: 'replace_me_with_a_hash' },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      console.log(`✓ ${role} upserted:`, { id: doc._id.toString(), email: doc.email });
    };

    await upsert('demo.student@example.com', 'student', 'Demo Student');
    await upsert('demo.instructor@example.com', 'instructor', 'Demo Instructor');
    await upsert('demo.admin@example.com', 'admin', 'Demo Admin');

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-user failed:', err);
    process.exit(1);
  }
})();
