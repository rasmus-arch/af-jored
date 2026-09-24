const express = require('express');
const prisma = require('../../lib/prisma');
const { requireAuth, requireRole } = require('../../middleware/auth');
const sortimentRoutes = require('./sortiment');
const kalkylatorRoutes = require('./kalkylator');
const documentsRoutes = require('./documents');
const priceListExportRoutes = require('./priceListExport');
const accountRoutes = require('./account');

const router = express.Router();

router.use(requireAuth, requireRole('RESELLER'));
router.use(sortimentRoutes);
router.use(kalkylatorRoutes);
router.use(documentsRoutes);
router.use(priceListExportRoutes);
router.use(accountRoutes);

router.get('/', async (req, res, next) => {
  try {
    const newsPosts = await prisma.newsPost.findMany({
      where: { active: true },
      orderBy: { publishedAt: 'desc' },
      take: 5,
    });
    res.render('reseller/dashboard', { title: 'Startsida', user: req.session.user, newsPosts });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
