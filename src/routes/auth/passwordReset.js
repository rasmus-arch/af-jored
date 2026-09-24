const express = require('express');
const argon2 = require('argon2');
const prisma = require('../../lib/prisma');
const config = require('../../config');
const { generateToken } = require('../../lib/tokens');
const { sendPasswordResetEmail } = require('../../lib/mailer');
const { loginLimiter } = require('../../middleware/rateLimit');

const router = express.Router();

router.get('/glomt-losenord', (req, res) => {
  res.render('auth/forgot-password', { title: 'Glömt lösenord', sent: false, error: null });
});

router.post('/glomt-losenord', loginLimiter, async (req, res, next) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    if (email) {
      const user = await prisma.user.findUnique({ where: { email } });
      // Skicka alltid samma bekräftelse, oavsett om kontot finns, så att man
      // inte kan ta reda på vilka e-postadresser som är registrerade.
      if (user && user.active) {
        const token = generateToken();
        const expiresAt = new Date(Date.now() + config.passwordResetExpiryHours * 60 * 60 * 1000);
        await prisma.passwordResetToken.create({ data: { userId: user.id, token, expiresAt } });
        const url = `${config.appBaseUrl}/aterstall-losenord/${token}`;
        await sendPasswordResetEmail({ to: user.email, url });
      }
    }
    res.render('auth/forgot-password', { title: 'Glömt lösenord', sent: true, error: null });
  } catch (err) {
    next(err);
  }
});

router.get('/aterstall-losenord/:token', async (req, res, next) => {
  try {
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { token: req.params.token } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return res.status(400).render('error', {
        title: 'Ogiltig länk',
        message: 'Länken för att återställa lösenord är ogiltig eller har gått ut.',
      });
    }
    res.render('auth/reset-password', { title: 'Återställ lösenord', error: null, token: req.params.token });
  } catch (err) {
    next(err);
  }
});

router.post('/aterstall-losenord/:token', async (req, res, next) => {
  try {
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { token: req.params.token } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return res.status(400).render('error', {
        title: 'Ogiltig länk',
        message: 'Länken för att återställa lösenord är ogiltig eller har gått ut.',
      });
    }

    const { password, passwordConfirm } = req.body;
    if (!password || password.length < 10) {
      return res.status(400).render('auth/reset-password', {
        title: 'Återställ lösenord',
        error: 'Lösenordet måste vara minst 10 tecken.',
        token: req.params.token,
      });
    }
    if (password !== passwordConfirm) {
      return res.status(400).render('auth/reset-password', {
        title: 'Återställ lösenord',
        error: 'Lösenorden matchar inte.',
        token: req.params.token,
      });
    }

    const passwordHash = await argon2.hash(password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    ]);

    res.render('auth/reset-password-done', { title: 'Lösenord uppdaterat' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
