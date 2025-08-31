const { Types } = require('mongoose');
const LiveSessionAccess = require('../models/LiveSessionAccess');
const LiveSession = require('../models/LiveSession');

async function grantLiveSessionAfterPayment({ userId, liveSessionId, session }) {
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(liveSessionId)) return false;

  // make sure session exists (avoid dangling access)
  const exists = await LiveSession.findById(liveSessionId).select('_id').lean();
  if (!exists) return false;

  await LiveSessionAccess.updateOne(
    { userId, sessionId: liveSessionId },
    {
      $setOnInsert: { userId, sessionId: liveSessionId, source: 'purchase' },
      $set: { orderId: session?.payment_intent || session?.id }
    },
    { upsert: true }
  );
  return true;
}

module.exports = { grantLiveSessionAfterPayment };
