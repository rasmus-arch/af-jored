const express = require('express');
const { query, mapRow } = require('../../lib/db');

const router = express.Router();
const PAGE_SIZE = 50;

router.get('/loggar', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const action = req.query.action || '';

    const whereClause = action ? 'WHERE l.action = ?' : '';
    const whereParams = action ? [action] : [];

    const [rows, countRows, actionRows] = await Promise.all([
      query(
        `SELECT l.*, u.email AS u_email
         FROM audit_logs l
         LEFT JOIN users u ON u.id = l.user_id
         ${whereClause}
         ORDER BY l.created_at DESC
         LIMIT ? OFFSET ?`,
        [...whereParams, PAGE_SIZE, (page - 1) * PAGE_SIZE]
      ),
      query(`SELECT COUNT(*) AS n FROM audit_logs l ${whereClause}`, whereParams),
      query('SELECT DISTINCT action FROM audit_logs ORDER BY action ASC'),
    ]);

    const logs = rows.map((row) => {
      const log = mapRow(row);
      log.user = row.u_email ? { email: row.u_email } : null;
      return log;
    });
    const total = countRows[0].n;

    res.render('admin/logs/list', {
      title: 'Loggar',
      logs,
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      actions: actionRows.map((a) => a.action),
      selectedAction: action,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
