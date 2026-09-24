const express = require('express');
const prisma = require('../../lib/prisma');
const { uploadImage, imagePublicUrl } = require('../../middleware/upload');

const router = express.Router();

router.get('/varumarken', async (req, res, next) => {
  try {
    const brands = await prisma.brand.findMany({ orderBy: { name: 'asc' } });
    res.render('admin/brands/list', { title: 'Varumärken', brands });
  } catch (err) {
    next(err);
  }
});

router.get('/varumarken/nytt', (req, res) => {
  res.render('admin/brands/form', { title: 'Nytt varumärke', brand: null, error: null });
});

router.post('/varumarken', uploadImage.single('logo'), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).render('admin/brands/form', { title: 'Nytt varumärke', brand: req.body, error: 'Namn krävs.' });
    }
    await prisma.brand.create({
      data: { name: name.trim(), logoUrl: req.file ? imagePublicUrl(req.file.filename) : null, active: true },
    });
    res.redirect('/admin/varumarken');
  } catch (err) {
    next(err);
  }
});

router.get('/varumarken/:id/redigera', async (req, res, next) => {
  try {
    const brand = await prisma.brand.findUnique({ where: { id: Number(req.params.id) } });
    if (!brand) return res.status(404).render('error', { title: 'Hittades inte', message: 'Varumärket kunde inte hittas.' });
    res.render('admin/brands/form', { title: `Redigera ${brand.name}`, brand, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/varumarken/:id', uploadImage.single('logo'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const brand = await prisma.brand.findUnique({ where: { id } });
    if (!brand) return res.status(404).render('error', { title: 'Hittades inte', message: 'Varumärket kunde inte hittas.' });

    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).render('admin/brands/form', { title: `Redigera ${brand.name}`, brand: { ...brand, name }, error: 'Namn krävs.' });
    }

    await prisma.brand.update({
      where: { id },
      data: { name: name.trim(), ...(req.file ? { logoUrl: imagePublicUrl(req.file.filename) } : {}) },
    });
    res.redirect('/admin/varumarken');
  } catch (err) {
    next(err);
  }
});

router.post('/varumarken/:id/vaxla-aktiv', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const brand = await prisma.brand.findUnique({ where: { id } });
    if (!brand) return res.status(404).render('error', { title: 'Hittades inte', message: 'Varumärket kunde inte hittas.' });
    await prisma.brand.update({ where: { id }, data: { active: !brand.active } });
    res.redirect('/admin/varumarken');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
