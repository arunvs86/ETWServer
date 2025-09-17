// controllers/sessions.controller.js
const TutoringSession = require('../models/TutoringSession');
const TutorAvailability = require('../models/TutorAvailability');
const TutorProfile = require('../models/TutorProfile');
const { generateSlots } = require('../services/slotEngine');

function httpError(status,msg){ const e=new Error(msg); e.status=status; return e; }
const asyncH = fn => (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);

const ACTIVE = ['hold','payment_pending','confirmed'];

/**
 * Utility: check if a (startAt,endAt) is an allowed, free slot for a tutor.
 * It converts the requested date range into the tutor's local date span and
 * calls the slot engine, then ensures exact match.
 */
async function assertSlotIsBookable({ tutorId, startAt, endAt }) {
  const avail = await TutorAvailability.findOne({ tutorId }).lean();
  const profile = await TutorProfile.findOne({ userId: tutorId, isListed: true }).lean();
  if (!profile) throw httpError(404, 'Tutor not found or not listed');
  if (!avail) throw httpError(400, 'Tutor has no availability');

  const start = new Date(startAt);
  const end   = new Date(endAt);
  const reqMs = end - start;
  if (reqMs <= 0) throw httpError(400, 'Invalid time range');

  // Determine date window (tutor TZ) to query slots
  const from = (new Date(startAt)).toISOString().slice(0,10);
  const to   = (new Date(endAt)).toISOString().slice(0,10);

  // busy sessions:
  const busy = await TutoringSession.find({
    tutorId, status: { $in: ACTIVE },
    $or: [{ startAt: { $lte: end } , endAt: { $gte: start } }]
  }).select('startAt endAt').lean();

  // Use durationMin equal to requested duration (in minutes) to ensure exact sized slots
  const durationMin = Math.round(reqMs / 60000);

  const slots = generateSlots({
    timezone: avail.timezone || 'Europe/London',
    weekly: avail.weekly || [],
    exceptions: avail.exceptions || [],
    from, to,
    slotSizeMin: avail.slotSizeMin || 60,
    durationMin,
    bufferMin: avail.bufferMin || 0,
    busy
  });

  const startIso = new Date(startAt).toISOString();
  const endIso   = new Date(endAt).toISOString();
  const match = slots.find(s => s.startAt === startIso && s.endAt === endIso);
  if (!match) throw httpError(409, 'Requested slot is not available');
}

/**
 * POST /tutors/:tutorId/sessions
 * Body: { startAt, endAt } (ISO UTC)
 * Creates a HOLD (no payment yet). Amount is a snapshot from tutor hourlyRate.
 */
exports.createHold = asyncH( async (req, res) => {
  const studentId = req.auth.userId;
  const tutorId = req.params.tutorId;
  const { startAt, endAt } = req.validated;

  // ensure slot is valid & free
  await assertSlotIsBookable({ tutorId, startAt, endAt });

  // price snapshot
  const profile = await TutorProfile.findOne({ userId: tutorId }).lean();
  if (!profile) throw httpError(404, 'Tutor not found');
  const durationMin = Math.round((new Date(endAt) - new Date(startAt)) / 60000);
  const amountMinor = Math.ceil((profile.hourlyRateMinor || 0) * (durationMin / 60));

  // final safety: unique index will also protect from races
  const doc = await TutoringSession.create({
    tutorId, studentId,
    startAt: new Date(startAt),
    endAt: new Date(endAt),
    currency: profile.currency || 'GBP',
    amountMinor,
    status: 'hold',
    holdExpiresAt: new Date(Date.now() + 15*60*1000)
  });

  res.status(201).json(doc);
});

/**
 * GET /me/tutoring-sessions
 * Query: role=student|tutor, status, from, to, page, limit
 */
exports.listMine = asyncH( async (req, res) => {
  const me = req.auth.userId;
  const { role='student', status, from, to, page='1', limit='20' } = req.validatedQuery;

  const filter = {};
  if (role === 'student') filter.studentId = me;
  else filter.tutorId = me;

  if (status) {
    const arr = status.split(',').map(s=>s.trim()).filter(Boolean);
    filter.status = { $in: arr };
  }
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
    TutoringSession.countDocuments(filter)
  ]);

  res.json({ page: pg, limit: lim, total, items });
});

/**
 * GET /me/tutoring-sessions/:id
 */
exports.getMine = asyncH( async (req, res) => {
  const me = req.auth.userId;
  const id = req.params.id;

  const doc = await TutoringSession.findById(id);
  if (!doc) throw httpError(404, 'Session not found');
  if (String(doc.studentId) !== me && String(doc.tutorId) !== me) {
    throw httpError(403, 'Forbidden');
  }
  res.json(doc);
});

/**
 * PATCH /me/tutoring-sessions/:id/cancel
 * Simple rule: can cancel if not completed/refunded and startAt is > 24h away.
 */
exports.cancelMine = asyncH( async (req, res) => {
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
  if (hrs <= 24) {
    // You can change this policy later; for now block late cancels.
    throw httpError(400, 'Too late to cancel (<=24h)');
  }

  doc.status = 'cancelled';
  await doc.save();
  res.json({ message: 'Cancelled', session: doc });
});

/**
 * PATCH /me/tutoring-sessions/:id/reschedule
 * Body: { startAt, endAt } — validates new slot against availability and busy sessions.
 * Only allowed for: creator (student) or tutor, and only if not completed/refunded/cancelled,
 * and if now < (old startAt - 24h).
 */
exports.rescheduleMine = asyncH( async (req, res) => {
  const me = req.auth.userId;
  const id = req.params.id;
  const { startAt, endAt } = req.validated;

  const doc = await TutoringSession.findById(id);
  if (!doc) throw httpError(404, 'Session not found');

  const isOwner = (String(doc.studentId) === me) || (String(doc.tutorId) === me);
  if (!isOwner) throw httpError(403, 'Forbidden');

  if (['completed','refunded','cancelled'].includes(doc.status)) {
    throw httpError(400, `Cannot reschedule a ${doc.status} session`);
  }
  const hrs = (doc.startAt - new Date()) / 3600000;
  if (hrs <= 24) throw httpError(400, 'Too late to reschedule (<=24h)');

  // Check the new slot for the same tutor
  await assertSlotIsBookable({ tutorId: doc.tutorId, startAt, endAt });

  // Update window and extend hold if it was a hold
  doc.startAt = new Date(startAt);
  doc.endAt   = new Date(endAt);
  if (doc.status === 'hold') {
    doc.holdExpiresAt = new Date(Date.now() + 15*60*1000);
  }
  await doc.save();

  res.json({ message: 'Rescheduled', session: doc });
});


function httpError(status,msg){ const e=new Error(msg); e.status=status; return e; }
// const asyncH = fn => (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);

/**
 * Tutor list view (same shape as listMine but forced to tutor role)
 * GET /me/tutor/sessions
 */
exports.listAsTutor = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const { status, from, to, page='1', limit='20' } = req.validatedQuery;

  const filter = { tutorId: me };
  if (status) filter.status = { $in: status.split(',').map(s => s.trim()).filter(Boolean) };
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
    TutoringSession.countDocuments(filter)
  ]);

  res.json({ page: pg, limit: lim, total, items });
});

/**
 * Tutor marks a session as completed
 * PATCH /me/tutor/sessions/:id/complete
 * - Only tutor owner
 * - Only if status=confirmed
 * - Only after endAt has passed
 */
exports.completeAsTutor = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const id = req.params.id;

  const doc = await TutoringSession.findById(id);
  if (!doc) throw httpError(404, 'Session not found');
  if (String(doc.tutorId) !== me) throw httpError(403, 'Forbidden');

  if (doc.status !== 'confirmed') throw httpError(400, 'Only confirmed sessions can be completed');
  if (new Date() < doc.endAt) throw httpError(400, 'Session has not ended yet');

  doc.status = 'completed';
  await doc.save();

  res.json({ message: 'Marked as completed', session: doc });
});

/**
 * Student requests cancellation (used when inside 24h window)
 * PATCH /me/tutoring-sessions/:id/cancel-request
 */
exports.requestCancel = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const id = req.params.id;
  const { reason } = req.validated;

  const doc = await TutoringSession.findById(id);
  if (!doc) throw httpError(404, 'Session not found');
  if (String(doc.studentId) !== me) throw httpError(403, 'Only the student can request cancel');

  if (['completed','refunded','cancelled'].includes(doc.status)) {
    throw httpError(400, `Cannot cancel a ${doc.status} session`);
  }

  // If more than 24h away, user should use the normal cancel endpoint
  const hrs = (doc.startAt - new Date()) / 3600000;
  if (hrs > 24) throw httpError(400, 'Use standard cancel (more than 24h away)');

  // Idempotent: if already requested and not decided, overwrite reason/time
  doc.cancelRequest = {
    requestedBy: doc.studentId,
    reason,
    requestedAt: new Date()
  };
  await doc.save();

  res.json({ message: 'Cancel request submitted', session: doc });
});

/**
 * Tutor approves a cancel request (policy override)
 * PATCH /me/tutor/sessions/:id/approve-cancel
 * - Only tutor owner
 * - Only if there is a pending cancelRequest
 * - Changes status -> cancelled
 * (Refund handling can be added later)
 */
exports.approveCancelAsTutor = asyncH(async (req, res) => {
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
