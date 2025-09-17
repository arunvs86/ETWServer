// services/slotEngine.js
const { DateTime, Interval } = require('luxon');

function isWinValid(w) {
  return Number.isFinite(w?.startMin) && Number.isFinite(w?.endMin) && w.endMin > w.startMin;
}

/**
 * Expand a tutor's weekly windows + exceptions into concrete slot start/end instants (UTC),
 * then remove any that collide with existing active sessions (with buffer).
 *
 * @param {Object} args
 * @param {string} args.timezone   IANA TZ of tutor
 * @param {Array}  args.weekly     [{ dow:'MON', startMin, endMin }]
 * @param {Array}  args.exceptions [{ date:'YYYY-MM-DD', startMin, endMin }]
 * @param {string} args.from       'YYYY-MM-DD' inclusive (in tutor's local TZ)
 * @param {string} args.to         'YYYY-MM-DD' inclusive (in tutor's local TZ)
 * @param {number} args.slotSizeMin
 * @param {number} args.durationMin
 * @param {number} args.bufferMin
 * @param {Array}  args.busy       // [{ startAt: Date, endAt: Date }]
 */
function generateSlots({
  timezone, weekly, exceptions, from, to,
  slotSizeMin, durationMin, bufferMin, busy
}) {
  const durMin = Math.max(15, Number(durationMin || slotSizeMin));
  const bufMin = Math.max(0, Number(bufferMin || 0));

  const startDate = DateTime.fromISO(from, { zone: timezone }).startOf('day');
  const endDate   = DateTime.fromISO(to,   { zone: timezone }).endOf('day');
  if (!startDate.isValid || !endDate.isValid || endDate < startDate) return [];

  // Strictly filter invalid windows
  const weeklyByDow = (Array.isArray(weekly) ? weekly : [])
    .filter(w => w && typeof w.dow === 'string' && isWinValid(w))
    .reduce((acc, w) => {
      (acc[w.dow] ||= []).push({ startMin: w.startMin, endMin: w.endMin });
      return acc;
    }, {});

  const exceptionsByDate = (Array.isArray(exceptions) ? exceptions : [])
    .filter(e => e && e.date && isWinValid(e))
    .reduce((acc, e) => {
      (acc[e.date] ||= []).push({ startMin: e.startMin, endMin: e.endMin });
      return acc;
    }, {});

  // Pre-build busy intervals in UTC, with buffer applied on both sides
  const busyIntervals = (busy || []).map(s => {
    const start = DateTime.fromJSDate(s.startAt).minus({ minutes: bufMin });
    const end   = DateTime.fromJSDate(s.endAt).plus({ minutes: bufMin });
    return Interval.fromDateTimes(start, end);
  });

  const results = [];
  for (let d = startDate; d <= endDate; d = d.plus({ days: 1 })) {
    const dow = d.toFormat('ccc').toUpperCase().slice(0,3); // MON..SUN
    const dateStr = d.toISODate();

    // Pick windows for this date:
    let windows = [];
    if (exceptionsByDate[dateStr]) {
      // Exceptions override weekly (can add or block by providing 0-1440)
      windows = exceptionsByDate[dateStr];
    } else {
      windows = weeklyByDow[dow] || [];
    }
    if (!windows.length) continue;

    for (const w of windows) {
      const windowStart = d.startOf('day').plus({ minutes: w.startMin });
      const windowEnd   = d.startOf('day').plus({ minutes: w.endMin });

      // Step through the window to create candidate slots
      for (let slotStart = windowStart; slotStart.plus({ minutes: durMin }) <= windowEnd; slotStart = slotStart.plus({ minutes: slotSizeMin })) {
        const slotEnd = slotStart.plus({ minutes: durMin });

        // Convert to UTC instants
        const slotStartUTC = slotStart.setZone('UTC');
        const slotEndUTC   = slotEnd.setZone('UTC');

        // Drop past slots (based on now in UTC)
        const nowUTC = DateTime.utc();
        if (slotEndUTC <= nowUTC) continue;

        // Collision check against busyIntervals
        const slotIvl = Interval.fromDateTimes(slotStartUTC, slotEndUTC);
        const collides = busyIntervals.some(b => b.overlaps(slotIvl));
        if (collides) continue;

        results.push({
          startAt: slotStartUTC.toISO(),
          endAt:   slotEndUTC.toISO(),
          local: {
            timezone,
            start: slotStart.toISO(),
            end:   slotEnd.toISO(),
            date:  dateStr
          }
        });
      }
    }
  }

  // Sort ascending by startAt UTC
  results.sort((a, b) => (a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : 0));
  return results;
}

module.exports = { generateSlots };
