const Appointment = require('../models/Appointment.model');
const User = require('../models/User.model');

const computeAvailableSlots = (shiftStart, shiftEnd, intervalMins, bookedSlots) => {
  const slots = [];
  const bookedSet = new Set(bookedSlots.map((b) => b.timeSlot.startTime));

  const [startHour, startMin] = shiftStart.split(':').map(Number);
  const [endHour, endMin] = shiftEnd.split(':').map(Number);

  let currentMins = startHour * 60 + startMin;
  const endTotalMins = endHour * 60 + endMin;

  while (currentMins + intervalMins <= endTotalMins) {
    const startH = String(Math.floor(currentMins / 60)).padStart(2, '0');
    const startM = String(currentMins % 60).padStart(2, '0');
    const startTime = `${startH}:${startM}`;

    const nextMins = currentMins + intervalMins;
    const endH = String(Math.floor(nextMins / 60)).padStart(2, '0');
    const endM = String(nextMins % 60).padStart(2, '0');
    const endTime = `${endH}:${endM}`;

    if (!bookedSet.has(startTime)) {
      slots.push({ startTime, endTime });
    }
    currentMins = nextMins;
  }

  return slots;
};

const getActiveDoctorsByDepartment = async (req, res) => {
  try {
    const { department } = req.query;
    const query = { role: 'DOCTOR', isActive: true, 'doctorProfile.isAvailableToday': true };
    if (department) query['doctorProfile.department'] = department.toUpperCase();

    const doctors = await User.find(query).select('fullName email phone doctorProfile');
    return res.status(200).json({ success: true, count: doctors.length, data: doctors });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getDoctorAvailableSlots = async (req, res) => {
  try {
    const { doctorId, date } = req.query;
    if (!doctorId || !date) {
      return res.status(400).json({ success: false, message: 'doctorId and date are required.' });
    }

    const doctor = await User.findById(doctorId);
    if (!doctor || doctor.role !== 'DOCTOR') {
      return res.status(404).json({ success: false, message: 'Doctor not found.' });
    }

    const normalizedDate = new Date(`${date}T00:00:00.000Z`);
    const bookedSlots = await Appointment.find({
      doctorId,
      appointmentDate: normalizedDate,
      status: { $in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
    }).select('timeSlot.startTime timeSlot.endTime status -_id');

    const shiftStart = doctor.doctorProfile?.shiftHours?.start || '08:00';
    const shiftEnd = doctor.doctorProfile?.shiftHours?.end || '16:00';
    const interval = doctor.doctorProfile?.avgConsultationTimeMins || 15;

    const availableSlots = computeAvailableSlots(shiftStart, shiftEnd, interval, bookedSlots);

    return res.status(200).json({
      success: true,
      doctor: doctor.fullName,
      department: doctor.doctorProfile?.department,
      date,
      availableSlots,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const bookAppointment = async (req, res) => {
  try {
    const patientId = req.user._id;
    const { doctorId, appointmentDate, startTime, endTime, symptomsOrReason } = req.body;

    const doctor = await User.findById(doctorId);
    if (!doctor || doctor.role !== 'DOCTOR') {
      return res.status(404).json({ success: false, message: 'Selected doctor does not exist.' });
    }

    const normalizedDate = new Date(`${appointmentDate}T00:00:00.000Z`);
    const dateCompact = appointmentDate.replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const appointmentReference = `APT-${dateCompact}-${randomSuffix}`;

    const appointment = await Appointment.create({
      appointmentReference,
      patientId,
      doctorId,
      department: doctor.doctorProfile.department,
      appointmentDate: normalizedDate,
      timeSlot: { startTime, endTime },
      bookingType: 'ONLINE',
      status: 'CONFIRMED',
      symptomsOrReason,
    });

    return res.status(201).json({ success: true, message: 'Appointment booked successfully.', data: appointment });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This time slot is already booked.' });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getMyAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({ patientId: req.user._id })
      .populate('doctorId', 'fullName doctorProfile.department doctorProfile.consultationRoom')
      .sort({ appointmentDate: -1, 'timeSlot.startTime': 1 });

    return res.status(200).json({ success: true, count: appointments.length, data: appointments });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const cancelAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { cancellationReason } = req.body;

    const updated = await Appointment.findByIdAndUpdate(
      appointmentId,
      { $set: { status: 'CANCELLED', cancellationReason: cancellationReason || 'Cancelled by patient' } },
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, message: 'Appointment not found.' });

    return res.status(200).json({ success: true, message: 'Appointment cancelled.', data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getActiveDoctorsByDepartment,
  getDoctorAvailableSlots,
  bookAppointment,
  getMyAppointments,
  cancelAppointment,
};