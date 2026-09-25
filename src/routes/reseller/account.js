const express = require('express');
const { query, mapRow, mapRows } = require('../../lib/db');

const router = express.Router();

router.get('/mina-sidor', async (req, res, next) => {
  try {
    const [companyRows, users] = await Promise.all([
      query('SELECT * FROM companies WHERE id = ?', [req.session.user.companyId]),
      mapRows(await query('SELECT * FROM users WHERE company_id = ? ORDER BY email ASC', [req.session.user.companyId])),
    ]);
    const company = mapRow(companyRows[0]);
    res.render('reseller/account', { title: 'Min sida', company, users, currentUserId: req.session.user.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
