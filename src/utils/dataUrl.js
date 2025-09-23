// utils/dataUrl.js
function isDataUrl(str='') { return /^data:.*;base64,/.test(str); }
function parseDataUrl(s='') {
  const m = s.match(/^data:(.+);base64,(.*)$/); if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
}
module.exports = { isDataUrl, parseDataUrl };
