const express = require('express');
const prisma = require('../../lib/prisma');

const router = express.Router();

router.get('/mina-sidor', async (req, res, next) => {
  try {
    const [company, users] = await Promise.all([
      prisma.company.findUnique({ where: { id: req.session.user.companyId } }),
      prisma.user.findMany({ where: { companyId: req.session.user.companyId }, orderBy: { email: 'asc' } }),
    ]);
    res.render('reseller/account', { title: 'Min sida', company, users, currentUserId: req.session.user.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
