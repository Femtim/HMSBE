const { Router } = require('express');
const {
  registerPatient,
  verifyEmail,
  resendVerificationEmail,
  login,
  getCurrentUser,
  forgotPassword,
  resetPassword,
  updatePassword,
  deleteAccount,
} = require('../controllers/Auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const router = Router();

router.post('/register', registerPatient);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerificationEmail);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

router.get('/me', authenticate, getCurrentUser);
router.patch('/update-password', authenticate, updatePassword);
router.delete('/delete-account', authenticate, deleteAccount);

module.exports = router;