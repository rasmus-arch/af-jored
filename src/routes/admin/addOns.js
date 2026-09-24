const express = require('express');
const prisma = require('../../lib/prisma');

const router = express.Router();

router.get('/tillval', async (req, res, next) => {
  try {
    const addOns = await prisma.addOn.findMany({ orderBy: { name: 'asc' } });
    res.render('admin/addOns/list', { title: 'Tillval', addOns });
  } catch (err) {
    next(err);
  }
});

router.get('/tillval/nytt', async (req, res, next) => {
  try {
    const materials = await prisma.material.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
    res.render('admin/addOns/form', { title: 'Nytt tillval', addOn: null, materials, selectedMaterialIds: [], error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/tillval', async (req, res, next) => {
  try {
    const { name, description, priceUnit } = req.body;
    const materials = await prisma.material.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
    if (!name || !name.trim()) {
      return res.status(400).render('admin/addOns/form', {
        title: 'Nytt tillval', addOn: req.body, materials, selectedMaterialIds: [].concat(req.body.materialIds || []).map(Number), error: 'Namn krävs.',
      });
    }

    const addOn = await prisma.addOn.create({
      data: { name: name.trim(), description: description || null, priceUnit: priceUnit === 'STYCK' ? 'STYCK' : 'LOPMETER', active: true },
    });

    const materialIds = [].concat(req.body.materialIds || []).map(Number);
    for (const materialId of materialIds) {
      await prisma.addOnMaterial.create({ data: { addOnId: addOn.id, materialId } });
    }

    res.redirect('/admin/tillval');
  } catch (err) {
    next(err);
  }
});

router.get('/tillval/:id/redigera', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const addOn = await prisma.addOn.findUnique({ where: { id } });
    if (!addOn) return res.status(404).render('error', { title: 'Hittades inte', message: 'Tillvalet kunde inte hittas.' });
    const materials = await prisma.material.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
    const links = await prisma.addOnMaterial.findMany({ where: { addOnId: id } });
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
    const addOn = await prisma.addOn.findUnique({ where: { id } });
    if (!addOn) return res.status(404).render('error', { title: 'Hittades inte', message: 'Tillvalet kunde inte hittas.' });

    const { name, description, priceUnit } = req.body;
    const materials = await prisma.material.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
    if (!name || !name.trim()) {
      return res.status(400).render('admin/addOns/form', {
        title: `Redigera ${addOn.name}`,
        addOn: { ...addOn, name, description },
        materials,
        selectedMaterialIds: [].concat(req.body.materialIds || []).map(Number),
        error: 'Namn krävs.',
      });
    }

    await prisma.addOn.update({
      where: { id },
      data: { name: name.trim(), description: description || null, priceUnit: priceUnit === 'STYCK' ? 'STYCK' : 'LOPMETER' },
    });

    await prisma.addOnMaterial.deleteMany({ where: { addOnId: id } });
    const materialIds = [].concat(req.body.materialIds || []).map(Number);
    for (const materialId of materialIds) {
      await prisma.addOnMaterial.create({ data: { addOnId: id, materialId } });
    }

    res.redirect('/admin/tillval');
  } catch (err) {
    next(err);
  }
});

router.post('/tillval/:id/vaxla-aktiv', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const addOn = await prisma.addOn.findUnique({ where: { id } });
    if (!addOn) return res.status(404).render('error', { title: 'Hittades inte', message: 'Tillvalet kunde inte hittas.' });
    await prisma.addOn.update({ where: { id }, data: { active: !addOn.active } });
    res.redirect('/admin/tillval');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
