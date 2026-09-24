const express = require('express');
const prisma = require('../../lib/prisma');

const router = express.Router();
const PAGE_SIZE = 50;

router.get('/loggar', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const action = req.query.action || '';

    const where = action ? { action } : undefined;
    const [logs, total, actions] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { user: true },
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    ]);

    res.render('admin/logs/list', {
      title: 'Loggar',
      logs,
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      actions: actions.map((a) => a.action),
      selectedAction: action,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
