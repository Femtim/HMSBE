const { Router } = require('express');
const {
  checkInToQueue,
  getMyActiveTicket,
  callNextPatient,
  getDoctorActiveTicket,
  completePatientConsultation,
  getLiveDepartmentBoard,
} = require('../controllers/Queue.controller');
const { authenticate, authorizeRoles } = require('../middlewares/auth.middleware');

const router = Router();

router.get('/live-board/:department', getLiveDepartmentBoard);
router.use(authenticate);
router.post('/check-in', authorizeRoles('PATIENT', 'SUPER_ADMIN'), checkInToQueue);
router.get('/my-active-ticket', authorizeRoles('PATIENT'), getMyActiveTicket);
router.patch('/call-next', authorizeRoles('DOCTOR'), callNextPatient);
router.get('/doctor-active', authorizeRoles('DOCTOR'), getDoctorActiveTicket);
router.patch('/:ticketId/complete', authorizeRoles('DOCTOR'), completePatientConsultation);

module.exports = router;