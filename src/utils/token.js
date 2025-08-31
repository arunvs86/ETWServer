const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: Number(process.env.JWT_ACCESS_TTL || 900) // seconds
  });
}

function signRefreshToken(payload, jti) {
  return jwt.sign({ ...payload, jti }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: Number(process.env.JWT_REFRESH_TTL || 2592000) // seconds
  });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

function hash(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

module.exports = { signAccessToken, signRefreshToken, verifyRefreshToken, hash };
