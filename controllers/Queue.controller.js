const QueueTicket = require('../models/QueueTicket.model');
const Appointment = require('../models/Appointment.model');
const User = require('../models/User.model');
const Counter = require('../models/Counter.model');

const DEPT_PREFIX_MAP = {
  GENERAL_OPD: 'OPD',
  PEDIATRICS: 'PED',
  CARDIOLOGY: 'CRD',
  OBGYN: 'OBG',
  ORTHOPEDICS: 'ORT',
  DENTAL: 'DNT',
};
const PRIORITY_WEIGHT_MAP = { ROUTINE: 1, VULNERABLE: 2, EMERGENCY: 3 };

const generateAtomicTicketNumber = async (queueDate, department) => {
  const counter = await Counter.findByIdAndUpdate(
    `${queueDate}_${department}`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${DEPT_PREFIX_MAP[department] || 'GEN'}-${String(counter.seq).padStart(3, '0')}`;
};

const checkInToQueue = async (req, res) => {
  try {
    const { appointmentReference, patientId: walkInPatientId, doctorId: walkInDoctorId, priorityOverride } = req.body;
    const todayStr = new Date().toISOString().split('T')[0];
    let patient, doctor, appointmentId = null;

    if (appointmentReference) {
      const apt = await Appointment.findOne({ appointmentReference: appointmentReference.trim() }).populate('patientId doctorId');
      if (!apt) return res.status(404).json({ success: false, message: 'Appointment not found.' });
      patient = apt.patientId;
      doctor = apt.doctorId;
      appointmentId = apt._id;
      await Appointment.findByIdAndUpdate(apt._id, { $set: { status: 'CHECKED_IN' } });
    } else {
      patient = await User.findById(walkInPatientId || req.user._id);
      doctor = await User.findById(walkInDoctorId);
      if (!patient || !doctor) return res.status(404).json({ success: false, message: 'Patient and Doctor required.' });
    }

    const priorityLabel =
      priorityOverride && PRIORITY_WEIGHT_MAP[priorityOverride]
        ? priorityOverride
        : patient.patientProfile?.isVulnerable
        ? 'VULNERABLE'
        : 'ROUTINE';
    const priorityWeight = PRIORITY_WEIGHT_MAP[priorityLabel];
    const department = doctor.doctorProfile.department;
    const ticketNumber = await generateAtomicTicketNumber(todayStr, department);
    const checkInTime = new Date();

    const newTicket = await QueueTicket.create({
      ticketNumber,
      queueDate: todayStr,
      appointmentId,
      patientId: patient._id,
      doctorId: doctor._id,
      department,
      consultationRoom: doctor.doctorProfile.consultationRoom || 'Room 101',
      priorityLabel,
      priorityWeight,
      status: 'WAITING',
      timestampsLog: { checkInTime },
    });

    const io = req.app.get('io');
    if (io) io.to(department).emit('queue:updated', { department, action: 'CHECK_IN', ticketNumber });

    return res.status(201).json({ success: true, message: 'Checked in to queue.', data: newTicket });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getMyActiveTicket = async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const ticket = await QueueTicket.findOne({
      queueDate: todayStr,
      patientId: req.user._id,
      status: { $in: ['WAITING', 'CALLED', 'IN_CONSULTATION'] },
    }).populate('doctorId', 'fullName doctorProfile');
    return res.status(200).json({ success: true, data: ticket });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const callNextPatient = async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const calledTime = new Date();
    const nextTicket = await QueueTicket.findOneAndUpdate(
      { queueDate: todayStr, doctorId: req.user._id, status: 'WAITING' },
      { $set: { status: 'CALLED', 'timestampsLog.calledTime': calledTime } },
      { sort: { priorityWeight: -1, 'timestampsLog.checkInTime': 1 }, new: true }
    ).populate('patientId', 'fullName phone patientProfile');

    if (!nextTicket) return res.status(200).json({ success: true, data: null, message: 'No waiting patients.' });

    const io = req.app.get('io');
    if (io) {
      io.to(nextTicket.department).emit('queue:patient_called', {
        ticketNumber: nextTicket.ticketNumber,
        consultationRoom: nextTicket.consultationRoom,
      });
    }

    return res.status(200).json({ success: true, data: nextTicket });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getDoctorActiveTicket = async (req, res) => {
  try {
    const ticket = await QueueTicket.findOne({
      queueDate: new Date().toISOString().split('T')[0],
      doctorId: req.user._id,
      status: { $in: ['CALLED', 'IN_CONSULTATION'] },
    }).populate('patientId', 'fullName phone patientProfile');
    return res.status(200).json({ success: true, data: ticket });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const completePatientConsultation = async (req, res) => {
  try {
    const ticket = await QueueTicket.findById(req.params.ticketId);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found.' });

    ticket.status = 'COMPLETED';
    ticket.timestampsLog.completedTime = new Date();
    await ticket.save();

    if (ticket.appointmentId) {
      await Appointment.findByIdAndUpdate(ticket.appointmentId, { $set: { status: 'COMPLETED' } });
    }

    const io = req.app.get('io');
    if (io) io.to(ticket.department).emit('queue:updated', { department: ticket.department, action: 'COMPLETED' });

    return res.status(200).json({ success: true, message: 'Consultation completed.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getLiveDepartmentBoard = async (req, res) => {
  try {
    const liveQueue = await QueueTicket.find({
      queueDate: new Date().toISOString().split('T')[0],
      department: req.params.department.toUpperCase(),
      status: { $in: ['CALLED', 'IN_CONSULTATION', 'WAITING'] },
    })
      .populate('doctorId', 'fullName')
      .sort({ status: 1, priorityWeight: -1, 'timestampsLog.checkInTime': 1 })
      .limit(30);
    return res.status(200).json({ success: true, data: liveQueue });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  checkInToQueue,
  getMyActiveTicket,
  callNextPatient,
  getDoctorActiveTicket,
  completePatientConsultation,
  getLiveDepartmentBoard,
};