const User = require('../models/User.model');

const bootstrapSuperAdmin = async () => {
  try {
    const existingAdmin = await User.findOne({ role: 'SUPER_ADMIN' });
    if (existingAdmin) {
      console.log(`🛡️  Super Admin ready: ${existingAdmin.email}`);
      return;
    }

    const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@hospital.ng';
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD || 'Admin@2026!';
    const adminPhone = process.env.SUPER_ADMIN_PHONE || '+2348000000001';

    await User.create({
      fullName: 'Chief System Administrator',
      email: adminEmail,
      phone: adminPhone,
      password: adminPassword,
      role: 'SUPER_ADMIN',
      isActive: true,
    });

    console.log(`✅ Bootstrapped Super Admin! Email: ${adminEmail} | Password: ${adminPassword}`);
  } catch (error) {
    console.error('❌ Failed to bootstrap Super Admin:', error.message);
  }
};

module.exports = {
  bootstrapSuperAdmin,
};