require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Course = require('../models/Course');
const Order = require('../models/Order');
const Enrollment = require('../models/Enrollment');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const [student, course] = await Promise.all([
      User.findOne({ email: 'demo.student@example.com' }),
      Course.findOne({ slug: 'ucat-masterclass-2025' })
    ]);
    if (!student) throw new Error('Demo student not found. Run smoke-user.');
    if (!course) throw new Error('Demo course not found. Run smoke-course.');

    // pretend a Stripe Checkout just succeeded
    const idempotencyKey = 'demo-order-course-ucat-1';

    const order = await Order.findOneAndUpdate(
      { idempotencyKey },
      {
        userId: student._id,
        items: [{
          kind: 'course',
          refId: course._id,
          titleSnapshot: course.title,
          amountMinor: course.pricing?.amountMinor ?? 0,
          currency: course.pricing?.currency ?? 'GBP'
        }],
        totalAmountMinor: course.pricing?.amountMinor ?? 0,
        currency: course.pricing?.currency ?? 'GBP',
        status: 'paid',
        paymentProvider: 'stripe',
        stripe: {
          customerId: 'cus_demo_123',
          paymentIntentId: 'pi_demo_123',
          checkoutSessionId: 'cs_demo_123'
        },
        idempotencyKey
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log('🧾 order upserted:', {
      id: order._id.toString(),
      status: order.status,
      total: order.totalAmountMinor,
      currency: order.currency
    });

    // grant entitlement if paid (this mimics the webhook service behavior)
    if (order.isPaid()) {
      const item = order.items.find(i => i.kind === 'course');
      if (item?.refId) {
        const enr = await Enrollment.findOneAndUpdate(
          { userId: student._id, courseId: item.refId },
          {
            userId: student._id,
            courseId: item.refId,
            via: 'purchase',
            status: 'active',
            activatedAt: new Date(),
            orderId: order._id
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log('🎟️  enrollment granted:', {
          enrollmentId: enr._id.toString(),
          user: student.email,
          course: course.slug,
          via: enr.via
        });
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('✗ smoke-order failed:', err.message || err);
    process.exit(1);
  }
})();
