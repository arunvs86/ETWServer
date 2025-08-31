const { Types } = require('mongoose');
const Resource = require('../models/Resource');
const ResourceItem = require('../models/ResourceItem');

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const isObjId = (v) => Types.ObjectId.isValid(v);
const CURRENCIES = ['GBP','USD','EUR'];

function normalizeBasics(payload = {}) {
  const out = {};
  if (payload.title != null) out.title = String(payload.title).trim();
  if (payload.description != null) out.description = String(payload.description);
  if (payload.category != null) out.category = String(payload.category);
  if (payload.thumbnail != null) out.thumbnail = String(payload.thumbnail);
  return out;
}
function toMinor(amountMajor) {
  if (amountMajor == null) return undefined;
  const n = Number(amountMajor);
  if (Number.isNaN(n)) return undefined;
  return Math.max(0, Math.round(n * 100));
}
async function ensureOwned(resourceId, instructorId) {
  if (!isObjId(resourceId)) throw httpError(400, 'Invalid resource id');
  const doc = await Resource.findById(resourceId);
  if (!doc) throw httpError(404, 'Resource not found');
  if (!instructorId || String(doc.instructorId) !== String(instructorId)) {
    throw httpError(403, 'Not allowed');
  }
  return doc;
}

/* ---------- Shell ---------- */
exports.createDraft = async ({ instructorId, payload }) => {
  if (!instructorId) throw httpError(401, 'Auth required');

  const basics = normalizeBasics(payload);
  if (!basics.title) throw httpError(400, 'Title is required');

  let pricing;
  if (payload.amountMinor != null || payload.amountMajor != null || payload.currency != null || payload.includedInMembership != null) {
    const amountMinor = payload.amountMinor != null ? Math.max(0, Math.round(Number(payload.amountMinor) || 0)) : toMinor(payload.amountMajor ?? 0);
    const currency = CURRENCIES.includes(payload.currency) ? payload.currency : 'GBP';
    pricing = {
      amountMinor: amountMinor ?? 0,
      currency,
      isFree: true, // recalculated in pre-validate
      includedInMembership: payload.includedInMembership != null ? !!payload.includedInMembership : true,
    };
  }

  const doc = await Resource.create({
    ...basics,
    instructorId,
    status: 'draft',
    publishedAt: null,
    archivedAt: null,
    ...(pricing ? { pricing } : {}),
  });

  return { resource: {
    id: doc._id,
    title: doc.title,
    slug: doc.slug,
    description: doc.description,
    category: doc.category,
    thumbnail: doc.thumbnail,
    pricing: doc.pricing,
    status: doc.status,
    publishedAt: doc.publishedAt,
    updatedAt: doc.updatedAt,
  }};
};

exports.updateBasics = async ({ instructorId, resourceId, payload }) => {
  const doc = await ensureOwned(resourceId, instructorId);
  if (doc.status === 'archived') throw httpError(400, 'Cannot edit an archived resource');

  Object.assign(doc, normalizeBasics(payload));
  await doc.save();

  return { resource: {
    id: doc._id,
    title: doc.title,
    slug: doc.slug,
    description: doc.description,
    category: doc.category,
    thumbnail: doc.thumbnail,
    pricing: doc.pricing,
    status: doc.status,
    publishedAt: doc.publishedAt,
    updatedAt: doc.updatedAt,
  }};
};

exports.updatePricing = async ({ instructorId, resourceId, payload }) => {
  const doc = await ensureOwned(resourceId, instructorId);
  if (doc.status === 'archived') throw httpError(400, 'Cannot edit an archived resource');

  let amountMinor;
  if (payload.amountMinor != null) {
    const n = Number(payload.amountMinor);
    if (Number.isNaN(n) || n < 0) throw httpError(400, 'amountMinor must be >= 0');
    amountMinor = Math.round(n);
  } else {
    amountMinor = toMinor(payload.amountMajor ?? 0);
  }
  const currency = payload.currency && CURRENCIES.includes(payload.currency)
    ? payload.currency
    : (doc.pricing?.currency || 'GBP');

  const includedInMembership = payload.includedInMembership != null
    ? !!payload.includedInMembership
    : (doc.pricing?.includedInMembership ?? true);

  doc.pricing = {
    amountMinor,
    currency,
    isFree: doc.pricing?.isFree, // recalculated in pre-validate
    includedInMembership,
  };

  await doc.save();
  return { resource: { id: doc._id, pricing: doc.pricing, updatedAt: doc.updatedAt } };
};

exports.publish = async ({ instructorId, resourceId }) => {
  const doc = await ensureOwned(resourceId, instructorId);

  if (doc.status === 'archived') {
    doc.status = 'draft';
    doc.archivedAt = null;
  }

  if (!doc.title) throw httpError(400, 'Title required');
  if (!doc.slug) throw httpError(400, 'Slug required');

  const itemCount = await ResourceItem.countDocuments({ resourceId: doc._id });
  if (itemCount < 1) throw httpError(400, 'Add at least one item before publishing');

  // Ensure pricing exists
  if (!doc.pricing || doc.pricing.currency == null) {
    doc.pricing = {
      amountMinor: doc.pricing?.amountMinor ?? 0,
      currency: doc.pricing?.currency ?? 'GBP',
      isFree: doc.pricing?.isFree,
      includedInMembership: doc.pricing?.includedInMembership ?? true,
    };
  }

  doc.status = 'published';
  doc.publishedAt = new Date();
  await doc.save();

  return { ok: true, resource: { id: doc._id, slug: doc.slug, status: doc.status, publishedAt: doc.publishedAt } };
};

exports.unpublish = async ({ instructorId, resourceId }) => {
  const doc = await ensureOwned(resourceId, instructorId);
  if (doc.status === 'archived') throw httpError(400, 'Cannot unpublish an archived resource');
  doc.status = 'draft';
  doc.publishedAt = null;
  await doc.save();
  return { ok: true, resource: { id: doc._id, status: doc.status, publishedAt: doc.publishedAt } };
};

exports.archive = async ({ instructorId, resourceId }) => {
  const doc = await ensureOwned(resourceId, instructorId);
  doc.status = 'archived';
  doc.archivedAt = new Date();
  doc.publishedAt = null;
  await doc.save();
  return { ok: true, resource: { id: doc._id, status: doc.status, archivedAt: doc.archivedAt } };
};

exports.restore = async ({ instructorId, resourceId }) => {
  const doc = await ensureOwned(resourceId, instructorId);
  doc.status = 'draft';
  doc.archivedAt = null;
  await doc.save();
  return { ok: true, resource: { id: doc._id, status: doc.status } };
};

exports.destroy = async ({ instructorId, resourceId }) => {
  const doc = await ensureOwned(resourceId, instructorId);
  if (doc.status !== 'draft') throw httpError(400, 'Only draft resources can be deleted');

  await ResourceItem.deleteMany({ resourceId });
  await doc.deleteOne();
  return { deleted: true };
};

exports.listMine = async ({ instructorId, status, q, page = 1, limit = 12 }) => {
  if (!instructorId) throw httpError(401, 'Auth required');
  if (!isObjId(instructorId)) throw httpError(400, 'Invalid instructor id');

  page = Math.max(1, Number(page) || 1);
  limit = Math.min(50, Math.max(1, Number(limit) || 12));
  const skip = (page - 1) * limit;

  const query = { instructorId: new Types.ObjectId(instructorId) };
  if (status && ['draft','published','archived'].includes(String(status))) query.status = status;

  const hasQ = q && String(q).trim().length > 0;
  if (hasQ) query.$text = { $search: String(q).trim() };

  const projection = hasQ
    ? { score: { $meta: 'textScore' }, title: 1, slug: 1, status: 1, thumbnail: 1, category: 1, pricing: 1, updatedAt: 1, publishedAt: 1 }
    : { title: 1, slug: 1, status: 1, thumbnail: 1, category: 1, pricing: 1, updatedAt: 1, publishedAt: 1 };

  const sort = hasQ ? { score: { $meta: 'textScore' }, updatedAt: -1 } : { updatedAt: -1 };

  const [items, total] = await Promise.all([
    Resource.find(query, projection).sort(sort).skip(skip).limit(limit),
    Resource.countDocuments(query),
  ]);

  return {
    items: items.map((r) => ({
      id: r._id,
      title: r.title,
      slug: r.slug,
      status: r.status,
      thumbnail: r.thumbnail,
      category: r.category,
      pricing: r.pricing,
      updatedAt: r.updatedAt,
      publishedAt: r.publishedAt,
    })),
    meta: { page, limit, total, hasNextPage: page * limit < total },
  };
};

exports.getOne = async ({ instructorId, resourceId }) => {
  const doc = await ensureOwned(resourceId, instructorId);
  const items = await ResourceItem.find({ resourceId: doc._id }).sort({ order: 1, _id: 1 }).lean();

  return {
    resource: {
      id: doc._id,
      title: doc.title,
      slug: doc.slug,
      description: doc.description,
      category: doc.category,
      thumbnail: doc.thumbnail,
      pricing: doc.pricing,
      status: doc.status,
      publishedAt: doc.publishedAt,
      updatedAt: doc.updatedAt,
    },
    items: items.map((it) => ({
      id: it._id,
      title: it.title,
      type: it.type,
      order: it.order,
      link: it.type === 'link' ? it.link : undefined,
      file: it.type === 'file' ? it.file : undefined,
    })),
  };
};

/* ---------- Items ---------- */
exports.listItems = async ({ instructorId, resourceId }) => {
  await ensureOwned(resourceId, instructorId);
  const items = await ResourceItem.find({ resourceId }).sort({ order: 1, _id: 1 }).lean();
  return { items: items.map((it) => ({
    id: it._id,
    title: it.title,
    type: it.type,
    order: it.order,
    link: it.type === 'link' ? it.link : undefined,
    file: it.type === 'file' ? it.file : undefined,
  })) };
};

exports.createItem = async ({ instructorId, resourceId, payload }) => {
  await ensureOwned(resourceId, instructorId);
  const type = String(payload.type || '').trim();
  if (!['link','file'].includes(type)) throw httpError(400, 'type must be link|file');
  const title = String(payload.title || '').trim();
  if (!title) throw httpError(400, 'title is required');

  let doc;
  if (type === 'link') {
    const url = String(payload?.link?.url || '').trim();
    if (!url) throw httpError(400, 'link.url is required');
    doc = await ResourceItem.create({
      resourceId, title, type: 'link',
      order: Number(payload.order ?? 0) || 0,
      link: { url, note: String(payload?.link?.note || '') },
    });
  } else {
    const url = String(payload?.file?.url || '').trim();
    if (!url) throw httpError(400, 'file.url is required');
    doc = await ResourceItem.create({
      resourceId, title, type: 'file',
      order: Number(payload.order ?? 0) || 0,
      file: {
        url,
        fileName: String(payload?.file?.fileName || ''),
        size: Number(payload?.file?.size || 0) || 0,
        mimeType: String(payload?.file?.mimeType || ''),
      },
    });
  }

  return { item: {
    id: doc._id, title: doc.title, type: doc.type, order: doc.order,
    link: doc.type === 'link' ? doc.link : undefined,
    file: doc.type === 'file' ? doc.file : undefined,
  }};
};

exports.updateItem = async ({ instructorId, resourceId, itemId, payload }) => {
  await ensureOwned(resourceId, instructorId);
  if (!isObjId(itemId)) throw httpError(400, 'Invalid item id');

  const it = await ResourceItem.findOne({ _id: itemId, resourceId });
  if (!it) throw httpError(404, 'Item not found');

  if (payload.title != null) it.title = String(payload.title).trim() || it.title;
  if (payload.order != null) it.order = Number(payload.order) || 0;

  const nextType = payload.type && ['link','file'].includes(String(payload.type)) ? String(payload.type) : it.type;
  it.type = nextType;

  if (it.type === 'link') {
    if (!it.link) it.link = { url: '', note: '' };
    if (payload.link?.url != null) it.link.url = String(payload.link.url).trim();
    if (payload.link?.note != null) it.link.note = String(payload.link.note);
    it.file = undefined;
    if (!it.link.url) throw httpError(400, 'link.url is required');
  } else {
    if (!it.file) it.file = { url: '', fileName: '', size: 0, mimeType: '' };
    if (payload.file?.url != null) it.file.url = String(payload.file.url).trim();
    if (payload.file?.fileName != null) it.file.fileName = String(payload.file.fileName);
    if (payload.file?.size != null) it.file.size = Number(payload.file.size) || 0;
    if (payload.file?.mimeType != null) it.file.mimeType = String(payload.file.mimeType);
    it.link = undefined;
    if (!it.file.url) throw httpError(400, 'file.url is required');
  }

  await it.save();
  return { item: {
    id: it._id, title: it.title, type: it.type, order: it.order,
    link: it.type === 'link' ? it.link : undefined,
    file: it.type === 'file' ? it.file : undefined,
  }};
};

exports.deleteItem = async ({ instructorId, resourceId, itemId }) => {
  await ensureOwned(resourceId, instructorId);
  if (!isObjId(itemId)) throw httpError(400, 'Invalid item id');
  await ResourceItem.deleteOne({ _id: itemId, resourceId });
  return { deleted: true };
};

exports.reorderItems = async ({ instructorId, resourceId, order }) => {
  await ensureOwned(resourceId, instructorId);
  if (!Array.isArray(order) || !order.length) throw httpError(400, 'order must be an array of itemIds');

  const items = await ResourceItem.find({ resourceId, _id: { $in: order } }).select('_id').lean();
  const allowed = new Set(items.map(i => String(i._id)));
  const ops = [];
  order.forEach((id, idx) => {
    if (allowed.has(String(id))) ops.push(ResourceItem.updateOne({ _id: id }, { $set: { order: idx } }));
  });
  await Promise.all(ops);
  return { ok: true };
};
