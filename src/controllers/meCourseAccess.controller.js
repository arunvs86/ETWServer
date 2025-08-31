const Course = require('../models/Course');
const Order  = require('../models/Order');
const Enrollment = require('../models/Enrollment');
const Membership = require('../models/Membership');

function uid(req){ return req.user?.id || req.user?._id; }

async function owned(req, res, next) {
  try {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ owned: false });

    const { slug } = req.params;
    const course = await Course.findOne({ slug });
    if (!course) return res.json({ owned: false });

    if (course.pricing.amountMinor === 0) return res.json({ owned: true });

    const mem = await Membership.findOne({ userId });
    const now = new Date();
    const memberActive = !!mem && (mem.status === 'active' || mem.status === 'trialing') &&
      now >= mem.currentPeriodStart && now < mem.currentPeriodEnd;
    if (memberActive && course.pricing.includedInMembership) return res.json({ owned: true });

    const enr = await Enrollment.findOne({ userId, courseId: course._id });
    return res.json({ owned: !!enr });
  } catch (e) { next(e); }
}
module.exports = { owned };
