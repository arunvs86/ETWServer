const router = require('express').Router();
const ctr = require('../controllers/authController.js');
const { authGuard, requireRole } = require('../middlewares/auth');

router.post('/google', ctr.googleSignIn);
router.post('/register', ctr.register);
router.post('/login', ctr.login);
router.post('/refresh', ctr.refresh);
router.post('/logout', ctr.logout);

// Password reset (forgot password)
router.post('/forgot-password', ctr.forgotPassword);
router.post('/reset-password', ctr.resetPassword);
router.get('/reset-password/validate', ctr.validateResetToken);

router.get('/me', authGuard, ctr.me);


module.exports = router;



