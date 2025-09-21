const svc = require('../services/ebook.service');
const { attachUserIfPresent } = require('../middlewares/auth'); // only for parity in exports

function toInt(n, def, { min = 1, max = 50 } = {}) {
  const v = parseInt(n, 10);
  if (Number.isNaN(v)) return def;
  return Math.max(min, Math.min(max, v));
}

async function listEbooks(req, res, next) {
  try {
    const page  = toInt(req.query.page, 1, { min: 1, max: 1_000_000 });
    const limit = toInt(req.query.limit, 12, { min: 1, max: 50 });
    const out = await svc.listEbooks({
      q: (req.query.q || '').trim(),
      category: (req.query.category || '').trim(),
      sort: String(req.query.sort || 'newest'),
      page, limit,
    });
    return res.json(out);
  } catch (err) { next(err); }
}

async function getEbookBySlug(req, res, next) {
  try {
    const { slug } = req.params;
    const userId = req.user?.id || req.user?._id || null;
    const out = await svc.getPublicEbookBySlug({ slug, userId });
    if (!out) return res.status(404).json({ error: 'Ebook not found' });
    return res.json(out);
  } catch (err) {
    console.error('[EBOOK] getEbookBySlug failed:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}

module.exports = { listEbooks, getEbookBySlug };
