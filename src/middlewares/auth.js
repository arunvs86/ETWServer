// const jwt = require('jsonwebtoken');

// function authGuard(req, res, next) {
//   const header = req.get('authorization') || '';
//   const token = header.startsWith('Bearer ') ? header.slice(7) : null;
//   if (!token) return res.status(401).json({ code: 'NO_TOKEN', message: 'Missing Bearer token' });

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

//     // robust id extraction for any legacy/new token
//     const id = decoded.sub || decoded.userId || decoded.id || null;
//     if (!id) {
//       return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Invalid token payload' });
//     }

//     // IMPORTANT: do NOT default role; if it’s missing, we want to catch that
//     const role = decoded.role;

//     // Standardize on req.user, but keep req.auth for backward-compat
//     const u = { id, role, email: decoded.email, iat: decoded.iat, exp: decoded.exp };
//     req.user = u;
//     req.auth = { userId: id, role, iat: decoded.iat, exp: decoded.exp };

//     return next();
//   } catch {
//     return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Invalid or expired token' });
//   }
// }

// function requireRole(...roles) {
//   return (req, res, next) => {
//     const role = req.user?.role; // unified source
//     if (!req.user?.id) return res.status(401).json({ code: 'NO_AUTH', message: 'Not authenticated' });
//     if (!role)        return res.status(401).json({ code: 'NO_ROLE', message: 'Missing role claim' });
//     if (!roles.includes(role)) {
//       return res.status(403).json({ code: 'FORBIDDEN', message: 'Insufficient role' });
//     }
//     next();
//   };
// }

// module.exports = { authGuard, requireRole };


const jwt = require('jsonwebtoken');

function authGuard(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ code: 'NO_TOKEN', message: 'Missing Bearer token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    const id = decoded.sub || decoded.userId || decoded.id || null;
    if (!id) return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Invalid token payload' });

    const role = decoded.role;
    const u = { id, role, email: decoded.email, iat: decoded.iat, exp: decoded.exp };
    u._id = id; // <-- important: compat for code that expects _id

    req.user = u;
    req.auth = { userId: id, role, iat: decoded.iat, exp: decoded.exp };
    return next();
  } catch {
    return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Invalid or expired token' });
  }
}

/**
 * Optional auth: if a valid Bearer token exists, attach req.user; otherwise no-op.
 * Never sends 401 — perfect for "public" endpoints that benefit from user context.
 */
function attachUserIfPresent(req, _res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const id = decoded.sub || decoded.userId || decoded.id || null;
    if (!id) return next();
    const role = decoded.role;
    const u = { id, role, email: decoded.email, iat: decoded.iat, exp: decoded.exp };
    u._id = id; // keep parity with authGuard
    req.user = u;
    req.auth = { userId: id, role, iat: decoded.iat, exp: decoded.exp };
  } catch {
    // ignore bad tokens on optional auth
  }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!req.user?.id) return res.status(401).json({ code: 'NO_AUTH', message: 'Not authenticated' });
    if (!role)        return res.status(401).json({ code: 'NO_ROLE', message: 'Missing role claim' });
    if (!roles.includes(role)) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Insufficient role' });
    }
    next();
  };
}

function requireInstructorOrAdmin(req, res, next) {
  const role = req.user?.role;
  if (role === 'instructor' || role === 'admin') return next();
  return res.status(403).json({ error: 'Only instructors/admins allowed' });
}

module.exports = { authGuard, requireRole, attachUserIfPresent,requireInstructorOrAdmin };
