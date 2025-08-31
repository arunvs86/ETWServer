// ultra-simple slug: "UCAT Masterclass" -> "ucat-masterclass"
module.exports = function slugify(input = '') {
    return String(input)
      .toLowerCase()
      .trim()
      .replace(/['"]/g, '')           // remove quotes
      .replace(/[^a-z0-9]+/g, '-')    // non-alphanum -> dash
      .replace(/^-+|-+$/g, '');       // trim dashes
  };
  
const crypto = require('crypto');

function baseSlugify(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')   // non-alnum → dash
    .replace(/^-+|-+$/g, '')       // trim dashes
    .slice(0, 80);                  // keep slugs short-ish
}

function shortId(n = 6) {
  return crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

async function uniqueSlug(Model, title, fallback = 'quiz') {
  let base = baseSlugify(title);
  if (!base) base = baseSlugify(fallback);
  let slug = base || shortId();
  let tries = 0;

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await Model.exists({ slug });
    if (!exists) return slug;
    tries += 1;
    slug = `${base}-${shortId(4 + Math.min(tries, 6))}`;
  }
}

module.exports = { baseSlugify, shortId, uniqueSlug };
