const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema(
  {
    appointmentReference: {
      type: String,
      required: true,
      unique: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    department: {
      type: String,
      required: true,
      enum: ['GENERAL_OPD', 'PEDIATRICS', 'CARDIOLOGY', 'OBGYN', 'ORTHOPEDICS', 'DENTAL'],
    },
    appointmentDate: {
      type: Date,
      required: true,
    },
    timeSlot: {
      startTime: { type: String, required: true },
      endTime: { type: String, required: true },
    },
    bookingType: {
      type: String,
      enum: ['ONLINE', 'WALK_IN', 'FOLLOW_UP'],
      default: 'ONLINE',
    },
    status: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
      default: 'CONFIRMED',
    },
    symptomsOrReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    cancellationReason: {
      type: String,
    },
  },
  { timestamps: true }
);

AppointmentSchema.index(
  { doctorId: 1, appointmentDate: 1, 'timeSlot.startTime': 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] } },
  }
);

module.exports = mongoose.model('Appointment', AppointmentSchema);