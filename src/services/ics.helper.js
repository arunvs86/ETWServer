// src/services/ics.helper.js
const { createEvent } = require('ics');

function toUtcParts(dateLike) {
  const d = new Date(dateLike);
  return [
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,   // 1-12
    d.getUTCDate(),        // 1-31
    d.getUTCHours(),       // 0-23
    d.getUTCMinutes(),     // 0-59
  ];
}

/**
 * Builds a single .ics attachment for a live session.
 * We encode times in UTC for portability and mention the session's timezone in the description.
 */
function createLiveIcsAttachment({ live, joinUrl }) {
  if (!live?.startAt) return null;

  const title = live.title || 'Live Session';
  const descriptionLines = [
    live.description || '',
    '',
    `Join: ${joinUrl || ''}`,
    live.timezone ? `Timezone: ${live.timezone}` : '',
    live._id ? `Session page: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/live/${live._id}` : '',
  ].filter(Boolean);

  const event = {
    title,
    description: descriptionLines.join('\n'),
    start: toUtcParts(live.startAt),
    end: live.endAt ? toUtcParts(live.endAt) : undefined,
    startInputType: 'utc',
    endInputType: 'utc',
    status: 'CONFIRMED',
    url: joinUrl,
    calName: 'EducateTheWorld Live Sessions',
    productId: 'educatetheworld.app',
    organizer: live.hostEmail ? { name: live.hostName || 'Host', email: live.hostEmail } : undefined,
  };

  const { error, value } = createEvent(event);
  if (error) {
    console.error('[ICS] createEvent failed:', error);
    return null;
  }

  // Simple filename
  const safe = String(title).replace(/[^\w\- ]+/g, '').trim() || 'event';
  return {
    filename: `${safe}.ics`,
    content: value,
    contentType: 'text/calendar; charset=UTF-8',
  };
}

module.exports = { createLiveIcsAttachment };
