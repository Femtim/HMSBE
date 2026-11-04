const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User.model');
const sendEmail = require('../utils/sendEmail');

const signToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || 'hospital_mvcr_secret_key_2026',
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

    // Generate raw token for email link & hashed token for database storage
    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(rawVerificationToken)
      .digest('hex');

    const newPatient = await User.create({
      fullName,
      email,
      phone,
      password,
      role: 'PATIENT',
      isEmailVerified: false,
      emailVerificationToken: hashedToken,
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000, // Valid for 24 hours
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

    const htmlMessage = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #1E293B; margin-bottom: 8px;">Welcome to HAQMS, ${newPatient.fullName}!</h2>
        <p style="color: #475569; font-size: 14px;">Your Digital Hospital Card Number has been reserved: <strong style="color: #0D9488;">${hospitalCardNumber}</strong></p>
        <p style="color: #475569; font-size: 14px;">Please verify your email address within 24 hours to activate your account and log in:</p>
        <div style="margin: 28px 0;">
          <a href="${verificationUrl}" style="background-color: #0D9488; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p style="color: #94a3b8; font-size: 12px;">Or copy and paste this link in your browser:<br/>${verificationUrl}</p>
      </div>
    `;

    try {
      await sendEmail({
        to: newPatient.email,
        subject: 'Verify Your Hospital Portal Email - HAQMS',
        html: htmlMessage,
      });
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr.message);
      return res.status(201).json({
        success: true,
        requiresVerification: true,
        message: 'Account created, but verification email failed to send. Please click Resend Verification on the login page.',
      });
    }

    return res.status(201).json({
      success: true,
      requiresVerification: true,
      message: `Registration successful! A verification link has been sent to ${newPatient.email}. Please verify your email before logging in.`,
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
        message: 'Verification link is invalid or has expired. Please request a new one.',
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully! You can now log in to your portal.',
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
      return res.status(400).json({
        success: false,
        message: 'This email is already verified. Please proceed to login.',
      });
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

    await sendEmail({
      to: user.email,
      subject: 'New Verification Link - HAQMS Hospital Portal',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h2>Verify Your Email Address</h2>
          <p>Click the button below to verify your email address and activate your hospital portal:</p>
          <a href="${verificationUrl}" style="background-color: #0D9488; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block; margin: 16px 0;">
            Verify Email Now
          </a>
        </div>
      `,
    });

    return res.status(200).json({
      success: true,
      message: `A fresh verification link has been sent to ${user.email}.`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Login (Blocks unverified users)
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password.',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase(), isActive: true }).select(
      '+password'
    );
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Enforce Email Verification before issuing token
    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        requiresVerification: true,
        email: user.email,
        message: 'Please verify your email address before logging in. Check your inbox for the verification link.',
      });
    }

    const token = signToken(user);

    return res.status(200).json({
      success: true,
      token,
      data: formatUserPayload(user),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getCurrentUser = async (req, res) => {
  return res.status(200).json({
    success: true,
    data: formatUserPayload(req.user),
  });
};

module.exports = {
  registerPatient,
  verifyEmail,
  resendVerificationEmail,
  login,
  getCurrentUser,
};