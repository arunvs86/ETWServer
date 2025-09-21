// controllers/sessions.controller.js
const Stripe = require('stripe');
const { Types } = require('mongoose'); // ensure imported
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

const { FRONTEND_URL = 'http://localhost:5173' } = process.env;

const TutoringSession   = require('../models/TutoringSession');
const TutorAvailability = require('../models/TutorAvailability');
const TutorProfile      = require('../models/TutorProfile');
const User              = require('../models/User');
const { generateSlots } = require('../services/slotEngine');
const {grantTutoringAfterPayment} = require('../services/tutoringPurchase.service')


function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const asyncH = fn => (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);

// States that block a slot
const ACTIVE = ['hold','payment_pending','confirmed'];

/** ---------- Public: availability ---------- */
const getTutorAvailabilityPublic = asyncH(async (req, res) => {
  const tutorId = req.params.tutorId;
  if (!Types.ObjectId.isValid(tutorId)) return res.status(404).json({ message: 'Tutor not found' });
  const { from, to, durationMin } = req.query || {};

  if (!Types.ObjectId.isValid(tutorId)) throw httpError(404, 'Tutor not found');   // <-- add
  if (!from || !to) throw httpError(400, 'from and to are required (YYYY-MM-DD)');


  const [profile, avail] = await Promise.all([
    TutorProfile.findOne({ userId: tutorId, isListed: true }).lean(),
    TutorAvailability.findOne({ tutorId }).lean()
  ]);
  if (!profile) throw httpError(404, 'Tutor not found');
  if (!avail)   return res.json({ slots: [] });

  const startRange = new Date(`${from}T00:00:00.000Z`);
  const endRange   = new Date(`${to}T23:59:59.999Z`);

  const busy = await TutoringSession.find({
    tutorId,
    $and: [{ startAt: { $lt: endRange } }, { endAt: { $gt: startRange } }],
    $or: [
      { status: { $in: ['confirmed', 'payment_pending'] } },
      { status: 'hold', holdExpiresAt: { $gt: new Date() } },
    ],
  }).select('startAt endAt').lean();

  const durMin = Math.max(15, Number(durationMin || avail.slotSizeMin || 60));

  const slots = generateSlots({
    timezone:   avail.timezone || 'Europe/London',
    weekly:     avail.weekly || [],
    exceptions: avail.exceptions || [],
    from, to,
    slotSizeMin: avail.slotSizeMin || 60,
    durationMin: durMin,
    bufferMin:   avail.bufferMin || 0,
    busy,
  });

  res.json({ slots });
});


/** ---------- Public: start checkout (creates payment_pending) ---------- */
const createTutoringCheckout = asyncH(async (req, res) => {
  if (!stripe) throw httpError(500, 'Stripe not configured');

  const studentId = req.auth.userId;
  const tutorId = req.params.tutorId;
  if (!Types.ObjectId.isValid(tutorId)) return res.status(404).json({ message: 'Tutor not found' });

  const { startAt, endAt } = req.body || {};
  if (!startAt || !endAt) throw httpError(400, 'startAt and endAt are required');

  const avail = await TutorAvailability.findOne({ tutorId }).lean();
  const profile = await TutorProfile.findOne({ userId: tutorId, isListed: true }).lean();
  if (!profile) throw httpError(404, 'Tutor not found or not listed');
  if (!avail)   throw httpError(400, 'Tutor has no availability');

  const from = startAt.slice(0,10);
  const to   = endAt.slice(0,10);

  const busy = await TutoringSession.find({
    tutorId,
    $and: [{ startAt: { $lt: new Date(endAt) } }, { endAt: { $gt: new Date(startAt) } }],
    $or: [
      { status: { $in: ['confirmed', 'payment_pending'] } },
      { status: 'hold', holdExpiresAt: { $gt: new Date() } },
    ],
  }).select('startAt endAt').lean();

  const durationMin = Math.round((new Date(endAt) - new Date(startAt)) / 60000);
  const candidate = generateSlots({
    timezone:   avail.timezone || 'Europe/London',
    weekly:     avail.weekly || [],
    exceptions: avail.exceptions || [],
    from, to,
    slotSizeMin: avail.slotSizeMin || 60,
    durationMin,
    bufferMin:   avail.bufferMin || 0,
    busy,
  });

  const startIso = new Date(startAt).toISOString();
  const endIso   = new Date(endAt).toISOString();
  if (!candidate.find(s => s.startAt === startIso && s.endAt === endIso)) {
    throw httpError(409, 'Requested slot is not available');
  }

  const amountMinor = Math.ceil((profile.hourlyRateMinor || 0) * (durationMin / 60));
  const currency    = profile.currency || 'GBP';

  const hold = await TutoringSession.create({
    tutorId, studentId,
    startAt: new Date(startAt),
    endAt:   new Date(endAt),
    currency,
    amountMinor,
    status: 'payment_pending',
    holdExpiresAt: new Date(Date.now() + 20 * 60 * 1000),
  });

  const tutorUser = await User.findById(tutorId).select('name').lean();
  const productName = `1:1 Tutoring with ${tutorUser?.name || 'Tutor'}`;
  const desc = `${durationMin} min session`;

  const successUrl = `${FRONTEND_URL}/tutors/booking-success?sid={CHECKOUT_SESSION_ID}&tid=${hold._id}`;
  const cancelUrl  = `${FRONTEND_URL}/tutors/${encodeURIComponent(tutorId)}?cancelled=1`;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: successUrl,
    cancel_url:  cancelUrl,
    line_items: [{
      quantity: 1,
      price_data: {
        currency,
        unit_amount: amountMinor,
        product_data: { name: productName, description: desc },
      },
    }],
    metadata: {
      type: 'tutoring',
      tutoringSessionId: String(hold._id),
      tutorId: String(tutorId),
      studentId: String(studentId),
      startAt: startIso,
      endAt: endIso,
      durationMin: String(durationMin),
    }
  });

  hold.stripeCheckoutSessionId = session.id;
  await hold.save();

  res.json({ url: session.url, sessionId: session.id });
});

/** ---------- Me (student/tutor): list/get/cancel/reschedule ---------- */
const listMine = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const q = req.validatedQuery || req.query || {};
  const { role='student', status, from, to, page='1', limit='20' } = q;

  const filter = {};
  if (role === 'student') filter.studentId = me; else filter.tutorId = me;

  if (status) filter.status = { $in: String(status).split(',').map(s => s.trim()).filter(Boolean) };
  if (from || to) {
    filter.startAt = {};
    if (from) filter.startAt.$gte = new Date(from + 'T00:00:00.000Z');
    if (to)   filter.startAt.$lte = new Date(to   + 'T23:59:59.999Z');
  }

  const pg = Math.max(1, parseInt(page,10)||1);
  const lim = Math.min(50, Math.max(1, parseInt(limit,10)||20));
  const skip = (pg-1)*lim;

  const [items, total] = await Promise.all([
    TutoringSession.find(filter).sort({ startAt: 1 }).skip(skip).limit(lim),
    TutoringSession.countDocuments(filter),
  ]);

  res.json({ page: pg, limit: lim, total, items });
});

const getMine = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const id = req.params.id;

  const doc = await TutoringSession.findById(id);
  if (!doc) throw httpError(404, 'Session not found');
  if (String(doc.studentId) !== me && String(doc.tutorId) !== me) throw httpError(403, 'Forbidden');
  res.json(doc);
});

const cancelMine = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const id = req.params.id;
  const doc = await TutoringSession.findById(id);
  if (!doc) throw httpError(404, 'Session not found');

  const isOwner = (String(doc.studentId) === me) || (String(doc.tutorId) === me);
  if (!isOwner) throw httpError(403, 'Forbidden');

  if (['completed','refunded','cancelled'].includes(doc.status)) {
    throw httpError(400, `Cannot cancel a ${doc.status} session`);
  }
  const hrs = (doc.startAt - new Date()) / 3600000;
  if (hrs <= 24) throw httpError(400, 'Too late to cancel (<=24h)');

  doc.status = 'cancelled';
  await doc.save();
  res.json({ message: 'Cancelled', session: doc });
});

const rescheduleMine = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const id = req.params.id;
  const { startAt, endAt } = req.body || {};

  const doc = await TutoringSession.findById(id);
  if (!doc) throw httpError(404, 'Session not found');

  const isOwner = (String(doc.studentId) === me) || (String(doc.tutorId) === me);
  if (!isOwner) throw httpError(403, 'Forbidden');

  if (['completed','refunded','cancelled'].includes(doc.status)) {
    throw httpError(400, `Cannot reschedule a ${doc.status} session`);
  }
  const hrs = (doc.startAt - new Date()) / 3600000;
  if (hrs <= 24) throw httpError(400, 'Too late to reschedule (<=24h)');

  const tutorId = doc.tutorId;
  const avail = await TutorAvailability.findOne({ tutorId }).lean();
  const profile = await TutorProfile.findOne({ userId: tutorId, isListed: true }).lean();
  if (!profile) throw httpError(404, 'Tutor not found or not listed');
  if (!avail)   throw httpError(400, 'Tutor has no availability');

  const from = String(startAt).slice(0,10);
  const to   = String(endAt).slice(0,10);
  const busy = await TutoringSession.find({
    tutorId,
    $and: [{ startAt: { $lt: new Date(endAt) } }, { endAt: { $gt: new Date(startAt) } }],
    status: { $in: ACTIVE },
  }).select('startAt endAt').lean();

  const durationMin = Math.round((new Date(endAt) - new Date(startAt)) / 60000);
  const candidate = generateSlots({
    timezone:   avail.timezone || 'Europe/London',
    weekly:     avail.weekly || [],
    exceptions: avail.exceptions || [],
    from, to,
    slotSizeMin: avail.slotSizeMin || 60,
    durationMin,
    bufferMin:   avail.bufferMin || 0,
    busy,
  });

  const startIso = new Date(startAt).toISOString();
  const endIso   = new Date(endAt).toISOString();
  if (!candidate.find(s => s.startAt === startIso && s.endAt === endIso)) {
    throw httpError(409, 'Requested slot is not available');
  }

  doc.startAt = new Date(startAt);
  doc.endAt   = new Date(endAt);
  if (doc.status === 'hold') {
    doc.holdExpiresAt = new Date(Date.now() + 15*60*1000);
  }
  await doc.save();

  res.json({ message: 'Rescheduled', session: doc });
});

/** ---------- Tutor management (used by tutorManage.routes) ---------- */
const listAsTutor = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const q = req.validatedQuery || req.query || {};
  const { status, from, to, page='1', limit='20' } = q;

  const filter = { tutorId: me };
  if (status) filter.status = { $in: String(status).split(',').map(s => s.trim()).filter(Boolean) };
  if (from || to) {
    filter.startAt = {};
    if (from) filter.startAt.$gte = new Date(from + 'T00:00:00.000Z');
    if (to)   filter.startAt.$lte = new Date(to   + 'T23:59:59.999Z');
  }

  const pg = Math.max(1, parseInt(page,10)||1);
  const lim = Math.min(50, Math.max(1, parseInt(limit,10)||20));
  const skip = (pg-1)*lim;

  const [items, total] = await Promise.all([
    TutoringSession.find(filter).sort({ startAt: 1 }).skip(skip).limit(lim),
    TutoringSession.countDocuments(filter),
  ]);

  res.json({ page: pg, limit: lim, total, items });
});

const completeAsTutor = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const id = req.params.id;

  const doc = await TutoringSession.findById(id);
  if (!doc) throw httpError(404, 'Session not found');
  if (String(doc.tutorId) !== me) throw httpError(403, 'Forbidden');

  if (doc.status !== 'confirmed') throw httpError(400, 'Only confirmed sessions can be completed');
  if (new Date() < doc.endAt)     throw httpError(400, 'Session has not ended yet');

  doc.status = 'completed';
  await doc.save();

  res.json({ message: 'Marked as completed', session: doc });
});

const requestCancel = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const id = req.params.id;
  const { reason } = req.body || {};

  const doc = await TutoringSession.findById(id);
  if (!doc) throw httpError(404, 'Session not found');
  if (String(doc.studentId) !== me) throw httpError(403, 'Only the student can request cancel');

  if (['completed','refunded','cancelled'].includes(doc.status)) {
    throw httpError(400, `Cannot cancel a ${doc.status} session`);
  }

  const hrs = (doc.startAt - new Date()) / 3600000;
  if (hrs > 24) throw httpError(400, 'Use standard cancel (more than 24h away)');

  doc.cancelRequest = {
    requestedBy: doc.studentId,
    reason: reason || '',
    requestedAt: new Date(),
  };
  await doc.save();

  res.json({ message: 'Cancel request submitted', session: doc });
});

const approveCancelAsTutor = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const id = req.params.id;

  const doc = await TutoringSession.findById(id);
  if (!doc) throw httpError(404, 'Session not found');
  if (String(doc.tutorId) !== me) throw httpError(403, 'Forbidden');

  if (!doc.cancelRequest?.requestedAt) {
    throw httpError(400, 'No cancel request to approve');
  }
  if (['completed','refunded','cancelled'].includes(doc.status)) {
    throw httpError(400, `Cannot cancel a ${doc.status} session`);
  }

  doc.status = 'cancelled';
  doc.cancelRequest.approvedAt = new Date();
  doc.cancelRequest.approvedBy = me;
  await doc.save();

  res.json({ message: 'Cancellation approved', session: doc });
});


const getTutoringCheckoutStatus = asyncH(async (req, res) => {
  const sid = String(req.query.sid || '');
  if (!sid) throw httpError(400, 'sid required');

  const doc = await TutoringSession.findOne({ stripeCheckoutSessionId: sid }).lean();
  if (!doc) throw httpError(404, 'Booking not found');

  res.json({
    status: doc.status,
    meetingLink: doc.meetingLink || null,
    session: {
      id: String(doc._id),
      tutorId: String(doc.tutorId),
      studentId: String(doc.studentId),
      startAt: doc.startAt,
      endAt: doc.endAt,
    }
  });
});

// ✅ NEW: lets success page force-confirm from Stripe if webhook didn’t run
const syncTutoringFromCheckoutPublic = asyncH(async (req, res) => {
  if (!stripe) throw httpError(500, 'Stripe not configured');
  const sid = String(req.query.sid || '');
  if (!sid) throw httpError(400, 'sid required');

  // 1) Pull fresh Checkout Session from Stripe
  const sess = await stripe.checkout.sessions.retrieve(sid);
  if (!sess) throw httpError(404, 'Checkout Session not found');
  if (sess.payment_status !== 'paid') {
    throw httpError(400, `Session not paid: ${sess.payment_status}`);
  }

  // 2) Run your grant (flips to confirmed + meetingLink + emails)
  const out = await grantTutoringAfterPayment({ session: sess });

  // 3) Return current booking
  const doc = await TutoringSession.findOne({ stripeCheckoutSessionId: sid }).lean()
            || await TutoringSession.findById(sess.metadata?.tutoringSessionId).lean();
  if (!doc) throw httpError(404, 'Booking not found after grant');

  res.json({
    ok: true,
    status: doc.status,
    meetingLink: doc.meetingLink || null,
    bookingId: String(doc._id),
    session: {
      id: String(doc._id),
      tutorId: String(doc.tutorId),
      studentId: String(doc.studentId),
      startAt: doc.startAt,
      endAt: doc.endAt,
    }
  });
});

const confirmTutoringCheckout = asyncH(async (req, res) => {
  if (!stripe) throw httpError(500, 'Stripe not configured');

  const studentId = req.auth.userId;
  const tutoringId = req.params.id;
  const { sessionId } = req.body || {};

  if (!Types.ObjectId.isValid(tutoringId)) throw httpError(400, 'Invalid tutoring id');
  if (!sessionId) throw httpError(400, 'Missing sessionId');

  const booking = await TutoringSession.findById(tutoringId);
  if (!booking) throw httpError(404, 'Tutoring booking not found');

  // Pull Checkout Session from Stripe
  const sess = await stripe.checkout.sessions.retrieve(sessionId);

  // Strict meta checks (mirror live)
  const metaOk =
    sess?.metadata?.type === 'tutoring' &&
    String(sess?.metadata?.tutoringSessionId) === String(booking._id) &&
    String(sess?.metadata?.studentId) === String(studentId);
  const paid = (sess?.payment_status === 'paid') || (sess?.status === 'complete');

  if (!metaOk) throw httpError(400, 'Session metadata mismatch');
  if (!paid)   throw httpError(409, 'Payment not completed yet');

  // Let the shared service flip to confirmed, set meetingLink, send emails
  await grantTutoringAfterPayment({ session: sess });

  const fresh = await TutoringSession.findById(tutoringId).lean();
  return res.json({
    ok: true,
    status: fresh.status,
    meetingLink: fresh.meetingLink || null,
    session: {
      id: String(fresh._id),
      tutorId: String(fresh.tutorId),
      studentId: String(fresh.studentId),
      startAt: fresh.startAt,
      endAt: fresh.endAt,
    }
  });
});

module.exports = {
  // Public
  getTutorAvailabilityPublic,
  createTutoringCheckout,
  // Me
  listMine,
  getMine,
  cancelMine,
  rescheduleMine,
  // Tutor mgmt (used by tutorManage.routes)
  listAsTutor,
  completeAsTutor,
  requestCancel,
  approveCancelAsTutor,
  getTutoringCheckoutStatus,
  syncTutoringFromCheckoutPublic,
  confirmTutoringCheckout
};
