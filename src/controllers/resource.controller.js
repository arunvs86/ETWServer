const { Types } = require('mongoose');

const Resource = require('../models/Resource');        // { title, slug, status, pricing, ... }
const ResourceItem = require('../models/ResourceItem'); // { resourceId, title, type, link|file, order }
const Membership = require('../models/Membership');     // existing model used in your app
// Optional dedicated access model; if you already store access elsewhere, swap it in:

const resourceService = require('../services/resource.service')
let ResourceAccess;
try { ResourceAccess = require('../models/ResourceAccess'); } catch { ResourceAccess = null; }

function toInt(n, def, { min = 1, max = 50 } = {}) {
  const v = parseInt(n, 10);
  if (Number.isNaN(v)) return def;
  return Math.max(min, Math.min(max, v));
}
function escapeRegExp(s) { return s ? s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''; }
function isMemberActive(mem) {
  if (!mem) return false;
  const now = new Date();
  return (mem.status === 'active' || mem.status === 'trialing') &&
         now >= mem.currentPeriodStart && now < mem.currentPeriodEnd;
}

async function listResources(req, res, next) {
  try {
    const page  = toInt(req.query.page, 1, { min: 1, max: 1_000_000 });
    const limit = toInt(req.query.limit, 12, { min: 1, max: 50 });
    const skip  = (page - 1) * limit;

    const q = (req.query.q || '').trim();
    const category = (req.query.category || '').trim();
    const sortKey = String(req.query.sort || 'newest');

    const query = { status: 'published' };
    if (q) {
      // If you’ve set a text index, you can use $text. Regex works universally:
      const rx = new RegExp(escapeRegExp(q), 'i');
      query.$or = [{ title: rx }, { description: rx }, { category: rx }];
    }
    if (category) query.category = category;

    const sort = (() => {
      switch (sortKey) {
        case 'newest': return { publishedAt: -1, _id: -1 };
        default:       return { publishedAt: -1, _id: -1 };
      }
    })();

    const projection =
      'title slug description category thumbnail pricing publishedAt updatedAt';

    const [items, total] = await Promise.all([
      Resource.find(query).select(projection).sort(sort).skip(skip).limit(limit).lean(),
      Resource.countDocuments(query),
    ]);

    return res.json({
      items,
      meta: { page, limit, total, hasNextPage: page * limit < total },
    });
  } catch (err) { next(err); }
}

async function userOwnsResource(userId, resource) {
  if (!userId) return false;

  // Membership unlocks if flagged and user is active
  const mem = await Membership.findOne({ userId }).lean();
  if (isMemberActive(mem) && resource?.pricing?.includedInMembership) return true;

  // Purchase / grant (optional)
  if (ResourceAccess) {
    const acc = await ResourceAccess.findOne({
      userId: new Types.ObjectId(userId),
      resourceId: resource._id,
      status: 'active',
    }).lean();
    if (acc && (!acc.expiresAt || acc.expiresAt > new Date())) return true;
  }

  return false;
}

async function getResourceBySlug(req, res, next) {
  try {
    const { slug } = req.params;
    const userId = req.user?.id || req.user?._id || null;
    const out = await resourceService.getPublicResourceBySlug({ slug, userId });
    if (!out) return res.status(404).json({ error: 'Resource not found' });
    return res.json(out);
  } catch (err) {
    console.error('[RESOURCE] getResourceBySlug failed:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}

module.exports = { listResources, getResourceBySlug };
