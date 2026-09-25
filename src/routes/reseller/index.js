const express = require('express');
const { query, mapRows } = require('../../lib/db');
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
    const newsPosts = mapRows(
      await query('SELECT * FROM news_posts WHERE active = 1 ORDER BY published_at DESC LIMIT 5')
    );
    res.render('reseller/dashboard', { title: 'Startsida', user: req.session.user, newsPosts });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
