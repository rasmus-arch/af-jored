const express = require('express');
const argon2 = require('argon2');
const prisma = require('../../lib/prisma');

const router = express.Router();

router.get('/bjudits-in/:token', async (req, res, next) => {
  try {
    const invitation = await prisma.invitation.findUnique({
      where: { token: req.params.token },
      include: { company: true },
    });

    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
      return res.status(400).render('error', {
        title: 'Ogiltig inbjudan',
        message: 'Länken är ogiltig eller har gått ut. Be Joreds skicka en ny inbjudan.',
      });
    }

    res.render('auth/accept-invitation', { title: 'Skapa lösenord', error: null, invitation });
  } catch (err) {
    next(err);
  }
});

router.post('/bjudits-in/:token', async (req, res, next) => {
  try {
    const invitation = await prisma.invitation.findUnique({
      where: { token: req.params.token },
      include: { company: true },
    });

    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
      return res.status(400).render('error', {
        title: 'Ogiltig inbjudan',
        message: 'Länken är ogiltig eller har gått ut. Be Joreds skicka en ny inbjudan.',
      });
    }

    const { password, passwordConfirm } = req.body;
    if (!password || password.length < 10) {
      return res.status(400).render('auth/accept-invitation', {
        title: 'Skapa lösenord',
        error: 'Lösenordet måste vara minst 10 tecken.',
        invitation,
      });
    }
    if (password !== passwordConfirm) {
      return res.status(400).render('auth/accept-invitation', {
        title: 'Skapa lösenord',
        error: 'Lösenorden matchar inte.',
        invitation,
      });
    }

    const passwordHash = await argon2.hash(password);

    await prisma.$transaction([
      prisma.user.upsert({
        where: { email: invitation.email },
        create: {
          email: invitation.email,
          passwordHash,
          role: invitation.role,
          companyId: invitation.companyId,
          active: true,
        },
        update: { passwordHash, active: true },
      }),
      prisma.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } }),
    ]);

    res.render('auth/accept-invitation-done', { title: 'Klart' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
