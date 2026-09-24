const express = require('express');
const argon2 = require('argon2');
const prisma = require('../../lib/prisma');
const totp = require('../../lib/totp');
const { loginLimiter } = require('../../middleware/rateLimit');
const invitationRoutes = require('./invitation');
const passwordResetRoutes = require('./passwordReset');

const router = express.Router();

function isTotpRequired(user) {
  return user.role === 'ADMIN';
}

async function completeLogin(req, res, user) {
  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

  req.session.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
  };

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await prisma.auditLog.create({ data: { userId: user.id, action: 'LOGIN', ipAddress: req.ip } });

  res.redirect(user.role === 'ADMIN' ? '/admin' : '/portal');
}

router.get('/logga-in', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'ADMIN' ? '/admin' : '/portal');
  }
  return res.render('auth/login', { title: 'Logga in', error: null, email: '' });
});

router.post('/logga-in', loginLimiter, async (req, res, next) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    const password = req.body.password || '';
    const genericError = 'Fel e-postadress eller lösenord.';

    if (!email || !password) {
      return res.status(400).render('auth/login', { title: 'Logga in', error: genericError, email });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Kör alltid en hash-verifiering, även om användaren saknas, för att inte
    // läcka via svarstid vilka e-postadresser som finns registrerade.
    const passwordHash = user ? user.passwordHash : '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const valid = await argon2.verify(passwordHash, password).catch(() => false);

    if (!user || !user.active || !valid) {
      await prisma.auditLog.create({ data: { action: 'LOGIN_FAILED', ipAddress: req.ip, newValue: { email } } });
      return res.status(401).render('auth/login', { title: 'Logga in', error: genericError, email });
    }

    if (user.totpEnabled) {
      req.session.pendingUserId = user.id;
      delete req.session.pendingTotpSecret;
      return res.redirect('/logga-in/verifiera');
    }

    if (isTotpRequired(user)) {
      req.session.pendingUserId = user.id;
      return res.redirect('/logga-in/installera-2fa');
    }

    return completeLogin(req, res, user);
  } catch (err) {
    return next(err);
  }
});

// Steg 2 (obligatoriskt): ange kod från autentiseringsapp för användare som
// redan har TOTP aktiverat.
router.get('/logga-in/verifiera', (req, res) => {
  if (!req.session.pendingUserId) return res.redirect('/logga-in');
  res.render('auth/verify-totp', { title: 'Tvåstegsverifiering', error: null });
});

router.post('/logga-in/verifiera', loginLimiter, async (req, res, next) => {
  try {
    if (!req.session.pendingUserId) return res.redirect('/logga-in');
    const user = await prisma.user.findUnique({ where: { id: req.session.pendingUserId } });
    if (!user || !user.active || !user.totpEnabled) return res.redirect('/logga-in');

    const valid = totp.verifyToken(user.totpSecret, req.body.code);
    if (!valid) {
      return res.status(401).render('auth/verify-totp', { title: 'Tvåstegsverifiering', error: 'Fel kod. Försök igen.' });
    }

    delete req.session.pendingUserId;
    return completeLogin(req, res, user);
  } catch (err) {
    return next(err);
  }
});

// Obligatorisk TOTP-aktivering för admin som ännu inte satt upp det.
router.get('/logga-in/installera-2fa', async (req, res, next) => {
  try {
    if (!req.session.pendingUserId) return res.redirect('/logga-in');
    const user = await prisma.user.findUnique({ where: { id: req.session.pendingUserId } });
    if (!user || !isTotpRequired(user) || user.totpEnabled) return res.redirect('/logga-in');

    if (!req.session.pendingTotpSecret) {
      req.session.pendingTotpSecret = totp.generateSecret();
    }
    const qrDataUrl = await totp.generateQrCodeDataUrl(user.email, req.session.pendingTotpSecret);

    res.render('auth/setup-totp', {
      title: 'Aktivera tvåstegsverifiering',
      error: null,
      qrDataUrl,
      secret: req.session.pendingTotpSecret,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logga-in/installera-2fa', loginLimiter, async (req, res, next) => {
  try {
    if (!req.session.pendingUserId || !req.session.pendingTotpSecret) return res.redirect('/logga-in');
    const user = await prisma.user.findUnique({ where: { id: req.session.pendingUserId } });
    if (!user || !isTotpRequired(user) || user.totpEnabled) return res.redirect('/logga-in');

    const valid = totp.verifyToken(req.session.pendingTotpSecret, req.body.code);
    if (!valid) {
      const qrDataUrl = await totp.generateQrCodeDataUrl(user.email, req.session.pendingTotpSecret);
      return res.status(401).render('auth/setup-totp', {
        title: 'Aktivera tvåstegsverifiering',
        error: 'Fel kod. Försök igen.',
        qrDataUrl,
        secret: req.session.pendingTotpSecret,
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: req.session.pendingTotpSecret, totpEnabled: true },
    });
    delete req.session.pendingTotpSecret;

    return completeLogin(req, res, updatedUser);
  } catch (err) {
    next(err);
  }
});

router.post('/logga-ut', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/logga-in');
  });
});

router.use(invitationRoutes);
router.use(passwordResetRoutes);

module.exports = router;
