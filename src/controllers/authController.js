// const { OAuth2Client } = require('google-auth-library');
// const { z } = require('zod');
// const crypto = require('crypto');
// const User = require('../models/User');
// const Session = require('../models/Session');
// const { hashPassword, verifyPassword } = require('../utils/password.js');
// const { signAccessToken, signRefreshToken, verifyRefreshToken, hash } = require('../utils/token.js');


// const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
// const GoogleSignInBody = z.object({ idToken: z.string().min(10) });

// // tiny helper for jti
// function newJti() {
//   return (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
// }

// exports.googleSignIn = async (req, res, next) => {
//   try {
//     const { idToken } = GoogleSignInBody.parse(req.body);
//     const refreshCookieOpts = {
//       httpOnly: true,
//       secure: true,
//       sameSite: 'none',
//       path: '/auth',
//       maxAge: 1000 * Number(process.env.JWT_REFRESH_TTL || 2592000),
//     };

//     // 1) Verify the Google ID token
//     const ticket = await googleClient.verifyIdToken({
//       idToken,
//       audience: process.env.GOOGLE_CLIENT_ID
//     });
//     const p = ticket.getPayload(); // { sub, email, name, picture, email_verified, ... }
//     if (!p?.email) return res.status(400).json({ code: 'NO_EMAIL', message: 'Google did not return an email' });

//     // 2) Upsert/link user (by google.sub, or link by email)
//     let user = await User.findOne({ 'google.sub': p.sub });
//     if (!user) {
//       user = await User.findOne({ email: p.email });
//       if (user) {
//         user.google = { sub: p.sub, picture: p.picture || '' };
//         if (p.email_verified && !user.emailVerifiedAt) user.emailVerifiedAt = new Date();
//         if (!user.avatar && p.picture) user.avatar = p.picture;
//         await user.save();
//       } else {
//         user = await User.create({
//           name: p.name || p.email.split('@')[0],
//           email: p.email.toLowerCase(),
//           google: { sub: p.sub, picture: p.picture || '' },
//           avatar: p.picture || '',
//           emailVerifiedAt: p.email_verified ? new Date() : undefined,
//           role: 'student'
//         });
//       }
//     }

//     // 3) Issue tokens + session
//     const jti = newJti();
//     const accessToken = signAccessToken({ sub: user._id.toString(), role: user.role });
//     const refreshToken = signRefreshToken({ sub: user._id.toString() }, jti);

//     await Session.create({
//       userId: user._id,
//       jti,
//       refreshHash: hash(refreshToken),
//       userAgent: req.get('user-agent') || '',
//       ip: req.ip || req.headers['x-forwarded-for'] || '',
//       expiresAt: new Date(Date.now() + 1000 * Number(process.env.JWT_REFRESH_TTL || 2592000))
//     });

//     // set HttpOnly refresh cookie
//     res.cookie('rt', refreshToken,refreshCookieOpts)

//     user.lastLoginAt = new Date();
//     await user.save();

//     return res.status(200).json({
//       accessToken,
//       user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar }
//     });
//   } catch (err) {
//     next(err);
//   }
// };

// exports.refresh = async (req, res, next) => {
//   try {
//     const token = req.cookies?.rt;
//     if (!token) return res.status(401).json({ code: 'NO_REFRESH', message: 'Missing refresh token' });

//     const decoded = verifyRefreshToken(token); // throws if invalid/expired

//     const session = await Session.findOne({
//       jti: decoded.jti,
//       userId: decoded.sub,
//       revokedAt: { $exists: false }
//     });
//     if (!session) return res.status(401).json({ code: 'SESSION_NOT_FOUND', message: 'Invalid session' });
//     if (session.refreshHash !== hash(token)) {
//       return res.status(401).json({ code: 'TOKEN_MISMATCH', message: 'Refresh token mismatch' });
//     }
//     if (session.expiresAt <= new Date()) {
//       return res.status(401).json({ code: 'EXPIRED', message: 'Session expired' });
//     }

//     const user = await User.findById(decoded.sub).select('_id email role');
//     if (!user) return res.status(401).json({ code: 'USER_NOT_FOUND', message: 'User not found' });

//     const accessToken = signAccessToken({ sub: user._id.toString(), role: user.role });

//     return res.status(200).json({ accessToken });
//   } catch (err) {
//     return next(err);
//   }
// };
  
//   exports.logout = async (req, res, next) => {
//     try {
//       const token = req.cookies?.rt;
//       if (token) {
//         try {
//           const decoded = verifyRefreshToken(token);
//           await Session.findOneAndUpdate({ jti: decoded.jti }, { revokedAt: new Date() });
//         } catch (_) {
//           // ignore bad/expired refresh tokens on logout
//         }
//       }
//       const refreshCookieOpts = {
//         httpOnly: true,
//         secure: true,
//         sameSite: 'none',
//         path: '/auth',
//         maxAge: 1000 * Number(process.env.JWT_REFRESH_TTL || 2592000),
//       };

//       res.clearCookie('rt',{...refreshCookieOpts} ,{ path: '/auth' });
//       return res.status(204).end();
//     } catch (err) {
//       return next(err);
//     }
//   };

//   async function issueSessionAndCookies(user, req, res) {
//     const jti = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
//     const accessToken = signAccessToken({ sub: user._id.toString(), role: user.role });
//     const refreshToken = signRefreshToken({ sub: user._id.toString() }, jti);
  
//     await Session.create({
//       userId: user._id,
//       jti,
//       refreshHash: hash(refreshToken),
//       userAgent: req.get('user-agent') || '',
//       ip: req.ip || req.headers['x-forwarded-for'] || '',
//       expiresAt: new Date(Date.now() + 1000 * Number(process.env.JWT_REFRESH_TTL || 2592000))
//     });

//     const refreshCookieOpts = {
//       httpOnly: true,
//       secure: true,
//       sameSite: 'none',
//       path: '/auth',
//       maxAge: 1000 * Number(process.env.JWT_REFRESH_TTL || 2592000),
//     };
  
//     res.cookie('rt', refreshToken, refreshCookieOpts);
  
//     return accessToken;
//   }
  
//   const RegisterBody = z.object({
//     name: z.string().min(1),
//     email: z.string().email(),
//     password: z.string().min(8)
//   });
  
//   exports.register = async (req, res, next) => {
//     try {
//       const { name, email, password } = RegisterBody.parse(req.body);
//       const emailLc = email.toLowerCase();
  
//       // Does a user already exist?
//       let existing = await User.findOne({ email: emailLc }).select('+passwordHash');
//       if (existing) {
//         // case: google-only account wants to add a password (link password)
//         if (!existing.passwordHash) {
//           existing.passwordHash = await hashPassword(password);
//           if (!existing.name) existing.name = name;
//           if (!existing.avatar) existing.avatar = '';
//           await existing.save();
  
//           const accessToken = await issueSessionAndCookies(existing, req, res);
//           existing.lastLoginAt = new Date(); await existing.save();
//           return res.status(200).json({
//             accessToken,
//             user: { id: existing._id, name: existing.name, email: existing.email, role: existing.role, avatar: existing.avatar }
//           });
//         }
//         // otherwise email is taken
//         return res.status(409).json({ code: 'EMAIL_IN_USE', message: 'Email already registered.' });
//       }
  
//       // Create brand new password account
//       const passwordHash = await hashPassword(password);
//       const user = await User.create({
//         name,
//         email: emailLc,
//         passwordHash,
//         role: 'student',
//         // for password signups, emailVerifiedAt remains null until you add email verification
//       });
  
//       const accessToken = await issueSessionAndCookies(user, req, res);
//       user.lastLoginAt = new Date(); await user.save();
  
//       return res.status(201).json({
//         accessToken,
//         user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar }
//       });
//     } catch (err) {
//       next(err);
//     }
//   };
  
//   const LoginBody = z.object({
//     email: z.string().email(),
//     password: z.string().min(8)
//   });
  
//   exports.login = async (req, res, next) => {
//     try {
//       const { email, password } = LoginBody.parse(req.body);
//       const emailLc = email.toLowerCase();
  
//       // need passwordHash for comparison
//       const user = await User.findOne({ email: emailLc }).select('+passwordHash');
//       if (!user) {
//         return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
//       }
  
//       // if this is a Google-only account (no password set)
//       if (!user.passwordHash) {
//         return res.status(400).json({ code: 'GOOGLE_ONLY', message: 'Use Google sign-in for this account.' });
//       }
  
//       const ok = await verifyPassword(user.passwordHash, password);
//       if (!ok) {
//         return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
//       }
  
//       const accessToken = await issueSessionAndCookies(user, req, res);
//       user.lastLoginAt = new Date(); await user.save();
  
//       return res.status(200).json({
//         accessToken,
//         user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar }
//       });
//     } catch (err) {
//       next(err);
//     }
//   };

//   exports.me = async (req, res, next) => {
//     try {
//       const User = require('../models/User');
//       const userId = req.user?.id || req.auth?.userId;   // ← tolerant to both
//       if (!userId) return res.status(401).json({ code: 'NO_AUTH', message: 'Not authenticated' });
  
//       const user = await User.findById(userId);
//       if (!user) return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found' });
  
//       return res.status(200).json({
//         user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar }
//       });
//     } catch (err) {
//       next(err);
//     }
//   };
  

// controllers/auth.controller.js
const { OAuth2Client } = require('google-auth-library');
const { z } = require('zod');
const crypto = require('crypto');
const User = require('../models/User');
const Session = require('../models/Session');
const { hashPassword, verifyPassword } = require('../utils/password.js');
const { signAccessToken, signRefreshToken, verifyRefreshToken, hash } = require('../utils/token.js');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ----- helpers -----
const GoogleSignInBody = z.object({ idToken: z.string().min(10) });

function newJti() {
  return (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
}

// IMPORTANT: cookie options must match when setting and clearing
function getRefreshCookieOpts() {
  return {
    httpOnly: true,
    secure: true,        // REQUIRED in production (HTTPS)
    sameSite: 'none',    // REQUIRED for cross-site after Stripe redirect / iOS
    path: '/auth',       // cookie sent to /auth/* (refresh, logout, etc.)
    // domain: '.yourdomain.com', // uncomment if FE/BE on subdomains
    maxAge: 1000 * Number(process.env.JWT_REFRESH_TTL || 2592000), // seconds -> ms
  };
}

function setRefreshCookie(res, refreshToken) {
  res.cookie('rt', refreshToken, getRefreshCookieOpts());
}

// Create a session, set cookie, and return accessToken
async function issueSessionAndCookies(user, req, res) {
  const jti = newJti();
  const accessToken = signAccessToken({ sub: user._id.toString(), role: user.role });
  const refreshToken = signRefreshToken({ sub: user._id.toString() }, jti);

  await Session.create({
    userId: user._id,
    jti,
    refreshHash: hash(refreshToken),
    userAgent: req.get('user-agent') || '',
    ip: req.ip || req.headers['x-forwarded-for'] || '',
    expiresAt: new Date(Date.now() + 1000 * Number(process.env.JWT_REFRESH_TTL || 2592000)),
  });

  setRefreshCookie(res, refreshToken);
  return accessToken;
}

// ----- Controllers -----

exports.googleSignIn = async (req, res, next) => {
  try {
    const { idToken } = GoogleSignInBody.parse(req.body);

    // 1) Verify Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const p = ticket.getPayload(); // { sub, email, name, picture, email_verified, ... }
    if (!p?.email) {
      return res.status(400).json({ code: 'NO_EMAIL', message: 'Google did not return an email' });
    }

    // 2) Upsert/link user
    let user = await User.findOne({ 'google.sub': p.sub });
    if (!user) {
      user = await User.findOne({ email: p.email });
      if (user) {
        user.google = { sub: p.sub, picture: p.picture || '' };
        if (p.email_verified && !user.emailVerifiedAt) user.emailVerifiedAt = new Date();
        if (!user.avatar && p.picture) user.avatar = p.picture;
        await user.save();
      } else {
        user = await User.create({
          name: p.name || p.email.split('@')[0],
          email: p.email.toLowerCase(),
          google: { sub: p.sub, picture: p.picture || '' },
          avatar: p.picture || '',
          emailVerifiedAt: p.email_verified ? new Date() : undefined,
          role: 'student',
        });
      }
    }

    // 3) Issue tokens + session
    const accessToken = await issueSessionAndCookies(user, req, res);
    user.lastLoginAt = new Date(); await user.save();

    return res.status(200).json({
      accessToken,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    });
  } catch (err) {
    next(err);
  }
};

exports.refresh = async (req, res, next) => {
  try {
    const token = req.cookies?.rt;
    if (!token) return res.status(401).json({ code: 'NO_REFRESH', message: 'Missing refresh token' });

    const decoded = verifyRefreshToken(token); // throws if invalid/expired

    const session = await Session.findOne({
      jti: decoded.jti,
      userId: decoded.sub,
      revokedAt: { $exists: false },
    });
    if (!session) return res.status(401).json({ code: 'SESSION_NOT_FOUND', message: 'Invalid session' });
    if (session.refreshHash !== hash(token)) {
      return res.status(401).json({ code: 'TOKEN_MISMATCH', message: 'Refresh token mismatch' });
    }
    if (session.expiresAt <= new Date()) {
      return res.status(401).json({ code: 'EXPIRED', message: 'Session expired' });
    }

    const user = await User.findById(decoded.sub).select('_id email role');
    if (!user) return res.status(401).json({ code: 'USER_NOT_FOUND', message: 'User not found' });

    // Access token refresh (keep same session; simple, safe)
    const accessToken = signAccessToken({ sub: user._id.toString(), role: user.role });

    // (Optional hardening) rotate refresh on each refresh call:
    // const newJti = newJti();
    // const newRefresh = signRefreshToken({ sub: user._id.toString() }, newJti);
    // await Session.create({ ...new session with newJti ... });
    // await Session.findByIdAndUpdate(session._id, { revokedAt: new Date() });
    // setRefreshCookie(res, newRefresh);

    return res.status(200).json({ accessToken });
  } catch (err) {
    return next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const token = req.cookies?.rt;
    if (token) {
      try {
        const decoded = verifyRefreshToken(token);
        await Session.findOneAndUpdate({ jti: decoded.jti }, { revokedAt: new Date() });
      } catch (_) {
        // ignore bad/expired refresh tokens on logout
      }
    }

    // CLEAR cookie — options must match (path/samesite/secure/httpOnly)
    res.clearCookie('rt', getRefreshCookieOpts());
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
};

const RegisterBody = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = RegisterBody.parse(req.body);
    const emailLc = email.toLowerCase();

    // Does a user already exist?
    let existing = await User.findOne({ email: emailLc }).select('+passwordHash');
    if (existing) {
      // Google-only account wants to add a password
      if (!existing.passwordHash) {
        existing.passwordHash = await hashPassword(password);
        if (!existing.name) existing.name = name;
        if (!existing.avatar) existing.avatar = '';
        await existing.save();

        const accessToken = await issueSessionAndCookies(existing, req, res);
        existing.lastLoginAt = new Date(); await existing.save();
        return res.status(200).json({
          accessToken,
          user: { id: existing._id, name: existing.name, email: existing.email, role: existing.role, avatar: existing.avatar },
        });
      }
      return res.status(409).json({ code: 'EMAIL_IN_USE', message: 'Email already registered.' });
    }

    // Create brand new password account
    const passwordHash = await hashPassword(password);
    const user = await User.create({
      name,
      email: emailLc,
      passwordHash,
      role: 'student',
      // emailVerifiedAt remains null until you add email verification
    });

    const accessToken = await issueSessionAndCookies(user, req, res);
    user.lastLoginAt = new Date(); await user.save();

    return res.status(201).json({
      accessToken,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    });
  } catch (err) {
    next(err);
  }
};

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

exports.login = async (req, res, next) => {
  try {
    const { email, password } = LoginBody.parse(req.body);
    const emailLc = email.toLowerCase();

    // need passwordHash for comparison
    const user = await User.findOne({ email: emailLc }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
    }

    // Google-only account (no password set)
    if (!user.passwordHash) {
      return res.status(400).json({ code: 'GOOGLE_ONLY', message: 'Use Google sign-in for this account.' });
    }

    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) {
      return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
    }

    const accessToken = await issueSessionAndCookies(user, req, res);
    user.lastLoginAt = new Date(); await user.save();

    return res.status(200).json({
      accessToken,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    });
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.auth?.userId;   // tolerant to either middleware
    if (!userId) return res.status(401).json({ code: 'NO_AUTH', message: 'Not authenticated' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found' });

    return res.status(200).json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    });
  } catch (err) {
    next(err);
  }
};
