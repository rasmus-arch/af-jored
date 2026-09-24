const express = require('express');
const { verifyPassword, needsRehash, hashPassword } = require('../../lib/passwordHash');
const { findUserByEmail, findUserById, updateUser, createAuditLog } = require('../../services/users');
const totp = require('../../lib/totp');
const { loginLimiter } = require('../../middleware/rateLimit');
const invitationRoutes = require('./invitation');
const passwordResetRoutes = require('./passwordReset');

const router = express.Router();

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

  await updateUser(user.id, { lastLoginAt: new Date() });
  await createAuditLog({ userId: user.id, action: 'LOGIN', ipAddress: req.ip });

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

    const user = await findUserByEmail(email);

    // Kör alltid en hash-verifiering, även om användaren saknas, för att inte
    // läcka via svarstid vilka e-postadresser som finns registrerade.
    const dummyHash = '906b6f28d589bb1d7e049a73adf9632e:a6185e94604b52b08819c577ad3fc6e24c0c4c5fba1455808d533ed5dfee9d4a49ac7e37c24d094fe34e5a8e1c754fad46c4deacf50a3cfc2e538b1fe1466af8';
    const passwordHash = user ? user.passwordHash : dummyHash;
    const valid = await verifyPassword(passwordHash, password).catch(() => false);

    if (!user || !user.active || !valid) {
      await createAuditLog({ action: 'LOGIN_FAILED', ipAddress: req.ip, newValue: { email } });
      return res.status(401).render('auth/login', { title: 'Logga in', error: genericError, email });
    }

    // Hasha om transparent till scrypt om kontot fortfarande har en gammal
    // argon2-hash, så vi successivt migrerar bort från argon2 utan att
    // användaren behöver göra något.
    if (needsRehash(passwordHash)) {
      const rehashed = await hashPassword(password);
      await updateUser(user.id, { passwordHash: rehashed });
    }

    if (user.totpEnabled) {
      req.session.pendingUserId = user.id;
      delete req.session.pendingTotpSecret;
      return res.redirect('/logga-in/verifiera');
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
    const user = await findUserById(req.session.pendingUserId);
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

router.post('/logga-ut', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/logga-in');
  });
});

router.use(invitationRoutes);
router.use(passwordResetRoutes);

module.exports = router;
