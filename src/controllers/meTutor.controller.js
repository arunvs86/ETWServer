// controllers/meTutor.controller.js
const TutorProfile = require('../models/TutorProfile');
const TutorAvailability = require('../models/TutorAvailability');

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const asyncH = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ===== Normalizers (friendly -> DB shape) =====
const DOW_NUM_TO_TOKEN = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

function timeStrToMin(hhmm) {
  if (typeof hhmm !== 'string') return undefined;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return undefined;
  return h * 60 + min;
}

/** weekly: [{dow:0..6,start:'HH:mm',end:'HH:mm'}] or DB shape [{dow:'MON',startMin,endMin}] */
function normalizeWeekly(weekly) {
  if (!Array.isArray(weekly)) return [];
  return weekly.map(w => {
    if (!w) return null;
    if (typeof w.dow === 'string' && typeof w.startMin === 'number' && typeof w.endMin === 'number' && w.endMin > w.startMin) {
      return w;
    }
    const isNum = typeof w.dow === 'number' && w.dow >= 0 && w.dow <= 6;
    const s = timeStrToMin(w.start), e = timeStrToMin(w.end);
    if (!isNum || s == null || e == null || e <= s) return null;
    return { dow: DOW_NUM_TO_TOKEN[w.dow], startMin: s, endMin: e };
  }).filter(Boolean);
}

/** exceptions accepted as:
 *  - {date, startMin, endMin} (DB)
 *  - {date, start:'HH:mm', end:'HH:mm'} (friendly)
 *  - {date, blocks:[ {start,end} | {startMin,endMin} ]} (friendly or DB)
 * Returns FLAT [{date,startMin,endMin}] (invalid rows dropped)
 */
function normalizeExceptions(exceptions) {
  if (!Array.isArray(exceptions)) return [];
  const flat = [];
  for (const e of exceptions) {
    if (!e || !e.date) continue;

    // DB single window
    if (typeof e.startMin === 'number' && typeof e.endMin === 'number' && e.endMin > e.startMin) {
      flat.push({ date: e.date, startMin: e.startMin, endMin: e.endMin });
      continue;
    }
    // Friendly single window
    if (e.start || e.end) {
      const s = timeStrToMin(e.start), ee = timeStrToMin(e.end);
      if (s != null && ee != null && ee > s) flat.push({ date: e.date, startMin: s, endMin: ee });
      continue;
    }
    // Blocks array
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

// ===== PROFILE =====
exports.getProfile = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const profile = await TutorProfile.findOne({ userId: me }).lean();
  res.json({ profile: profile || undefined });
});

exports.upsertProfile = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const body = req.body || {};
  const allowed = [
    'headline','bio','subjects','languages','timezone',
    'hourlyRateMinor','currency','meetingProvider','meetingNote','isListed'
  ];
  const patch = {};
  for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k];

  let profile = await TutorProfile.findOne({ userId: me });
  if (!profile) profile = await TutorProfile.create({ userId: me, ...patch });
  else { Object.assign(profile, patch); await profile.save(); }

  res.json({ profile });
});

// ===== AVAILABILITY =====
exports.getAvailability = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const availability = await TutorAvailability.findOne({ tutorId: me }).lean();
  res.json({ availability: availability || undefined });
});

exports.upsertAvailability = asyncH(async (req, res) => {
  const me = req.auth.userId;
  const body = req.body || {};

  // ALWAYS normalize before saving
  const weeklyNorm     = normalizeWeekly(body.weekly || []);
  const exceptionsNorm = normalizeExceptions(body.exceptions || []);

  const patch = {
    ...(body.timezone && { timezone: body.timezone }),
    ...(typeof body.slotSizeMin === 'number' && { slotSizeMin: Math.max(15, body.slotSizeMin) }),
    ...(typeof body.bufferMin   === 'number' && { bufferMin: Math.max(0, body.bufferMin) }),
    weekly: weeklyNorm,            // <- minutes-based
    exceptions: exceptionsNorm,    // <- minutes-based
  };

  let availability = await TutorAvailability.findOne({ tutorId: me });
  if (!availability) availability = await TutorAvailability.create({ tutorId: me, ...patch });
  else { Object.assign(availability, patch); await availability.save(); }

  res.json({ availability: availability.toObject() });
});
