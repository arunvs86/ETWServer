require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Membership = require('../models/Membership');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const user = await User.findOne({ email: 'demo.student@example.com' });
    if (!user) throw new Error('Demo student not found. Run smoke-user first.');

    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const doc = await Membership.findOneAndUpdate(
      { userId: user._id, status: 'active' }, // respects the partial unique index
      {
        userId: user._id,
        plan: 'exec',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: in30,
        cancelAtPeriodEnd: false,
        provider: 'stripe',
        stripe: {
          customerId: 'cus_demo_123',
          subscriptionId: 'sub_demo_123',
          priceId: 'price_demo_exec_monthly'
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log('🪪 membership upserted:', {
      id: doc._id.toString(),
      user: user.email,
      plan: doc.plan,
      status: doc.status,
      activeNow: doc.isActiveNow(),
      period: [doc.currentPeriodStart.toISOString(), doc.currentPeriodEnd.toISOString()]
    });

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-membership failed:', err.message || err);
    process.exit(1);
  }
})();
