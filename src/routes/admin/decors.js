const express = require('express');
const { query, mapRow, mapRows } = require('../../lib/db');
const { uploadImage, imagePublicUrl } = require('../../middleware/upload');
const { verifyCsrfAfterUpload } = require('../../middleware/csrf');

const router = express.Router();

async function getFormOptions() {
  const [materials, thicknesses, categories] = await Promise.all([
    mapRows(await query('SELECT * FROM materials ORDER BY sort_order ASC')),
    mapRows(await query('SELECT * FROM thicknesses ORDER BY value_mm ASC')),
    mapRows(await query('SELECT * FROM decor_categories ORDER BY sort_order ASC')),
  ]);
  const thicknessesByMaterialId = new Map();
  for (const t of thicknesses) {
    if (!thicknessesByMaterialId.has(t.materialId)) thicknessesByMaterialId.set(t.materialId, []);
    thicknessesByMaterialId.get(t.materialId).push(t);
  }
  for (const m of materials) {
    m.thicknesses = thicknessesByMaterialId.get(m.id) || [];
  }
  return { materials, categories };
}

async function findDecorById(id) {
  const rows = await query('SELECT * FROM decors WHERE id = ?', [id]);
  return mapRow(rows[0]) || null;
}

async function findDecorByArticleCode(articleCode) {
  const rows = await query('SELECT * FROM decors WHERE article_code = ?', [articleCode]);
  return mapRow(rows[0]) || null;
}

router.get('/dekorer', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT d.*, m.name AS m_name, c.name AS c_name
       FROM decors d
       JOIN materials m ON m.id = d.material_id
       JOIN decor_categories c ON c.id = d.category_id
       ORDER BY d.sort_order ASC, d.name ASC`
    );
    const decors = rows.map((row) => {
      const decor = mapRow(row);
      decor.material = { name: row.m_name };
      decor.category = { name: row.c_name };
      return decor;
    });
    res.render('admin/decors/list', { title: 'Dekorer', decors });
  } catch (err) {
    next(err);
  }
});

router.get('/dekorer/nytt', async (req, res, next) => {
  try {
    const options = await getFormOptions();
    res.render('admin/decors/form', { title: 'Ny dekor', decor: null, selectedThicknessIds: [], ...options, error: null });
  } catch (err) {
    next(err);
  }
});

function parseDecorInput(body) {
  return {
    materialId: Number(body.materialId),
    categoryId: Number(body.categoryId),
    articleCode: (body.articleCode || '').trim(),
    name: (body.name || '').trim(),
    surfaceTexture: body.surfaceTexture ? body.surfaceTexture.trim() : null,
    maxLengthMm: body.maxLengthMm ? Number(body.maxLengthMm) : null,
    status: ['AKTIV', 'UTGAENDE', 'UTGATT'].includes(body.status) ? body.status : 'AKTIV',
    notes: body.notes ? body.notes.trim() : null,
    sortOrder: body.sortOrder ? Number(body.sortOrder) : 0,
  };
}

router.post('/dekorer', uploadImage.single('image'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    const options = await getFormOptions();
    const data = parseDecorInput(req.body);
    const thicknessIds = [].concat(req.body.thicknessIds || []).map(Number);

    if (!data.articleCode || !data.name || !data.materialId || !data.categoryId) {
      return res.status(400).render('admin/decors/form', {
        title: 'Ny dekor', decor: { ...data }, selectedThicknessIds: thicknessIds, ...options,
        error: 'Artikelkod, namn, material och kategori krävs.',
      });
    }

    const existing = await findDecorByArticleCode(data.articleCode);
    if (existing) {
      return res.status(400).render('admin/decors/form', {
        title: 'Ny dekor', decor: { ...data }, selectedThicknessIds: thicknessIds, ...options,
        error: `Artikelkoden ${data.articleCode} används redan.`,
      });
    }

    const result = await query(
      `INSERT INTO decors (material_id, category_id, article_code, name, surface_texture, max_length_mm, image_url, status, notes, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        data.materialId, data.categoryId, data.articleCode, data.name, data.surfaceTexture, data.maxLengthMm,
        req.file ? imagePublicUrl(req.file.filename) : null, data.status, data.notes, data.sortOrder,
      ]
    );

    for (const thicknessId of thicknessIds) {
      await query('INSERT INTO decor_thicknesses (decor_id, thickness_id, active) VALUES (?, ?, 1)', [result.insertId, thicknessId]);
    }

    res.redirect('/admin/dekorer');
  } catch (err) {
    next(err);
  }
});

router.get('/dekorer/:id/redigera', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const decor = await findDecorById(id);
    if (!decor) return res.status(404).render('error', { title: 'Hittades inte', message: 'Dekoren kunde inte hittas.' });
    const options = await getFormOptions();
    const links = mapRows(await query('SELECT * FROM decor_thicknesses WHERE decor_id = ?', [id]));
    res.render('admin/decors/form', {
      title: `Redigera ${decor.name}`, decor, selectedThicknessIds: links.map((l) => l.thicknessId), ...options, error: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/dekorer/:id', uploadImage.single('image'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const decor = await findDecorById(id);
    if (!decor) return res.status(404).render('error', { title: 'Hittades inte', message: 'Dekoren kunde inte hittas.' });

    const options = await getFormOptions();
    const data = parseDecorInput(req.body);
    const thicknessIds = [].concat(req.body.thicknessIds || []).map(Number);

    if (!data.articleCode || !data.name || !data.materialId || !data.categoryId) {
      return res.status(400).render('admin/decors/form', {
        title: `Redigera ${decor.name}`, decor: { ...decor, ...data }, selectedThicknessIds: thicknessIds, ...options,
        error: 'Artikelkod, namn, material och kategori krävs.',
      });
    }

    const existing = await findDecorByArticleCode(data.articleCode);
    if (existing && existing.id !== id) {
      return res.status(400).render('admin/decors/form', {
        title: `Redigera ${decor.name}`, decor: { ...decor, ...data }, selectedThicknessIds: thicknessIds, ...options,
        error: `Artikelkoden ${data.articleCode} används redan.`,
      });
    }

    await query(
      `UPDATE decors SET material_id = ?, category_id = ?, article_code = ?, name = ?, surface_texture = ?, max_length_mm = ?, status = ?, notes = ?, sort_order = ?, updated_at = NOW()${req.file ? ', image_url = ?' : ''} WHERE id = ?`,
      req.file
        ? [data.materialId, data.categoryId, data.articleCode, data.name, data.surfaceTexture, data.maxLengthMm, data.status, data.notes, data.sortOrder, imagePublicUrl(req.file.filename), id]
        : [data.materialId, data.categoryId, data.articleCode, data.name, data.surfaceTexture, data.maxLengthMm, data.status, data.notes, data.sortOrder, id]
    );

    await query('DELETE FROM decor_thicknesses WHERE decor_id = ?', [id]);
    for (const thicknessId of thicknessIds) {
      await query('INSERT INTO decor_thicknesses (decor_id, thickness_id, active) VALUES (?, ?, 1)', [id, thicknessId]);
    }

    res.redirect('/admin/dekorer');
  } catch (err) {
    next(err);
  }
});

router.post('/dekorer/:id/inaktivera', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const decor = await findDecorById(id);
    if (!decor) return res.status(404).render('error', { title: 'Hittades inte', message: 'Dekoren kunde inte hittas.' });
    await query('UPDATE decors SET status = ?, updated_at = NOW() WHERE id = ?', [
      decor.status === 'UTGATT' ? 'AKTIV' : 'UTGATT',
      id,
    ]);
    res.redirect('/admin/dekorer');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
