const express = require('express');
const prisma = require('../../lib/prisma');
const { requireAuth, requireRole } = require('../../middleware/auth');
const sortimentRoutes = require('./sortiment');
const kalkylatorRoutes = require('./kalkylator');

const router = express.Router();

router.use(requireAuth, requireRole('RESELLER'));
router.use(sortimentRoutes);
router.use(kalkylatorRoutes);

router.get('/', async (req, res, next) => {
  try {
    // companyId hämtas alltid från den inloggade användarens session, aldrig
    // från query/body, så en återförsäljare bara kan se sitt eget företag.
    const company = await prisma.company.findUnique({ where: { id: req.session.user.companyId } });
    res.render('reseller/dashboard', { title: 'Min sida', user: req.session.user, company });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
