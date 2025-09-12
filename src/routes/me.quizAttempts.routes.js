// server/src/routes/me.quizAttempts.routes.js
const express = require('express');
const router = express.Router();

console.log('[me.quizAttempts.routes] file loaded');

router.get('/_ping', (req, res) => res.json({ ok: true, where: 'me.quizAttempts.routes /_ping' }));

// TEMP sanity: no auth yet — just to verify mount
router.get('/me/attempts', (req, res) => {
  console.log('[me.quizAttempts.routes] GET /me/attempts hit');
  res.json({ ok: true, items: [], meta: { page: 1, limit: 12, total: 0, hasNextPage: false } });
});

module.exports = router;
