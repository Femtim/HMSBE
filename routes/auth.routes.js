const { Router } = require('express');
const {
  registerPatient,
  verifyEmail,
  resendVerificationEmail,
  login,
  getCurrentUser,
} = require('../controllers/Auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const router = Router();

router.post('/register', registerPatient);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerificationEmail);
router.post('/login', login);
router.get('/me', authenticate, getCurrentUser);

module.exports = router;