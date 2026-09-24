const express = require('express');
const prisma = require('../../lib/prisma');
const { uploadImage, imagePublicUrl } = require('../../middleware/upload');
const { verifyCsrfAfterUpload } = require('../../middleware/csrf');

const router = express.Router();

router.get('/material', async (req, res, next) => {
  try {
    const materials = await prisma.material.findMany({ orderBy: { sortOrder: 'asc' } });
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

    await prisma.material.create({
      data: {
        name: name.trim(),
        description: description || null,
        sortOrder: sortOrder ? Number(sortOrder) : 0,
        imageUrl: req.file ? imagePublicUrl(req.file.filename) : null,
        active: true,
      },
    });
    res.redirect('/admin/material');
  } catch (err) {
    next(err);
  }
});

router.get('/material/:id/redigera', async (req, res, next) => {
  try {
    const material = await prisma.material.findUnique({ where: { id: Number(req.params.id) } });
    if (!material) return res.status(404).render('error', { title: 'Hittades inte', message: 'Materialet kunde inte hittas.' });
    const thicknesses = await prisma.thickness.findMany({ where: { materialId: material.id }, orderBy: { sortOrder: 'asc' } });
    res.render('admin/materials/form', { title: `Redigera ${material.name}`, material, thicknesses, error: null, thicknessError: null });
  } catch (err) {
    next(err);
  }
});

router.post('/material/:id/tjocklekar', async (req, res, next) => {
  try {
    const materialId = Number(req.params.id);
    const material = await prisma.material.findUnique({ where: { id: materialId } });
    if (!material) return res.status(404).render('error', { title: 'Hittades inte', message: 'Materialet kunde inte hittas.' });

    const valueMm = Number(req.body.valueMm);
    const thicknesses = await prisma.thickness.findMany({ where: { materialId }, orderBy: { sortOrder: 'asc' } });

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

    await prisma.thickness.create({
      data: { materialId, valueMm, sortOrder: thicknesses.length, active: true },
    });
    res.redirect(`/admin/material/${materialId}/redigera`);
  } catch (err) {
    next(err);
  }
});

router.post('/material/:id/tjocklekar/:thicknessId/vaxla-aktiv', async (req, res, next) => {
  try {
    const materialId = Number(req.params.id);
    const thicknessId = Number(req.params.thicknessId);
    const thickness = await prisma.thickness.findFirst({ where: { id: thicknessId, materialId } });
    if (!thickness) return res.status(404).render('error', { title: 'Hittades inte', message: 'Tjockleken kunde inte hittas.' });
    await prisma.thickness.update({ where: { id: thicknessId }, data: { active: !thickness.active } });
    res.redirect(`/admin/material/${materialId}/redigera`);
  } catch (err) {
    next(err);
  }
});

router.post('/material/:id', uploadImage.single('image'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const material = await prisma.material.findUnique({ where: { id } });
    if (!material) return res.status(404).render('error', { title: 'Hittades inte', message: 'Materialet kunde inte hittas.' });

    const { name, description, sortOrder } = req.body;
    if (!name || !name.trim()) {
      const thicknesses = await prisma.thickness.findMany({ where: { materialId: id }, orderBy: { sortOrder: 'asc' } });
      return res.status(400).render('admin/materials/form', {
        title: `Redigera ${material.name}`,
        material: { ...material, name, description, sortOrder },
        thicknesses,
        error: 'Namn krävs.',
        thicknessError: null,
      });
    }

    await prisma.material.update({
      where: { id },
      data: {
        name: name.trim(),
        description: description || null,
        sortOrder: sortOrder ? Number(sortOrder) : 0,
        ...(req.file ? { imageUrl: imagePublicUrl(req.file.filename) } : {}),
      },
    });
    res.redirect('/admin/material');
  } catch (err) {
    next(err);
  }
});

router.post('/material/:id/vaxla-aktiv', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const material = await prisma.material.findUnique({ where: { id } });
    if (!material) return res.status(404).render('error', { title: 'Hittades inte', message: 'Materialet kunde inte hittas.' });
    await prisma.material.update({ where: { id }, data: { active: !material.active } });
    res.redirect('/admin/material');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
