// controllers/checkout.controller.js
// const { requireStripe } = require('../services/stripeClient');
const TutoringSession = require('../models/TutoringSession');
const TutorProfile = require('../models/TutorProfile');
const TutorAvailability = require('../models/TutorAvailability');
const { generateSlots } = require('../services/slotEngine');

function httpError(status, msg) {
  const e = new Error(msg);
  e.status = status;
  return e;
}
const asyncH = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ACTIVE = ['hold', 'payment_pending', 'confirmed'];

/**
 * Utility: confirm a requested slot is still valid & free.
 */
async function assertSlotIsBookable({ tutorId, startAt, endAt }) {
  const avail = await TutorAvailability.findOne({ tutorId }).lean();
  const profile = await TutorProfile.findOne({ userId: tutorId, isListed: true }).lean();
  if (!profile) throw httpError(404, 'Tutor not found or not listed');
  if (!avail) throw httpError(400, 'Tutor has no availability');

  const start = new Date(startAt);
  const end = new Date(endAt);
  const reqMs = end - start;
  if (reqMs <= 0) throw httpError(400, 'Invalid time range');

  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);

  const busy = await TutoringSession.find({
    tutorId,
    status: { $in: ACTIVE },
    $or: [{ startAt: { $lte: end }, endAt: { $gte: start } }]
  }).select('startAt endAt').lean();

  const durationMin = Math.round(reqMs / 60000);

  const slots = generateSlots({
    timezone: avail.timezone || 'Europe/London',
    weekly: avail.weekly || [],
    exceptions: avail.exceptions || [],
    from,
    to,
    slotSizeMin: avail.slotSizeMin || 60,
    durationMin,
    bufferMin: avail.bufferMin || 0,
    busy
  });

  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const match = slots.find(s => s.startAt === startIso && s.endAt === endIso);
  if (!match) throw httpError(409, 'Requested slot is not available');
}

/**
 * POST /tutors/:tutorId/checkout
 * Body: { startAt, endAt } (UTC ISO)
 * - Validates slot
 * - Creates a hold TutoringSession
 * - Creates Stripe Checkout Session
 * - Updates session to payment_pending
 * - Returns { url, sessionId }
 */
exports.createCheckout = asyncH(async (req, res) => {
  // const stripe = requireStripe();
  const studentId = req.auth.userId;
  const tutorId = req.params.tutorId;
  const { startAt, endAt } = req.body || {};

  if (!startAt || !endAt) throw httpError(400, 'startAt and endAt are required');

  // Validate slot
  await assertSlotIsBookable({ tutorId, startAt, endAt });

  // Snapshot tutor pricing
  const profile = await TutorProfile.findOne({ userId: tutorId }).lean();
  if (!profile) throw httpError(404, 'Tutor not found');

  const durationMin = Math.round((new Date(endAt) - new Date(startAt)) / 60000);
  const amountMinor = Math.ceil((profile.hourlyRateMinor || 0) * (durationMin / 60));

  // Create hold
  const hold = await TutoringSession.create({
    tutorId,
    studentId,
    startAt: new Date(startAt),
    endAt: new Date(endAt),
    currency: profile.currency || 'GBP',
    amountMinor,
    status: 'hold',
    holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000)
  });

  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

  // Create Stripe Checkout
  // const checkout = await stripe.checkout.sessions.create({
  //   mode: 'payment',
  //   success_url: `${FRONTEND_URL}/tutors/booking/success?sid={CHECKOUT_SESSION_ID}`,
  //   cancel_url: `${FRONTEND_URL}/tutors/${tutorId}?cancelled=1`,
  //   allow_promotion_codes: true,
  //   line_items: [
  //     {
  //       quantity: 1,
  //       price_data: {
  //         currency: (profile.currency || 'GBP').toLowerCase(),
  //         unit_amount: amountMinor,
  //         product_data: {
  //           name: `1-to-1 Session (${durationMin} min)`,
  //           description: profile.headline || 'Tutoring Session'
  //         }
  //       }
  //     }
  //   ],
  //   metadata: {
  //     type: 'tutoring',                  // 👈 tells webhook what this is
  //     userId: String(studentId),         // 👈 your webhook expects userId
  //     tutoringSessionId: String(hold._id),
  //     tutorId: String(tutorId),
  //     studentId: String(studentId),
  //     startAt: new Date(startAt).toISOString(),
  //     endAt: new Date(endAt).toISOString(),
  //     durationMin: String(durationMin)
  //   }
  // });

  hold.stripeCheckoutSessionId = '123hjfs3r'
  hold.status = 'payment_pending';
  // Give Checkout longer TTL so it isn’t auto-cancelled mid-payment
  hold.holdExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await hold.save();

  res.json({ url: "http://localhost:5173", sessionId: '123hjfs3r' });
});
