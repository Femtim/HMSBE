const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User.model');
const Appointment = require('../models/Appointment.model');
const QueueTicket = require('../models/QueueTicket.model');
const sendEmail = require('../utils/sendEmail');

const signToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || 'hospital_mcr_secret_key_2026',
    { expiresIn: '1d' }
  );
};

const formatUserPayload = (user) => ({
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  isEmailVerified: user.isEmailVerified,
  hospitalCardNumber: user.patientProfile?.hospitalCardNumber || null,
  profile: user.role === 'DOCTOR' ? user.doctorProfile : user.patientProfile,
  doctorProfile: user.doctorProfile,
  patientProfile: user.patientProfile,
});

// 1. Register Patient & Send Verification Email
const registerPatient = async (req, res) => {
  try {
    const { fullName, email, phone, password, dateOfBirth, gender, bloodGroup, isVulnerable } =
      req.body;

    if (!fullName || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, phone, and password are required.',
      });
    }

    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    const hospitalCardNumber = `HCN-${new Date().getFullYear()}-${randomDigits}`;

    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawVerificationToken).digest('hex');

    const newPatient = await User.create({
      fullName,
      email,
      phone,
      password,
      role: 'PATIENT',
      isEmailVerified: false,
      emailVerificationToken: hashedToken,
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000,
      patientProfile: {
        hospitalCardNumber,
        dateOfBirth,
        gender: gender || 'MALE',
        bloodGroup: bloodGroup || 'O+',
        isVulnerable: Boolean(isVulnerable),
      },
    });

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const verificationUrl = `${clientUrl}/verify-email/${rawVerificationToken}`;

    console.log(`🔗 [DEV VERIFICATION LINK] for ${newPatient.email}: ${verificationUrl}`);

    const htmlMessage = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #1E293B; margin-bottom: 8px;">Welcome to HAQMS, ${newPatient.fullName}!</h2>
        <p style="color: #475569; font-size: 14px;">Your Digital Hospital Card Number: <strong style="color: #0D9488;">${hospitalCardNumber}</strong></p>
        <p style="color: #475569; font-size: 14px;">Please verify your email within 24 hours to activate your account:</p>
        <div style="margin: 28px 0;">
          <a href="${verificationUrl}" style="background-color: #0D9488; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">
            Verify Email Address
          </a>
        </div>
      </div>
    `;

    try {
      await sendEmail({
        to: newPatient.email,
        subject: 'Verify Your Hospital Portal Email - HAQMS',
        html: htmlMessage,
      });
    } catch (emailErr) {
      console.warn('⚠️ SMTP not configured or failed, using fallback link:', emailErr.message);
      return res.status(201).json({
        success: true,
        requiresVerification: true,
        fallbackVerificationUrl: verificationUrl,
        message: `Account created! (SMTP failed, use the direct verification button below or check backend console).`,
      });
    }

    return res.status(201).json({
      success: true,
      requiresVerification: true,
      message: `Registration successful! A verification link has been sent to ${newPatient.email}.`,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email or phone number already exists.',
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Verify Email Token
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Verification link is invalid or has expired.',
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully! You may now sign in.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Resend Verification Email
const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with that email.' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, message: 'Email is already verified.' });
    }

    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = crypto
      .createHash('sha256')
      .update(rawVerificationToken)
      .digest('hex');
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const verificationUrl = `${clientUrl}/verify-email/${rawVerificationToken}`;

    console.log(`🔗 [DEV RESEND VERIFICATION LINK] for ${user.email}: ${verificationUrl}`);

    try {
      await sendEmail({
        to: user.email,
        subject: 'New Verification Link - HAQMS Hospital Portal',
        html: `<p>Click <a href="${verificationUrl}">here</a> to verify your email.</p>`,
      });
    } catch (emailErr) {
      console.warn('⚠️ SMTP failed on resend:', emailErr.message);
      return res.status(200).json({
        success: true,
        fallbackVerificationUrl: verificationUrl,
        message: 'SMTP not configured. Click the direct verification link generated below.',
      });
    }

    return res.status(200).json({
      success: true,
      message: `Verification link resent to ${user.email}.`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase(), isActive: true }).select(
      '+password'
    );
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        requiresVerification: true,
        email: user.email,
        message: 'Please verify your email address before logging in.',
      });
    }

    const token = signToken(user);
    return res.status(200).json({ success: true, token, data: formatUserPayload(user) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 5. Get Current Logged-in User Profile
const getCurrentUser = async (req, res) => {
  return res.status(200).json({ success: true, data: formatUserPayload(req.user) });
};

// 6. Forgot Password (With Fallback Link if SMTP Fails)
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Please provide your email address.' });
    }

    const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No active account found with that email address.',
      });
    }

    const rawResetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(rawResetToken).digest('hex');
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${clientUrl}/reset-password/${rawResetToken}`;

    console.log(`🔑 [DEV PASSWORD RESET LINK] for ${user.email}: ${resetUrl}`);

    try {
      await sendEmail({
        to: user.email,
        subject: 'Password Reset Request - HAQMS Hospital Portal',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #1E293B;">Reset Your HAQMS Password</h2>
            <p style="color: #475569; font-size: 14px;">Hello ${user.fullName}, click the button below within 1 hour to set a new password:</p>
            <div style="margin: 28px 0;">
              <a href="${resetUrl}" style="background-color: #312E81; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">
                Reset Password
              </a>
            </div>
          </div>
        `,
      });
    } catch (emailErr) {
      console.warn('⚠️ SMTP failed on forgotPassword:', emailErr.message);
      return res.status(200).json({
        success: true,
        fallbackResetUrl: resetUrl,
        message: 'Reset token generated! (SMTP is not configured, click the direct reset link below).',
      });
    }

    return res.status(200).json({
      success: true,
      message: `Password reset link sent to ${user.email}.`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 7. Reset Password via Email Token
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long.',
      });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Password reset link is invalid or has expired.',
      });
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password has been reset successfully! You can now log in.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 8. Update Password from Sidebar Settings
const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Both current password and new password are required.',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long.',
      });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user || !(await user.comparePassword(currentPassword))) {
      return res.status(401).json({
        success: false,
        message: 'Your current password is incorrect.',
      });
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 9. Delete Account Permanently
const deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!password || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password. Account deletion aborted.',
      });
    }

    await Promise.all([
      Appointment.deleteMany({
        $or: [{ patientId: user._id }, { doctorId: user._id }],
      }),
      QueueTicket.deleteMany({
        $or: [{ patientId: user._id }, { doctorId: user._id }],
      }),
      User.findByIdAndDelete(user._id),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Your hospital account and associated records have been permanently deleted.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  registerPatient,
  verifyEmail,
  resendVerificationEmail,
  login,
  getCurrentUser,
  forgotPassword,
  resetPassword,
  updatePassword,
  deleteAccount,
};