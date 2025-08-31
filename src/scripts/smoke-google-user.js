require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    // pretend this came from Google
    const email = 'goog.demo@example.com';
    const sub = 'sub_demo_123'; // Google's stable user id (fake for smoke)
    const picture = 'https://picsum.photos/100'; // placeholder avatar

    const user = await User.findOneAndUpdate(
      { email }, // upsert by email for convenience
      {
        name: 'Google Demo',
        email,
        google: { sub, picture },
        avatar: picture,
        emailVerifiedAt: new Date(), // Google usually returns email_verified=true
        role: 'student'
        // NOTE: no passwordHash on purpose
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log('✅ Google-only user upserted:', {
      id: user._id.toString(),
      email: user.email,
      hasPasswordHash: !!user.passwordHash, // should be false/undefined
      googleSub: user.google?.sub
    });

    process.exit(0);
  } catch (err) {
    console.error('❌ smoke-google-user failed:', err.message || err);
    process.exit(1);
  }
})();
