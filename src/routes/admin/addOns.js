const express = require('express');
const { query, mapRow, mapRows } = require('../../lib/db');

const router = express.Router();

async function listActiveMaterials() {
  return mapRows(await query('SELECT * FROM materials WHERE active = 1 ORDER BY sort_order ASC'));
}

async function findAddOnById(id) {
  const rows = await query('SELECT * FROM add_ons WHERE id = ?', [id]);
  return mapRow(rows[0]) || null;
}

router.get('/tillval', async (req, res, next) => {
  try {
    const addOns = mapRows(await query('SELECT * FROM add_ons ORDER BY name ASC'));
    res.render('admin/addOns/list', { title: 'Tillval', addOns });
  } catch (err) {
    next(err);
  }
});

router.get('/tillval/nytt', async (req, res, next) => {
  try {
    const materials = await listActiveMaterials();
    res.render('admin/addOns/form', { title: 'Nytt tillval', addOn: null, materials, selectedMaterialIds: [], error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/tillval', async (req, res, next) => {
  try {
    const { name, description, priceUnit } = req.body;
    const materials = await listActiveMaterials();
    if (!name || !name.trim()) {
      return res.status(400).render('admin/addOns/form', {
        title: 'Nytt tillval', addOn: req.body, materials, selectedMaterialIds: [].concat(req.body.materialIds || []).map(Number), error: 'Namn krävs.',
      });
    }

    const result = await query('INSERT INTO add_ons (name, description, price_unit, active) VALUES (?, ?, ?, 1)', [
      name.trim(),
      description || null,
      priceUnit === 'STYCK' ? 'STYCK' : 'LOPMETER',
    ]);

    const materialIds = [].concat(req.body.materialIds || []).map(Number);
    for (const materialId of materialIds) {
      await query('INSERT INTO add_on_materials (add_on_id, material_id) VALUES (?, ?)', [result.insertId, materialId]);
    }

    res.redirect('/admin/tillval');
  } catch (err) {
    next(err);
  }
});

router.get('/tillval/:id/redigera', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const addOn = await findAddOnById(id);
    if (!addOn) return res.status(404).render('error', { title: 'Hittades inte', message: 'Tillvalet kunde inte hittas.' });
    const materials = await listActiveMaterials();
    const links = mapRows(await query('SELECT * FROM add_on_materials WHERE add_on_id = ?', [id]));
    res.render('admin/addOns/form', {
      title: `Redigera ${addOn.name}`, addOn, materials, selectedMaterialIds: links.map((l) => l.materialId), error: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/tillval/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const addOn = await findAddOnById(id);
    if (!addOn) return res.status(404).render('error', { title: 'Hittades inte', message: 'Tillvalet kunde inte hittas.' });

    const { name, description, priceUnit } = req.body;
    const materials = await listActiveMaterials();
    if (!name || !name.trim()) {
      return res.status(400).render('admin/addOns/form', {
        title: `Redigera ${addOn.name}`,
        addOn: { ...addOn, name, description },
        materials,
        selectedMaterialIds: [].concat(req.body.materialIds || []).map(Number),
        error: 'Namn krävs.',
      });
    }

    await query('UPDATE add_ons SET name = ?, description = ?, price_unit = ? WHERE id = ?', [
      name.trim(),
      description || null,
      priceUnit === 'STYCK' ? 'STYCK' : 'LOPMETER',
      id,
    ]);

    await query('DELETE FROM add_on_materials WHERE add_on_id = ?', [id]);
    const materialIds = [].concat(req.body.materialIds || []).map(Number);
    for (const materialId of materialIds) {
      await query('INSERT INTO add_on_materials (add_on_id, material_id) VALUES (?, ?)', [id, materialId]);
    }

    res.redirect('/admin/tillval');
  } catch (err) {
    next(err);
  }
});

router.post('/tillval/:id/vaxla-aktiv', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const addOn = await findAddOnById(id);
    if (!addOn) return res.status(404).render('error', { title: 'Hittades inte', message: 'Tillvalet kunde inte hittas.' });
    await query('UPDATE add_ons SET active = ? WHERE id = ?', [addOn.active ? 0 : 1, id]);
    res.redirect('/admin/tillval');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
