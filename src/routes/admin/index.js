const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth');

const materialsRoutes = require('./materials');
const brandsRoutes = require('./brands');
const categoriesRoutes = require('./categories');
const decorsRoutes = require('./decors');
const edgeProfilesRoutes = require('./edgeProfiles');
const addOnsRoutes = require('./addOns');

const router = express.Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', (req, res) => {
  res.render('admin/dashboard', { title: 'Adminöversikt', user: req.session.user });
});

router.use(materialsRoutes);
router.use(brandsRoutes);
router.use(categoriesRoutes);
router.use(decorsRoutes);
router.use(edgeProfilesRoutes);
router.use(addOnsRoutes);

module.exports = router;
