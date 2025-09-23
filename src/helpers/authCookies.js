// helpers/authCookies.js
function setRefreshCookie(res, refreshToken) {
    res.cookie('rt', refreshToken, {
      httpOnly: true,
      secure: true,        // REQUIRED in production (HTTPS)
      sameSite: 'none',    // REQUIRED for cross-site usage after Stripe redirect
      path: '/',           // allow /auth/refresh to read it
      // domain: '.yourdomain.com', // if FE/BE are on subdomains (omit if same host)
      maxAge: 60 * 24 * 60 * 60 * 1000, // 60 days
    });
  }
  module.exports = { setRefreshCookie };
  