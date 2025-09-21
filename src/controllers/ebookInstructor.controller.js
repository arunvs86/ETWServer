const { Types } = require('mongoose');
const Ebook = require('../models/Ebook');              // assumes same fields as Resource
const EbookItem = require('../models/EbookItem');      // { ebookId, title, type:'link'|'file', link|file, order }
const { baseSlugify } = require('../utils/slugify');

function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
function toMinor(major) { const n = Number(major); return Number.isFinite(n) && n >= 0 ? Math.round(n*100) : 0; }
function isMine(doc, userId) { return String(doc.instructorId) === String(userId); }

// ------- create + read -------
exports.createDraft = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { title } = req.body || {};
    if (!title || !title.trim()) throw httpError(400, 'title required');

    const slug = baseSlugify(title);
    const doc = await Ebook.create({
      title: title.trim(),
      slug,
      instructorId: userId,
      status: 'draft',
      pricing: { amountMinor: 0, currency: 'GBP', includedInMembership: true },
    });

    return res.json({ id: String(doc._id) });
  } catch (e) { next(e); }
};

exports.getMine = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) throw httpError(400, 'bad id');

    const doc = await Ebook.findById(id).lean();
    if (!doc) throw httpError(404, 'not found');
    if (!isMine(doc, userId)) throw httpError(403, 'forbidden');

    return res.json({ resource: doc }); // keep shape identical to resources API
  } catch (e) { next(e); }
};

// ------- update basics/pricing -------
exports.updateBasics = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) throw httpError(400, 'bad id');

    const patch = {
      title: (req.body.title || '').trim(),
      description: req.body.description ?? '',
      category: (req.body.category || '').trim(),
      thumbnail: req.body.thumbnail || '',
    };

    const doc = await Ebook.findById(id);
    if (!doc) throw httpError(404, 'not found');
    if (!isMine(doc, userId)) throw httpError(403, 'forbidden');

    if (patch.title && patch.title !== doc.title) {
      doc.title = patch.title;
      if (!doc.slug || doc.status === 'draft') doc.slug = baseSlugify(patch.title);
    }
    doc.description = patch.description;
    doc.category = patch.category;
    doc.thumbnail = patch.thumbnail;

    await doc.save();
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

exports.updatePricing = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) throw httpError(400, 'bad id');

    const { amountMajor, currency, includedInMembership } = req.body || {};
    const doc = await Ebook.findById(id);
    if (!doc) throw httpError(404, 'not found');
    if (!isMine(doc, userId)) throw httpError(403, 'forbidden');

    doc.pricing = {
      amountMinor: toMinor(amountMajor),
      currency: (currency || 'GBP'),
      isFree: toMinor(amountMajor) === 0,
      includedInMembership: !!includedInMembership,
    };

    await doc.save();
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

// ------- lifecycle (except publish which you already wired) -------
exports.unpublish = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;
    const doc = await Ebook.findById(id);
    if (!doc) throw httpError(404, 'not found');
    if (!isMine(doc, userId)) throw httpError(403, 'forbidden');
    doc.status = 'draft'; doc.publishedAt = null;
    await doc.save();
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

exports.archive = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;
    const doc = await Ebook.findById(id);
    if (!doc) throw httpError(404, 'not found');
    if (!isMine(doc, userId)) throw httpError(403, 'forbidden');
    doc.status = 'archived'; doc.archivedAt = new Date();
    await doc.save();
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

exports.restore = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;
    const doc = await Ebook.findById(id);
    if (!doc) throw httpError(404, 'not found');
    if (!isMine(doc, userId)) throw httpError(403, 'forbidden');
    doc.status = 'draft'; doc.archivedAt = null;
    await doc.save();
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

exports.destroy = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;
    const doc = await Ebook.findById(id);
    if (!doc) throw httpError(404, 'not found');
    if (!isMine(doc, userId)) throw httpError(403, 'forbidden');
    await Ebook.deleteOne({ _id: id });
    await EbookItem.deleteMany({ ebookId: id });
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

// ------- items -------
exports.listItems = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;
    const doc = await Ebook.findById(id).select('_id instructorId').lean();
    if (!doc) throw httpError(404, 'not found');
    if (!isMine(doc, userId)) throw httpError(403, 'forbidden');

    const items = await EbookItem.find({ ebookId: id }).sort({ order: 1, _id: 1 }).lean();
    res.json(items.map(i => ({ ...i, id: i._id })));
  } catch (e) { next(e); }
};

exports.createItem = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;
    const { title, type, link, file } = req.body || {};
    if (!title || !type) throw httpError(400, 'title/type required');

    const doc = await Ebook.findById(id).select('_id instructorId').lean();
    if (!doc) throw httpError(404, 'not found');
    if (!isMine(doc, userId)) throw httpError(403, 'forbidden');

    const last = await EbookItem.findOne({ ebookId: id }).sort({ order: -1 }).select('order').lean();
    const order = (last?.order || 0) + 1;

    const created = await EbookItem.create({
      ebookId: id,
      title: title.trim(),
      type,
      link: type === 'link' ? link : undefined,
      file: type === 'file' ? file : undefined,
      order,
    });

    res.json({ id: String(created._id) });
  } catch (e) { next(e); }
};

exports.updateItem = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id, itemId } = req.params;
    const doc = await Ebook.findById(id).select('_id instructorId').lean();
    if (!doc) throw httpError(404, 'not found');
    if (!isMine(doc, userId)) throw httpError(403, 'forbidden');

    const patch = {};
    if (typeof req.body.title === 'string') patch.title = req.body.title.trim();
    if (req.body.type === 'link') { patch.type = 'link'; patch.link = req.body.link; patch.file = undefined; }
    if (req.body.type === 'file') { patch.type = 'file'; patch.file = req.body.file; patch.link = undefined; }

    await EbookItem.updateOne({ _id: itemId, ebookId: id }, { $set: patch });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

exports.deleteItem = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id, itemId } = req.params;
    const doc = await Ebook.findById(id).select('_id instructorId').lean();
    if (!doc) throw httpError(404, 'not found');
    if (!isMine(doc, userId)) throw httpError(403, 'forbidden');

    await EbookItem.deleteOne({ _id: itemId, ebookId: id });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

exports.reorderItems = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds)) throw httpError(400, 'orderedIds array required');

    const doc = await Ebook.findById(id).select('_id instructorId').lean();
    if (!doc) throw httpError(404, 'not found');
    if (!isMine(doc, userId)) throw httpError(403, 'forbidden');

    // write new order values
    let order = 1;
    for (const itemId of orderedIds) {
      await EbookItem.updateOne({ _id: itemId, ebookId: id }, { $set: { order } });
      order += 1;
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
};

// ADD: listMine (used by GET /instructor/ebooks)
exports.listMine = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const toInt = (n, d, { min = 1, max = 50 } = {}) => {
      const v = parseInt(n, 10); if (Number.isNaN(v)) return d;
      return Math.max(min, Math.min(max, v));
    };

    const page  = toInt(req.query.page, 1, { min: 1, max: 1_000_000 });
    const limit = toInt(req.query.limit, 12, { min: 1, max: 50 });
    const skip  = (page - 1) * limit;

    const q = String(req.query.q || '').trim();
    const status = req.query.status && ['draft','published','archived'].includes(req.query.status)
      ? req.query.status : undefined;

    const query = { instructorId: userId };
    if (status) query.status = status;
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ title: rx }, { description: rx }, { category: rx }];
    }

    const projection = 'title slug status category thumbnail pricing updatedAt publishedAt';
    const sort = { updatedAt: -1, _id: -1 };

    const [items, total] = await Promise.all([
      Ebook.find(query).select(projection).sort(sort).skip(skip).limit(limit).lean(),
      Ebook.countDocuments(query),
    ]);

    res.json({
      items: items.map(i => ({ ...i, id: i._id })),
      meta: { page, limit, total, hasNextPage: page * limit < total },
    });
  } catch (e) { next(e); }
};

// ADD: publish (used by POST /instructor/ebooks/:id/publish)
const Stripe = require('stripe');
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

exports.publish = async (req, res, next) => {
  try {

    console.log("COming here to ebook")
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) throw httpError(400, 'bad id');

    const doc = await Ebook.findById(id);
    if (!doc) throw httpError(404, 'not found');
    if (String(doc.instructorId) !== String(userId)) throw httpError(403, 'forbidden');

    // 1) Create/ensure Stripe product+price only if needed (and only if paid)
    let productId = doc.stripe?.productId || null;
    let priceId   = doc.stripe?.priceId || null;

    const isFree = !!doc.pricing?.isFree || (doc.pricing?.amountMinor || 0) === 0;
    const currency = (doc.pricing?.currency || 'GBP').toUpperCase();
    const amountMinor = Number(doc.pricing?.amountMinor || 0);

    if (!isFree && stripe) {
      // Create product if missing
      if (!productId) {
        const product = await stripe.products.create({
          name: doc.title,
          metadata: { ebookId: String(doc._id) }
        });
        productId = product.id;
      }

      // Create price if missing OR currency/amount changed
      let needNewPrice = !priceId;
      if (priceId) {
        try {
          const price = await stripe.prices.retrieve(priceId);
          const priceMismatch =
            price.unit_amount !== amountMinor || (price.currency || '').toUpperCase() !== currency;
          if (priceMismatch) needNewPrice = true;
        } catch {
          needNewPrice = true;
        }
      }

      if (needNewPrice) {
        const price = await stripe.prices.create({
          product: productId,
          unit_amount: amountMinor,
          currency,
        });
        priceId = price.id;
      }
    } else {
      // Free items don't need Stripe; clear any stale priceId if you prefer
      priceId = priceId || null;
      productId = productId || null;
    }

    // 2) Flip status to published (idempotent) + set publishedAt
    doc.status = 'published';
    doc.publishedAt = doc.publishedAt || new Date();
    // persist stripe refs if present
    if (!doc.stripe) doc.stripe = {};
    doc.stripe.productId = productId || undefined;
    doc.stripe.priceId   = priceId || undefined;

    await doc.save();

    return res.json({
      ok: true,
      ebookId: String(doc._id),
      status: doc.status,
      publishedAt: doc.publishedAt,
      stripe: { productId: doc.stripe.productId, priceId: doc.stripe.priceId },
    });
  } catch (e) { next(e); }
};
// ADD: alias so DELETE uses the name your router expects
exports.remove = exports.destroy;

