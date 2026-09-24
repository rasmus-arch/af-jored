require('dotenv').config();
const path = require('path');
const { resolveDatabaseUrl } = require('../lib/databaseUrl');

// Om DATABASE_URL saknas byggs den ihop från DB_HOST/DB_PORT/DB_USER/
// DB_PASSWORD/DB_NAME (med automatisk kodning av specialtecken). Sätts även
// tillbaka på process.env så att @prisma/client (som läser DATABASE_URL
// direkt) också hittar den.
const databaseUrl = resolveDatabaseUrl(process.env);
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  sessionSecret: process.env.SESSION_SECRET || 'utveckling-osaker-hemlighet-byt-i-produktion',
  databaseUrl,
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
