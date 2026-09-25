const express = require('express');
const { query, mapRow, mapRows } = require('../../lib/db');

const router = express.Router();

async function listCategories() {
  return mapRows(await query('SELECT * FROM decor_categories ORDER BY sort_order ASC'));
}

router.get('/dekorkategorier', async (req, res, next) => {
  try {
    const categories = await listCategories();
    res.render('admin/categories/list', { title: 'Dekorkategorier', categories, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/dekorkategorier', async (req, res, next) => {
  try {
    const { name, sortOrder } = req.body;
    if (!name || !name.trim()) {
      const categories = await listCategories();
      return res.status(400).render('admin/categories/list', { title: 'Dekorkategorier', categories, error: 'Namn krävs.' });
    }
    await query('INSERT INTO decor_categories (name, sort_order, active) VALUES (?, ?, 1)', [
      name.trim(),
      sortOrder ? Number(sortOrder) : 0,
    ]);
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
    await query('UPDATE decor_categories SET name = ?, sort_order = ? WHERE id = ?', [
      name.trim(),
      sortOrder ? Number(sortOrder) : 0,
      id,
    ]);
    res.redirect('/admin/dekorkategorier');
  } catch (err) {
    next(err);
  }
});

router.post('/dekorkategorier/:id/vaxla-aktiv', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await query('SELECT * FROM decor_categories WHERE id = ?', [id]);
    const category = mapRow(rows[0]);
    if (!category) return res.status(404).render('error', { title: 'Hittades inte', message: 'Kategorin kunde inte hittas.' });
    await query('UPDATE decor_categories SET active = ? WHERE id = ?', [category.active ? 0 : 1, id]);
    res.redirect('/admin/dekorkategorier');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
