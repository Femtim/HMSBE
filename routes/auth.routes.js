const { Router } = require('express');
const { registerPatient, login, getCurrentUser } = require('../controllers/Auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const router = Router();

router.post('/register', registerPatient);
router.post('/login', login);
router.get('/me', authenticate, getCurrentUser);

module.exports = router;