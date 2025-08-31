const sale = require('../services/courseSale.service');

function uid(req){ return req.user?.id || req.user?._id || req.headers['x-user-id']; }

// POST /instructor/courses/:courseId/publish
async function publish(req, res, next) {
  try {
    const { courseId } = req.params;
    const course = await sale.ensureStripeForCourse(courseId);
    // optionally mark publishedAt if you want: course.status='published'
    return res.json({ ok: true, course: { id: course._id, stripe: course.stripe } });
  } catch (e) { next(e); }
}

// POST /me/courses/:courseId/checkout
async function checkout(req, res, next) {
  try {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'Auth required' });
    const { courseId } = req.params;
    const out = await sale.createCourseCheckout({ userId, courseId });
    return res.status(201).json(out);
  } catch (e) { next(e); }
}

async function syncFromCheckoutPublic(req, res) {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const out = await sale.syncFromCheckoutSessionPublic({ sessionId });
    return res.json({ ok: true, ...out });
  } catch (err) {
    console.error('[COURSE SYNC PUBLIC] error:', err.message);
    res.status(err.status || 400).json({ error: err.message });
  }
}

module.exports = { publish, checkout,syncFromCheckoutPublic };
