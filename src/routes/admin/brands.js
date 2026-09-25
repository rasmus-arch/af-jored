const express = require('express');
const { query, mapRow, mapRows } = require('../../lib/db');
const { uploadImage, imagePublicUrl } = require('../../middleware/upload');
const { verifyCsrfAfterUpload } = require('../../middleware/csrf');

const router = express.Router();

async function findBrandById(id) {
  const rows = await query('SELECT * FROM brands WHERE id = ?', [id]);
  return mapRow(rows[0]) || null;
}

router.get('/varumarken', async (req, res, next) => {
  try {
    const brands = mapRows(await query('SELECT * FROM brands ORDER BY name ASC'));
    res.render('admin/brands/list', { title: 'Varumärken', brands });
  } catch (err) {
    next(err);
  }
});

router.get('/varumarken/nytt', (req, res) => {
  res.render('admin/brands/form', { title: 'Nytt varumärke', brand: null, error: null });
});

router.post('/varumarken', uploadImage.single('logo'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).render('admin/brands/form', { title: 'Nytt varumärke', brand: req.body, error: 'Namn krävs.' });
    }
    await query('INSERT INTO brands (name, logo_url, active) VALUES (?, ?, 1)', [
      name.trim(),
      req.file ? imagePublicUrl(req.file.filename) : null,
    ]);
    res.redirect('/admin/varumarken');
  } catch (err) {
    next(err);
  }
});

router.get('/varumarken/:id/redigera', async (req, res, next) => {
  try {
    const brand = await findBrandById(Number(req.params.id));
    if (!brand) return res.status(404).render('error', { title: 'Hittades inte', message: 'Varumärket kunde inte hittas.' });
    res.render('admin/brands/form', { title: `Redigera ${brand.name}`, brand, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/varumarken/:id', uploadImage.single('logo'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const brand = await findBrandById(id);
    if (!brand) return res.status(404).render('error', { title: 'Hittades inte', message: 'Varumärket kunde inte hittas.' });

    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).render('admin/brands/form', { title: `Redigera ${brand.name}`, brand: { ...brand, name }, error: 'Namn krävs.' });
    }

    await query(
      `UPDATE brands SET name = ?${req.file ? ', logo_url = ?' : ''} WHERE id = ?`,
      req.file ? [name.trim(), imagePublicUrl(req.file.filename), id] : [name.trim(), id]
    );
    res.redirect('/admin/varumarken');
  } catch (err) {
    next(err);
  }
});

router.post('/varumarken/:id/vaxla-aktiv', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const brand = await findBrandById(id);
    if (!brand) return res.status(404).render('error', { title: 'Hittades inte', message: 'Varumärket kunde inte hittas.' });
    await query('UPDATE brands SET active = ? WHERE id = ?', [brand.active ? 0 : 1, id]);
    res.redirect('/admin/varumarken');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
