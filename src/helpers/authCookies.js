// // helpers/authCookies.js
// function setRefreshCookie(res, refreshToken) {
//     res.cookie('rt', refreshToken, {
//       httpOnly: true,
//       secure: true,        // REQUIRED in production (HTTPS)
//       sameSite: 'none',    // REQUIRED for cross-site usage after Stripe redirect
//       path: '/',           // allow /auth/refresh to read it
//       // domain: '.yourdomain.com', // if FE/BE are on subdomains (omit if same host)
//       maxAge: 60 * 24 * 60 * 60 * 1000, // 60 days
//     });
//   }
//   module.exports = { setRefreshCookie };
  

// helpers/authCookies.js
const PROD = process.env.NODE_ENV === 'production';

// In production (https on Render/AWS), use SameSite=None + Secure so the cookie
// is sent on cross-origin XHR. In local dev (http), browsers drop SameSite=None
// without Secure, so we use Lax to keep it working on http://localhost.
function refreshCookieOpts() {
  return {
    httpOnly: true,
    secure: PROD,                    // true in https prod, false in local dev
    sameSite: PROD ? 'none' : 'lax', // 'none' for cross-origin in prod; 'lax' for localhost
    path: '/',                       // <-- IMPORTANT: consistent everywhere
    // domain: '.educatetheworld.co.uk', // set this ONLY after you move to that domain
    maxAge: 60 * 24 * 60 * 60 * 1000, // 60 days
  };
}

function setRefreshCookie(res, token) {
  res.cookie('rt', token, refreshCookieOpts());
}

function clearRefreshCookie(res) {
  res.clearCookie('rt', refreshCookieOpts());
  // (one-time cleanup if you previously used path:'/auth')
  res.clearCookie('rt', { ...refreshCookieOpts(), path: '/auth' });
}

module.exports = { refreshCookieOpts, setRefreshCookie, clearRefreshCookie };
