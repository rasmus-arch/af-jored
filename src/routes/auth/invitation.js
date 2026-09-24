const express = require('express');
const { hashPassword } = require('../../lib/passwordHash');
const { query, mapRow, withTransaction } = require('../../lib/db');
const { upsertUserByEmail } = require('../../services/users');

const router = express.Router();

async function findInvitationByToken(token) {
  const rows = await query(
    `SELECT i.*, c.id AS c_id, c.name AS c_name
     FROM invitations i
     JOIN companies c ON c.id = i.company_id
     WHERE i.token = ?`,
    [token]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const invitation = mapRow(row);
  invitation.company = { id: row.c_id, name: row.c_name };
  return invitation;
}

router.get('/bjudits-in/:token', async (req, res, next) => {
  try {
    const invitation = await findInvitationByToken(req.params.token);

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
    const invitation = await findInvitationByToken(req.params.token);

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

    const passwordHash = await hashPassword(password);

    await withTransaction(async (conn) => {
      await upsertUserByEmail(
        invitation.email,
        { passwordHash, role: invitation.role, companyId: invitation.companyId, active: true },
        conn
      );
      await query('UPDATE invitations SET accepted_at = NOW() WHERE id = ?', [invitation.id], conn);
    });

    res.render('auth/accept-invitation-done', { title: 'Klart' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
