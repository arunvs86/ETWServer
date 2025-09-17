// controllers/availability.controller.js
const TutorAvailability = require('../models/TutorAvailability');
const TutoringSession = require('../models/TutoringSession');
const TutorProfile = require('../models/TutorProfile');
const { generateSlots } = require('../services/slotEngine');

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const asyncH = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ACTIVE_STATUSES = ['hold','payment_pending','confirmed'];

// ===== Normalizers (same as meTutor.controller) =====
const DOW_NUM_TO_TOKEN = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

function timeStrToMin(hhmm) {
  if (typeof hhmm !== 'string') return undefined;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return undefined;
  return h * 60 + min;
}
function normalizeWeekly(weekly) {
  if (!Array.isArray(weekly)) return [];
  return weekly.map(w => {
    if (!w) return null;
    if (typeof w.dow === 'string' && typeof w.startMin === 'number' && typeof w.endMin === 'number' && w.endMin > w.startMin) return w;
    const isNum = typeof w.dow === 'number' && w.dow >= 0 && w.dow <= 6;
    const s = timeStrToMin(w.start), e = timeStrToMin(w.end);
    if (!isNum || s == null || e == null || e <= s) return null;
    return { dow: DOW_NUM_TO_TOKEN[w.dow], startMin: s, endMin: e };
  }).filter(Boolean);
}
function normalizeExceptions(exceptions) {
  if (!Array.isArray(exceptions)) return [];
  const flat = [];
  for (const e of exceptions) {
    if (!e || !e.date) continue;
    if (typeof e.startMin === 'number' && typeof e.endMin === 'number' && e.endMin > e.startMin) {
      flat.push({ date: e.date, startMin: e.startMin, endMin: e.endMin });
      continue;
    }
    if (e.start || e.end) {
      const s = timeStrToMin(e.start), ee = timeStrToMin(e.end);
      if (s != null && ee != null && ee > s) flat.push({ date: e.date, startMin: s, endMin: ee });
      continue;
    }
    if (Array.isArray(e.blocks)) {
      for (const b of e.blocks) {
        if (!b) continue;
        if (typeof b.startMin === 'number' && typeof b.endMin === 'number' && b.endMin > b.startMin) {
          flat.push({ date: e.date, startMin: b.startMin, endMin: b.endMin });
          continue;
        }
        const s = timeStrToMin(b.start), ee = timeStrToMin(b.end);
        if (s != null && ee != null && ee > s) flat.push({ date: e.date, startMin: s, endMin: ee });
      }
    }
  }
  // merge overlaps per date
  const byDate = flat.reduce((acc, x) => {
    (acc[x.date] ||= []).push({ startMin: x.startMin, endMin: x.endMin });
    return acc;
  }, {});
  const merged = [];
  for (const [date, arr] of Object.entries(byDate)) {
    arr.sort((a,b)=>a.startMin-b.startMin);
    const out = [];
    for (const w of arr) {
      if (!out.length || w.startMin > out[out.length-1].endMin) out.push({ ...w });
      else out[out.length-1].endMin = Math.max(out[out.length-1].endMin, w.endMin);
    }
    for (const w of out) merged.push({ date, startMin: w.startMin, endMin: w.endMin });
  }
  return merged;
}

// ----- Me (instructor) -----
exports.getMyAvailability = asyncH(async (req, res) => {
  const me = req.auth.userId;
  let doc = await TutorAvailability.findOne({ tutorId: me }).lean();
  if (!doc) {
    doc = await TutorAvailability.create({ tutorId: me });
    doc = doc.toObject();
  }
  res.json(doc);
});

exports.putWeekly = asyncH(async (req, res) => {
  const me = req.auth.userId;
  // IMPORTANT: ignore raw validated shape; re-normalize from body to tolerate HH:mm
  const incomingWeekly = (req.body && req.body.weekly) || (req.validated && req.validated.weekly) || [];
  const weekly = normalizeWeekly(incomingWeekly);

  const doc = await TutorAvailability.findOneAndUpdate(
    { tutorId: me },
    { $set: { weekly } },
    { new: true, upsert: true }
  );
  res.json(doc);
});

exports.putExceptions = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const incoming = (req.body && req.body.exceptions) || (req.validated && req.validated.exceptions) || [];
  const exceptions = normalizeExceptions(incoming);

  const doc = await TutorAvailability.findOneAndUpdate(
    { tutorId: me },
    { $set: { exceptions } },
    { new: true, upsert: true }
  );
  res.json(doc);
});

exports.patchSettings = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const { timezone, slotSizeMin, bufferMin } = (req.body || req.validated || {});

  const patch = {};
  if (timezone) patch.timezone = timezone;
  if (typeof slotSizeMin === 'number') patch.slotSizeMin = Math.max(15, slotSizeMin);
  if (typeof bufferMin   === 'number') patch.bufferMin   = Math.max(0, bufferMin);

  const doc = await TutorAvailability.findOneAndUpdate(
    { tutorId: me },
    { $set: patch },
    { new: true, upsert: true }
  );
  res.json(doc);
});

// ----- Public availability -----
exports.getPublicAvailability = asyncH(async (req, res) => {
  const tutorId = req.params.tutorId;
  const { from, to, durationMin } = req.validatedQuery || req.query;

  const profile = await TutorProfile.findOne({ userId: tutorId, isListed: true }).lean();
  if (!profile) throw httpError(404, 'Tutor not found or not listed');

  const avail = await TutorAvailability.findOne({ tutorId }).lean();
  if (!avail) return res.json({ slots: [] });

  const fromDate = new Date(from + 'T00:00:00.000Z');
  const toDate   = new Date(to   + 'T23:59:59.999Z');

  const busy = await TutoringSession.find({
    tutorId,
    status: { $in: ACTIVE_STATUSES },
    $or: [{ startAt: { $lte: toDate }, endAt: { $gte: fromDate } }]
  }).select('startAt endAt').lean();

  const slots = generateSlots({
    timezone: avail.timezone || 'Europe/London',
    weekly: avail.weekly || [],
    exceptions: avail.exceptions || [],
    from, to,
    slotSizeMin: avail.slotSizeMin || 60,
    durationMin: durationMin ? parseInt(durationMin, 10) : undefined,
    bufferMin: avail.bufferMin || 0,
    busy
  });

  res.json({ slots });
});
