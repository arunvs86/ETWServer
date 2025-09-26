// services/purchases.service.js
const { Types } = require('mongoose');

const Order = require('../models/Order');

// Try to require optional models without crashing if absent
function safeRequire(path) { try { return require(path); } catch { return null; } }

const Ebook = safeRequire('../models/Ebook');
const Resource = safeRequire('../models/Resource');
const Quiz = safeRequire('../models/Quiz');
const LiveSession = safeRequire('../models/LiveSession');
const Course = safeRequire('../models/Course'); // if you have it; otherwise null is fine

const DEFAULT_KINDS = ['ebook', 'resource', 'quiz', 'live-session', 'course'];

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }

function toObjectId(v) {
  if (!v) return null;
  try { return new Types.ObjectId(String(v)); } catch { return null; }
}

function normalizeDocForKind(kind, doc, fallback = {}) {
  if (!doc && !fallback) return null;

  // Prefer current (doc) fields; fallback to titleSnapshot if doc missing
  const title = (doc && doc.title) || fallback.titleSnapshot || 'Untitled';
  const slug = (doc && doc.slug) || undefined;
  const thumbnail = (doc && doc.thumbnail) || undefined;

  return { title, slug, thumbnail };
}

function buildDeepLink(kind, refId, slug) {
  switch (kind) {
    case 'ebook':        return slug ? `/ebooks/${slug}` : `/ebooks`;
    case 'resource':     return slug ? `/resources/${slug}` : `/resources`;
    case 'quiz':         return slug ? `/quizzes/${slug}` : `/quizzes`;
    case 'live-session': return `/live-sessions/${refId}`;
    case 'course':       return slug ? `/course/${slug}` : `/courses`;
    default:             return '/';
  }
}

/**
 * Read from Order (paid), dedupe by {kind, refId} keeping the latest purchase,
 * join to live models for current title/slug/thumb, then sort+paginate.
 */
async function listMyPurchases({ userId, kinds, q, page = 1, limit = 12 }) {
  if (!userId || !Types.ObjectId.isValid(userId)) {
    throw httpError(401, 'Login required');
  }
  const kindsFilter = (kinds && kinds.length ? kinds : DEFAULT_KINDS).filter(k => k !== 'membership');

  // Aggregate from Orders
  const pipeline = [
    { $match: { userId: toObjectId(userId), status: 'paid' } },
    { $unwind: '$items' },
    { $match: { 'items.kind': { $in: kindsFilter } } },
    {
      $group: {
        _id: { kind: '$items.kind', refId: '$items.refId' },
        purchasedAt: { $max: '$createdAt' }, // latest paid purchase
        // capture a "last known" price & title snapshot
        lastItem: { $last: '$items' },
      }
    },
    {
      $project: {
        _id: 0,
        kind: '$_id.kind',
        refId: '$_id.refId',
        purchasedAt: 1,
        amountMinor: { $ifNull: ['$lastItem.amountMinor', 0] },
        currency: { $ifNull: ['$lastItem.currency', 'GBP'] },
        titleSnapshot: { $ifNull: ['$lastItem.titleSnapshot', ''] },
      }
    }
  ];

  const rows = await Order.aggregate(pipeline);

  // Group refIds by kind to batch-fetch
  const buckets = new Map();
  for (const r of rows) {
    const k = r.kind;
    if (!buckets.has(k)) buckets.set(k, []);
    const arr = buckets.get(k);
    const id = toObjectId(r.refId);
    if (id) arr.push(id);
  }

  async function fetchMap(Model, ids) {
    if (!Model || !ids?.length) return new Map();
    const docs = await Model.find({ _id: { $in: ids } })
      .select('title slug thumbnail')
      .lean();
    const m = new Map();
    for (const d of docs) m.set(String(d._id), d);
    return m;
  }

  const [
    ebookMap,
    resMap,
    quizMap,
    liveMap,
    courseMap,
  ] = await Promise.all([
    fetchMap(Ebook, buckets.get('ebook')),
    fetchMap(Resource, buckets.get('resource')),
    fetchMap(Quiz, buckets.get('quiz')),
    fetchMap(LiveSession, buckets.get('live-session')),
    fetchMap(Course, buckets.get('course')),
  ]);

  const mapByKind = {
    'ebook': ebookMap,
    'resource': resMap,
    'quiz': quizMap,
    'live-session': liveMap,
    'course': courseMap,
  };

  // Build normalized items
  let items = rows.map(r => {
    const refIdStr = String(r.refId || '');
    const doc = mapByKind[r.kind]?.get(refIdStr) || null;
    const shaped = normalizeDocForKind(r.kind, doc, r);
    const deepLink = buildDeepLink(r.kind, refIdStr, shaped.slug);

    return {
      id: `${r.kind}:${refIdStr}`, // client-side convenience
      kind: r.kind,
      refId: refIdStr,
      slug: shaped.slug,
      title: shaped.title,
      thumbnail: shaped.thumbnail,
      purchasedAt: r.purchasedAt,
      priceMinor: Number(r.amountMinor || 0),
      currency: r.currency || 'GBP',
      deepLink,
    };
  });

  // Optional client-side q filter on current title
  if (q && q.trim()) {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    items = items.filter(x => rx.test(x.title || ''));
  }

  // Sort by purchasedAt desc
  items.sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt));

  // Paginate
  const total = items.length;
  const start = (page - 1) * limit;
  const slice = items.slice(start, start + limit);

  return {
    items: slice,
    meta: { page, limit, total, hasNextPage: page * limit < total },
  };
}

module.exports = { listMyPurchases };
