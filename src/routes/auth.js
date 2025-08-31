const router = require('express').Router();
const ctr = require('../controllers/authController.js');
const { authGuard, requireRole } = require('../middlewares/auth');

router.post('/google', ctr.googleSignIn);
router.post('/register', ctr.register);
router.post('/login', ctr.login);
router.post('/refresh', ctr.refresh);
router.post('/logout', ctr.logout);

router.get('/me', authGuard, ctr.me);


module.exports = router;



