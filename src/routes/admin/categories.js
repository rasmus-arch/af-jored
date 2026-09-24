const express = require('express');
const prisma = require('../../lib/prisma');

const router = express.Router();

router.get('/dekorkategorier', async (req, res, next) => {
  try {
    const categories = await prisma.decorCategory.findMany({ orderBy: { sortOrder: 'asc' } });
    res.render('admin/categories/list', { title: 'Dekorkategorier', categories, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/dekorkategorier', async (req, res, next) => {
  try {
    const { name, sortOrder } = req.body;
    if (!name || !name.trim()) {
      const categories = await prisma.decorCategory.findMany({ orderBy: { sortOrder: 'asc' } });
      return res.status(400).render('admin/categories/list', { title: 'Dekorkategorier', categories, error: 'Namn krävs.' });
    }
    await prisma.decorCategory.create({ data: { name: name.trim(), sortOrder: sortOrder ? Number(sortOrder) : 0, active: true } });
    res.redirect('/admin/dekorkategorier');
  } catch (err) {
    next(err);
  }
});

router.post('/dekorkategorier/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, sortOrder } = req.body;
    if (!name || !name.trim()) return res.redirect('/admin/dekorkategorier');
    await prisma.decorCategory.update({ where: { id }, data: { name: name.trim(), sortOrder: sortOrder ? Number(sortOrder) : 0 } });
    res.redirect('/admin/dekorkategorier');
  } catch (err) {
    next(err);
  }
});

router.post('/dekorkategorier/:id/vaxla-aktiv', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const category = await prisma.decorCategory.findUnique({ where: { id } });
    if (!category) return res.status(404).render('error', { title: 'Hittades inte', message: 'Kategorin kunde inte hittas.' });
    await prisma.decorCategory.update({ where: { id }, data: { active: !category.active } });
    res.redirect('/admin/dekorkategorier');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
