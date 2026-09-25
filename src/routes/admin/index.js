const express = require('express');
const { query, mapRow } = require('../../lib/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const logsRoutes = require('./logs');

const materialsRoutes = require('./materials');
const brandsRoutes = require('./brands');
const categoriesRoutes = require('./categories');
const decorsRoutes = require('./decors');
const productsRoutes = require('./products');
const edgeProfilesRoutes = require('./edgeProfiles');
const addOnsRoutes = require('./addOns');
const priceListsRoutes = require('./priceLists');
const companiesRoutes = require('./companies');
const importExportRoutes = require('./importExport');
const newsRoutes = require('./news');
const documentsRoutes = require('./documents');
const settingsRoutes = require('./settings');

const router = express.Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', async (req, res, next) => {
  try {
    const [countRows, loginRows, mostViewedRows] = await Promise.all([
      query('SELECT COUNT(*) AS n FROM companies WHERE active = 1'),
      query(
        `SELECT l.*, u.email AS u_email, u.role AS u_role, c.name AS c_name
         FROM audit_logs l
         LEFT JOIN users u ON u.id = l.user_id
         LEFT JOIN companies c ON c.id = u.company_id
         WHERE l.action = 'LOGIN'
         ORDER BY l.created_at DESC
         LIMIT 10`
      ),
      query(
        `SELECT decor_id, COUNT(*) AS n
         FROM product_views
         GROUP BY decor_id
         ORDER BY n DESC
         LIMIT 5`
      ),
    ]);
    const activeCompanyCount = countRows[0].n;
    const recentLogins = loginRows.map((row) => {
      const log = mapRow(row);
      log.user = row.u_email
        ? { email: row.u_email, role: row.u_role, company: row.c_name ? { name: row.c_name } : null }
        : null;
      return log;
    });

    const decorIds = mostViewedRows.map((v) => v.decor_id);
    let decorById = new Map();
    if (decorIds.length > 0) {
      const decors = await query('SELECT * FROM decors WHERE id IN (?)', [decorIds]);
      decorById = new Map(decors.map((d) => [d.id, mapRow(d)]));
    }
    const mostViewedWithNames = mostViewedRows.map((v) => ({
      decor: decorById.get(v.decor_id),
      count: v.n,
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
router.use(productsRoutes);
router.use(edgeProfilesRoutes);
router.use(addOnsRoutes);
router.use(priceListsRoutes);
router.use(companiesRoutes);
router.use(importExportRoutes);
router.use(newsRoutes);
router.use(documentsRoutes);
router.use(settingsRoutes);
router.use(logsRoutes);

module.exports = router;
