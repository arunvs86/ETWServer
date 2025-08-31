const argon2 = require('argon2');

// strong defaults (argon2id)
const ARGON_OPS = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16,   // 64 MB
  timeCost: 3,
  parallelism: 1
};

async function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  return argon2.hash(plain, ARGON_OPS);
}

async function verifyPassword(hash, plain) {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
