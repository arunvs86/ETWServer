// models/TutorAvailability.js
const { Schema, model, Types } = require('mongoose');

/** ---------- Helpers (friendly -> DB minutes) ---------- */
const DOW_NUM_TO_TOKEN = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

function timeStrToMin(hhmm) {
  if (typeof hhmm !== 'string') return undefined;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return undefined;
  return h * 60 + min;
}

// Accepts weekly item as:
//   - { dow:'MON', startMin, endMin } (DB shape)
//   - { dow:0..6, start:'HH:mm', end:'HH:mm' } (friendly)
// Returns normalized DB shape or null if invalid
function normalizeWeeklyItem(w) {
  if (!w) return null;
  if (typeof w.dow === 'string' && typeof w.startMin === 'number' && typeof w.endMin === 'number' && w.endMin > w.startMin) {
    return { dow: w.dow, date: null, startMin: w.startMin, endMin: w.endMin };
  }
  const isNum = typeof w.dow === 'number' && w.dow >= 0 && w.dow <= 6;
  const s = timeStrToMin(w.start), e = timeStrToMin(w.end);
  if (!isNum || s == null || e == null || e <= s) return null;
  return { dow: DOW_NUM_TO_TOKEN[w.dow], date: null, startMin: s, endMin: e };
}

// Accepts exceptions as any of:
//   - { date:'YYYY-MM-DD', startMin, endMin } (DB)
//   - { date, start:'HH:mm', end:'HH:mm' } (friendly)
//   - { date, blocks:[ {start,end} | {startMin,endMin} ] } (friendly/DB)
// Returns flat array of { date, startMin, endMin }
function normalizeExceptionsArray(exceptions) {
  if (!Array.isArray(exceptions)) return [];
  const flat = [];
  for (const e of exceptions) {
    if (!e || !e.date) continue;

    // DB single
    if (typeof e.startMin === 'number' && typeof e.endMin === 'number' && e.endMin > e.startMin) {
      flat.push({ date: e.date, startMin: e.startMin, endMin: e.endMin });
      continue;
    }
    // Friendly single
    if (e.start || e.end) {
      const s = timeStrToMin(e.start), ee = timeStrToMin(e.end);
      if (s != null && ee != null && ee > s) flat.push({ date: e.date, startMin: s, endMin: ee });
      continue;
    }
    // Blocks
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

/** ---------- Sub-schema & main schema ---------- */
const WindowSchema = new Schema({
  // Recurring: use day-of-week; One-off: use date
  dow:      { type: String, enum: ['MON','TUE','WED','THU','FRI','SAT','SUN', null], default: null },
  date:     { type: String, default: null }, // "YYYY-MM-DD"

  // NOTE: we RELAX required here to avoid throwing before we normalize.
  startMin: { type: Number, min: 0, max: 1440 },
  endMin:   { type: Number, min: 1,  max: 1440 },
}, { _id: false });

const TutorAvailabilitySchema = new Schema({
  tutorId:   { type: Types.ObjectId, ref: 'User', required: true, index: true },
  timezone:  { type: String, default: 'Europe/London' },

  slotSizeMin: { type: Number, default: 60, min: 15, max: 240 },
  bufferMin:   { type: Number, default: 10, min: 0,  max: 60 },

  weekly:     { type: [WindowSchema], default: [] },
  exceptions: { type: [WindowSchema], default: [] }
}, { timestamps: true });

TutorAvailabilitySchema.index({ tutorId: 1 });

/** ---------- Normalize inbound data on ALL write paths ---------- */
function normalizeDocLike(obj) {
  if (!obj) return;

  // weekly
  if (Array.isArray(obj.weekly)) {
    obj.weekly = obj.weekly.map(normalizeWeeklyItem).filter(Boolean);
  }

  // exceptions
  if (Array.isArray(obj.exceptions)) {
    obj.exceptions = normalizeExceptionsArray(obj.exceptions).map(w => ({
      dow: null,
      date: w.date,
      startMin: w.startMin,
      endMin: w.endMin
    }));
  }
}

// Create/Save path
TutorAvailabilitySchema.pre('validate', function(next) {
  try {
    normalizeDocLike(this);
    next();
  } catch (err) { next(err); }
});
TutorAvailabilitySchema.pre('save', function(next) {
  try {
    normalizeDocLike(this);
    next();
  } catch (err) { next(err); }
});

// Update paths (findOneAndUpdate / updateOne / updateMany)
function normalizeUpdateObject(update) {
  if (!update) return update;
  const $set = update.$set || update;

  if (Array.isArray($set.weekly)) {
    $set.weekly = $set.weekly.map(normalizeWeeklyItem).filter(Boolean);
  }
  if (Array.isArray($set.exceptions)) {
    $set.exceptions = normalizeExceptionsArray($set.exceptions).map(w => ({
      dow: null, date: w.date, startMin: w.startMin, endMin: w.endMin
    }));
  }

  // Ensure we write through $set to cover replacement/mixed usage
  update.$set = $set;
  return update;
}

['findOneAndUpdate','updateOne','updateMany'].forEach(fn => {
  TutorAvailabilitySchema.pre(fn, function(next) {
    try {
      const u = this.getUpdate() || {};
      this.setUpdate(normalizeUpdateObject(u));
      next();
    } catch (err) { next(err); }
  });
});

module.exports = model('TutorAvailability', TutorAvailabilitySchema);
