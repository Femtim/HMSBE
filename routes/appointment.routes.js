const { Router } = require('express');
const {
  getActiveDoctorsByDepartment,
  getDoctorAvailableSlots,
  bookAppointment,
  getMyAppointments,
  cancelAppointment,
} = require('../controllers/Appointment.controller');
const { authenticate, authorizeRoles } = require('../middlewares/auth.middleware');

const router = Router();

router.use(authenticate);
router.get('/doctors', getActiveDoctorsByDepartment);
router.get('/slots', getDoctorAvailableSlots);
router.post('/book', authorizeRoles('PATIENT'), bookAppointment);
router.get('/my-appointments', authorizeRoles('PATIENT'), getMyAppointments);
router.patch('/:appointmentId/cancel', authorizeRoles('PATIENT', 'SUPER_ADMIN'), cancelAppointment);

module.exports = router;