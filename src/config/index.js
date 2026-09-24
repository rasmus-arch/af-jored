require('dotenv').config();
const path = require('path');

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  sessionSecret: process.env.SESSION_SECRET || 'utveckling-osaker-hemlighet-byt-i-produktion',
  databaseUrl: process.env.DATABASE_URL,
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || 'Joreds återförsäljarportal <noreply@example.se>',
  },
  invitationExpiryHours: parseInt(process.env.INVITATION_EXPIRY_HOURS, 10) || 72,
  passwordResetExpiryHours: parseInt(process.env.PASSWORD_RESET_EXPIRY_HOURS, 10) || 2,
  uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'),
  uploadMaxSizeMb: parseInt(process.env.UPLOAD_MAX_SIZE_MB, 10) || 10,
};
