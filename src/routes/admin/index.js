const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', (req, res) => {
  res.render('admin/dashboard', { title: 'Adminöversikt', user: req.session.user });
});

module.exports = router;
