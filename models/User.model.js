const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: ['PATIENT', 'DOCTOR', 'SUPER_ADMIN'],
      default: 'PATIENT',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // --- EMAIL VERIFICATION FIELDS ---
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
    },
    emailVerificationExpires: {
      type: Date,
    },
    patientProfile: {
      hospitalCardNumber: { type: String, sparse: true, unique: true },
      dateOfBirth: { type: Date },
      gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'] },
      bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
      isVulnerable: { type: Boolean, default: false },
    },
    doctorProfile: {
      department: {
        type: String,
        enum: ['GENERAL_OPD', 'PEDIATRICS', 'CARDIOLOGY', 'OBGYN', 'ORTHOPEDICS', 'DENTAL'],
      },
      specialization: { type: String },
      consultationRoom: { type: String },
      avgConsultationTimeMins: { type: Number, default: 15 },
      isAvailableToday: { type: Boolean, default: true },
      workingDays: [
        {
          type: String,
          enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
        },
      ],
      shiftHours: {
        start: { type: String, default: '08:00' },
        end: { type: String, default: '16:00' },
      },
    },
  },
  { timestamps: true }
);

UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);