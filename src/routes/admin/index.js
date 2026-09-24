const express = require('express');
const prisma = require('../../lib/prisma');
const { requireAuth, requireRole } = require('../../middleware/auth');
const logsRoutes = require('./logs');

const materialsRoutes = require('./materials');
const brandsRoutes = require('./brands');
const categoriesRoutes = require('./categories');
const decorsRoutes = require('./decors');
const edgeProfilesRoutes = require('./edgeProfiles');
const addOnsRoutes = require('./addOns');
const priceListsRoutes = require('./priceLists');
const companiesRoutes = require('./companies');
const importExportRoutes = require('./importExport');
const newsRoutes = require('./news');
const documentsRoutes = require('./documents');

const router = express.Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', async (req, res, next) => {
  try {
    const [activeCompanyCount, recentLogins, mostViewed] = await Promise.all([
      prisma.company.count({ where: { active: true } }),
      prisma.auditLog.findMany({
        where: { action: 'LOGIN' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { include: { company: true } } },
      }),
      prisma.productView.groupBy({
        by: ['decorId'],
        _count: { decorId: true },
        orderBy: { _count: { decorId: 'desc' } },
        take: 5,
      }),
    ]);

    const decorIds = mostViewed.map((v) => v.decorId);
    const decors = await prisma.decor.findMany({ where: { id: { in: decorIds } } });
    const decorById = new Map(decors.map((d) => [d.id, d]));
    const mostViewedWithNames = mostViewed.map((v) => ({
      decor: decorById.get(v.decorId),
      count: v._count.decorId,
    }));

    res.render('admin/dashboard', {
      title: 'Adminöversikt',
      user: req.session.user,
      activeCompanyCount,
      recentLogins,
      mostViewedWithNames,
    });
  } catch (err) {
    next(err);
  }
});

router.use(materialsRoutes);
router.use(brandsRoutes);
router.use(categoriesRoutes);
router.use(decorsRoutes);
router.use(edgeProfilesRoutes);
router.use(addOnsRoutes);
router.use(priceListsRoutes);
router.use(companiesRoutes);
router.use(importExportRoutes);
router.use(newsRoutes);
router.use(documentsRoutes);
router.use(logsRoutes);

module.exports = router;
