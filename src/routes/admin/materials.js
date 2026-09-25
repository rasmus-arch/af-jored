const express = require('express');
const { query, mapRow, mapRows } = require('../../lib/db');
const { uploadImage, imagePublicUrl } = require('../../middleware/upload');
const { verifyCsrfAfterUpload } = require('../../middleware/csrf');

const router = express.Router();

async function findMaterialById(id) {
  const rows = await query('SELECT * FROM materials WHERE id = ?', [id]);
  return mapRow(rows[0]) || null;
}

async function listThicknessesForMaterial(materialId) {
  return mapRows(await query('SELECT * FROM thicknesses WHERE material_id = ? ORDER BY sort_order ASC', [materialId]));
}

router.get('/material', async (req, res, next) => {
  try {
    const materials = mapRows(await query('SELECT * FROM materials ORDER BY sort_order ASC'));
    res.render('admin/materials/list', { title: 'Material', materials });
  } catch (err) {
    next(err);
  }
});

router.get('/material/nytt', (req, res) => {
  res.render('admin/materials/form', { title: 'Nytt material', material: null, error: null });
});

router.post('/material', uploadImage.single('image'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    const { name, description, sortOrder } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).render('admin/materials/form', { title: 'Nytt material', material: req.body, error: 'Namn krävs.' });
    }

    await query(
      'INSERT INTO materials (name, description, sort_order, image_url, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())',
      [name.trim(), description || null, sortOrder ? Number(sortOrder) : 0, req.file ? imagePublicUrl(req.file.filename) : null]
    );
    res.redirect('/admin/material');
  } catch (err) {
    next(err);
  }
});

router.get('/material/:id/redigera', async (req, res, next) => {
  try {
    const material = await findMaterialById(Number(req.params.id));
    if (!material) return res.status(404).render('error', { title: 'Hittades inte', message: 'Materialet kunde inte hittas.' });
    const thicknesses = await listThicknessesForMaterial(material.id);
    res.render('admin/materials/form', { title: `Redigera ${material.name}`, material, thicknesses, error: null, thicknessError: null });
  } catch (err) {
    next(err);
  }
});

router.post('/material/:id/tjocklekar', async (req, res, next) => {
  try {
    const materialId = Number(req.params.id);
    const material = await findMaterialById(materialId);
    if (!material) return res.status(404).render('error', { title: 'Hittades inte', message: 'Materialet kunde inte hittas.' });

    const valueMm = Number(req.body.valueMm);
    const thicknesses = await listThicknessesForMaterial(materialId);

    if (!valueMm || valueMm <= 0) {
      return res.status(400).render('admin/materials/form', {
        title: `Redigera ${material.name}`,
        material,
        thicknesses,
        error: null,
        thicknessError: 'Ange en giltig tjocklek i mm.',
      });
    }
    if (thicknesses.some((t) => t.valueMm === valueMm)) {
      return res.status(400).render('admin/materials/form', {
        title: `Redigera ${material.name}`,
        material,
        thicknesses,
        error: null,
        thicknessError: `Tjockleken ${valueMm} mm finns redan för det här materialet.`,
      });
    }

    await query('INSERT INTO thicknesses (material_id, value_mm, sort_order, active) VALUES (?, ?, ?, 1)', [
      materialId,
      valueMm,
      thicknesses.length,
    ]);
    res.redirect(`/admin/material/${materialId}/redigera`);
  } catch (err) {
    next(err);
  }
});

router.post('/material/:id/tjocklekar/:thicknessId/vaxla-aktiv', async (req, res, next) => {
  try {
    const materialId = Number(req.params.id);
    const thicknessId = Number(req.params.thicknessId);
    const rows = await query('SELECT * FROM thicknesses WHERE id = ? AND material_id = ?', [thicknessId, materialId]);
    const thickness = mapRow(rows[0]);
    if (!thickness) return res.status(404).render('error', { title: 'Hittades inte', message: 'Tjockleken kunde inte hittas.' });
    await query('UPDATE thicknesses SET active = ? WHERE id = ?', [thickness.active ? 0 : 1, thicknessId]);
    res.redirect(`/admin/material/${materialId}/redigera`);
  } catch (err) {
    next(err);
  }
});

router.post('/material/:id', uploadImage.single('image'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const material = await findMaterialById(id);
    if (!material) return res.status(404).render('error', { title: 'Hittades inte', message: 'Materialet kunde inte hittas.' });

    const { name, description, sortOrder } = req.body;
    if (!name || !name.trim()) {
      const thicknesses = await listThicknessesForMaterial(id);
      return res.status(400).render('admin/materials/form', {
        title: `Redigera ${material.name}`,
        material: { ...material, name, description, sortOrder },
        thicknesses,
        error: 'Namn krävs.',
        thicknessError: null,
      });
    }

    await query(
      `UPDATE materials SET name = ?, description = ?, sort_order = ?, updated_at = NOW()${req.file ? ', image_url = ?' : ''} WHERE id = ?`,
      req.file
        ? [name.trim(), description || null, sortOrder ? Number(sortOrder) : 0, imagePublicUrl(req.file.filename), id]
        : [name.trim(), description || null, sortOrder ? Number(sortOrder) : 0, id]
    );
    res.redirect('/admin/material');
  } catch (err) {
    next(err);
  }
});

router.post('/material/:id/vaxla-aktiv', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const material = await findMaterialById(id);
    if (!material) return res.status(404).render('error', { title: 'Hittades inte', message: 'Materialet kunde inte hittas.' });
    await query('UPDATE materials SET active = ?, updated_at = NOW() WHERE id = ?', [material.active ? 0 : 1, id]);
    res.redirect('/admin/material');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
