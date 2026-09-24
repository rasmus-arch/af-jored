const express = require('express');
const { hashPassword, verifyPassword } = require('../lib/passwordHash');
const { findUserById, updateUser, createAuditLog } = require('../services/users');
const totp = require('../lib/totp');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const user = await findUserById(req.session.user.id);
    res.render('account/index', {
      title: 'Mitt konto',
      user,
      passwordError: null,
      passwordSuccess: false,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/losenord', async (req, res, next) => {
  try {
    const user = await findUserById(req.session.user.id);
    const { currentPassword, newPassword, newPasswordConfirm } = req.body;

    const render = (error, success = false) =>
      res.render('account/index', { title: 'Mitt konto', user, passwordError: error, passwordSuccess: success });

    const validCurrent = await verifyPassword(user.passwordHash, currentPassword || '').catch(() => false);
    if (!validCurrent) return res.status(400).render('account/index', { title: 'Mitt konto', user, passwordError: 'Fel nuvarande lösenord.', passwordSuccess: false });

    if (!newPassword || newPassword.length < 10) return render('Det nya lösenordet måste vara minst 10 tecken.');
    if (newPassword !== newPasswordConfirm) return render('De nya lösenorden matchar inte.');

    const passwordHash = await hashPassword(newPassword);
    await updateUser(user.id, { passwordHash });
    await createAuditLog({ userId: user.id, action: 'PASSWORD_CHANGED', ipAddress: req.ip });

    res.render('account/index', { title: 'Mitt konto', user, passwordError: null, passwordSuccess: true });
  } catch (err) {
    next(err);
  }
});

// Aktivera tvåstegsverifiering (frivilligt, för alla roller).
router.get('/tva-stegsverifiering/installera', async (req, res, next) => {
  try {
    const user = await findUserById(req.session.user.id);
    if (user.totpEnabled) return res.redirect('/konto');

    if (!req.session.accountTotpSecret) {
      req.session.accountTotpSecret = totp.generateSecret();
    }
    const qrDataUrl = await totp.generateQrCodeDataUrl(user.email, req.session.accountTotpSecret);

    res.render('account/setup-totp', {
      title: 'Aktivera tvåstegsverifiering',
      error: null,
      qrDataUrl,
      secret: req.session.accountTotpSecret,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/tva-stegsverifiering/installera', async (req, res, next) => {
  try {
    const user = await findUserById(req.session.user.id);
    if (user.totpEnabled || !req.session.accountTotpSecret) return res.redirect('/konto');

    const valid = totp.verifyToken(req.session.accountTotpSecret, req.body.code);
    if (!valid) {
      const qrDataUrl = await totp.generateQrCodeDataUrl(user.email, req.session.accountTotpSecret);
      return res.status(400).render('account/setup-totp', {
        title: 'Aktivera tvåstegsverifiering',
        error: 'Fel kod. Försök igen.',
        qrDataUrl,
        secret: req.session.accountTotpSecret,
      });
    }

    await updateUser(user.id, { totpSecret: req.session.accountTotpSecret, totpEnabled: true });
    delete req.session.accountTotpSecret;
    await createAuditLog({ userId: user.id, action: 'TOTP_ENABLED', ipAddress: req.ip });

    res.redirect('/konto');
  } catch (err) {
    next(err);
  }
});

router.post('/tva-stegsverifiering/inaktivera', async (req, res, next) => {
  try {
    const user = await findUserById(req.session.user.id);

    const validPassword = await verifyPassword(user.passwordHash, req.body.currentPassword || '').catch(() => false);
    if (!validPassword) {
      return res.status(400).render('account/index', {
        title: 'Mitt konto',
        user,
        passwordError: null,
        passwordSuccess: false,
        totpError: 'Fel lösenord. Tvåstegsverifieringen är kvar aktiverad.',
      });
    }

    await updateUser(user.id, { totpEnabled: false, totpSecret: null });
    await createAuditLog({ userId: user.id, action: 'TOTP_DISABLED', ipAddress: req.ip });
    res.redirect('/konto');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
