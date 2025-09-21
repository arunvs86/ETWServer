// jobs/holdsCleanup.js
const TutoringSession = require('../models/TutoringSession');

function startHoldsCleanup({ intervalMs = 5  * 1000 } = {}) {
  async function tick() {
    try {
      const now = new Date();
      const res = await TutoringSession.updateMany(
        { status: { $in: ['hold','payment_pending'] }, holdExpiresAt: { $lt: now } },
        { $set: { status: 'cancelled' } }
      );
      if (res.modifiedCount) {
        console.log(`[holdsCleanup] expired -> cancelled: ${res.modifiedCount}`);
      }
    } catch (e) {
      console.error('[holdsCleanup] error', e.message);
    }
  }
  // run soon, then on interval
  setTimeout(tick, 5_000);
  return setInterval(tick, intervalMs);
}

module.exports = { startHoldsCleanup };
