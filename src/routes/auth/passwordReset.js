const express = require('express');
const { hashPassword } = require('../../lib/passwordHash');
const { query, mapRow, withTransaction } = require('../../lib/db');
const { findUserByEmail, updateUser } = require('../../services/users');
const config = require('../../config');
const { generateToken } = require('../../lib/tokens');
const { sendPasswordResetEmail } = require('../../lib/mailer');
const { loginLimiter } = require('../../middleware/rateLimit');

const router = express.Router();

async function findResetTokenByToken(token) {
  const rows = await query('SELECT * FROM password_reset_tokens WHERE token = ?', [token]);
  return mapRow(rows[0]) || null;
}

router.get('/glomt-losenord', (req, res) => {
  res.render('auth/forgot-password', { title: 'Glömt lösenord', sent: false, error: null });
});

router.post('/glomt-losenord', loginLimiter, async (req, res, next) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    if (email) {
      const user = await findUserByEmail(email);
      // Skicka alltid samma bekräftelse, oavsett om kontot finns, så att man
      // inte kan ta reda på vilka e-postadresser som är registrerade.
      if (user && user.active) {
        const token = generateToken();
        const expiresAt = new Date(Date.now() + config.passwordResetExpiryHours * 60 * 60 * 1000);
        await query('INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at) VALUES (?, ?, ?, NOW())', [
          user.id,
          token,
          expiresAt,
        ]);
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
    const resetToken = await findResetTokenByToken(req.params.token);
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
    const resetToken = await findResetTokenByToken(req.params.token);
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

    const passwordHash = await hashPassword(password);
    await withTransaction(async (conn) => {
      await updateUser(resetToken.userId, { passwordHash }, conn);
      await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [resetToken.id], conn);
    });

    res.render('auth/reset-password-done', { title: 'Lösenord uppdaterat' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
