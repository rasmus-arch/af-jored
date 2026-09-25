const express = require('express');
const { query, mapRow, mapRows } = require('../../lib/db');
const { uploadImage, imagePublicUrl } = require('../../middleware/upload');
const { verifyCsrfAfterUpload } = require('../../middleware/csrf');

const router = express.Router();

async function getMaterialsWithThicknesses() {
  const [materials, thicknesses] = await Promise.all([
    mapRows(await query('SELECT * FROM materials WHERE active = 1 ORDER BY sort_order ASC')),
    mapRows(await query('SELECT * FROM thicknesses WHERE active = 1 ORDER BY value_mm ASC')),
  ]);
  const thicknessesByMaterialId = new Map();
  for (const t of thicknesses) {
    if (!thicknessesByMaterialId.has(t.materialId)) thicknessesByMaterialId.set(t.materialId, []);
    thicknessesByMaterialId.get(t.materialId).push(t);
  }
  for (const m of materials) {
    m.thicknesses = thicknessesByMaterialId.get(m.id) || [];
  }
  return materials;
}

async function findEdgeProfileById(id) {
  const rows = await query('SELECT * FROM edge_profiles WHERE id = ?', [id]);
  return mapRow(rows[0]) || null;
}

router.get('/kantprofiler', async (req, res, next) => {
  try {
    const edgeProfiles = mapRows(await query('SELECT * FROM edge_profiles ORDER BY name ASC'));
    res.render('admin/edgeProfiles/list', { title: 'Kantprofiler', edgeProfiles });
  } catch (err) {
    next(err);
  }
});

router.get('/kantprofiler/nytt', async (req, res, next) => {
  try {
    const materials = await getMaterialsWithThicknesses();
    res.render('admin/edgeProfiles/form', { title: 'Ny kantprofil', edgeProfile: null, materials, selectedCompatibilities: [], error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/kantprofiler', uploadImage.single('image'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    const { name, description, priceUnit } = req.body;
    const materials = await getMaterialsWithThicknesses();
    if (!name || !name.trim()) {
      return res.status(400).render('admin/edgeProfiles/form', {
        title: 'Ny kantprofil', edgeProfile: req.body, materials, selectedCompatibilities: [], error: 'Namn krävs.',
      });
    }

    const result = await query(
      'INSERT INTO edge_profiles (name, description, price_unit, image_url, active) VALUES (?, ?, ?, ?, 1)',
      [name.trim(), description || null, priceUnit === 'STYCK' ? 'STYCK' : 'LOPMETER', req.file ? imagePublicUrl(req.file.filename) : null]
    );

    const compatKeys = [].concat(req.body.compatibility || []);
    for (const key of compatKeys) {
      const [materialId, thicknessId] = key.split(':').map(Number);
      await query('INSERT INTO edge_profile_compatibilities (edge_profile_id, material_id, thickness_id) VALUES (?, ?, ?)', [
        result.insertId,
        materialId,
        thicknessId,
      ]);
    }

    res.redirect('/admin/kantprofiler');
  } catch (err) {
    next(err);
  }
});

router.get('/kantprofiler/:id/redigera', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const edgeProfile = await findEdgeProfileById(id);
    if (!edgeProfile) return res.status(404).render('error', { title: 'Hittades inte', message: 'Kantprofilen kunde inte hittas.' });
    const materials = await getMaterialsWithThicknesses();
    const compatibilities = mapRows(await query('SELECT * FROM edge_profile_compatibilities WHERE edge_profile_id = ?', [id]));
    const selectedCompatibilities = compatibilities.map((c) => `${c.materialId}:${c.thicknessId}`);
    res.render('admin/edgeProfiles/form', { title: `Redigera ${edgeProfile.name}`, edgeProfile, materials, selectedCompatibilities, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/kantprofiler/:id', uploadImage.single('image'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const edgeProfile = await findEdgeProfileById(id);
    if (!edgeProfile) return res.status(404).render('error', { title: 'Hittades inte', message: 'Kantprofilen kunde inte hittas.' });

    const { name, description, priceUnit } = req.body;
    const materials = await getMaterialsWithThicknesses();
    if (!name || !name.trim()) {
      return res.status(400).render('admin/edgeProfiles/form', {
        title: `Redigera ${edgeProfile.name}`,
        edgeProfile: { ...edgeProfile, name, description },
        materials,
        selectedCompatibilities: [].concat(req.body.compatibility || []),
        error: 'Namn krävs.',
      });
    }

    await query(
      `UPDATE edge_profiles SET name = ?, description = ?, price_unit = ?${req.file ? ', image_url = ?' : ''} WHERE id = ?`,
      req.file
        ? [name.trim(), description || null, priceUnit === 'STYCK' ? 'STYCK' : 'LOPMETER', imagePublicUrl(req.file.filename), id]
        : [name.trim(), description || null, priceUnit === 'STYCK' ? 'STYCK' : 'LOPMETER', id]
    );

    await query('DELETE FROM edge_profile_compatibilities WHERE edge_profile_id = ?', [id]);
    const compatKeys = [].concat(req.body.compatibility || []);
    for (const key of compatKeys) {
      const [materialId, thicknessId] = key.split(':').map(Number);
      await query('INSERT INTO edge_profile_compatibilities (edge_profile_id, material_id, thickness_id) VALUES (?, ?, ?)', [
        id,
        materialId,
        thicknessId,
      ]);
    }

    res.redirect('/admin/kantprofiler');
  } catch (err) {
    next(err);
  }
});

router.post('/kantprofiler/:id/vaxla-aktiv', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const edgeProfile = await findEdgeProfileById(id);
    if (!edgeProfile) return res.status(404).render('error', { title: 'Hittades inte', message: 'Kantprofilen kunde inte hittas.' });
    await query('UPDATE edge_profiles SET active = ? WHERE id = ?', [edgeProfile.active ? 0 : 1, id]);
    res.redirect('/admin/kantprofiler');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
