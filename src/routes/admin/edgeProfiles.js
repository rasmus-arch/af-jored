const express = require('express');
const prisma = require('../../lib/prisma');
const { uploadImage, imagePublicUrl } = require('../../middleware/upload');
const { verifyCsrfAfterUpload } = require('../../middleware/csrf');

const router = express.Router();

async function getMaterialsWithThicknesses() {
  return prisma.material.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    include: { thicknesses: { where: { active: true }, orderBy: { valueMm: 'asc' } } },
  });
}

router.get('/kantprofiler', async (req, res, next) => {
  try {
    const edgeProfiles = await prisma.edgeProfile.findMany({ orderBy: { name: 'asc' } });
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

    const edgeProfile = await prisma.edgeProfile.create({
      data: {
        name: name.trim(),
        description: description || null,
        priceUnit: priceUnit === 'STYCK' ? 'STYCK' : 'LOPMETER',
        imageUrl: req.file ? imagePublicUrl(req.file.filename) : null,
        active: true,
      },
    });

    const compatKeys = [].concat(req.body.compatibility || []);
    for (const key of compatKeys) {
      const [materialId, thicknessId] = key.split(':').map(Number);
      await prisma.edgeProfileCompatibility.create({ data: { edgeProfileId: edgeProfile.id, materialId, thicknessId } });
    }

    res.redirect('/admin/kantprofiler');
  } catch (err) {
    next(err);
  }
});

router.get('/kantprofiler/:id/redigera', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const edgeProfile = await prisma.edgeProfile.findUnique({ where: { id } });
    if (!edgeProfile) return res.status(404).render('error', { title: 'Hittades inte', message: 'Kantprofilen kunde inte hittas.' });
    const materials = await getMaterialsWithThicknesses();
    const compatibilities = await prisma.edgeProfileCompatibility.findMany({ where: { edgeProfileId: id } });
    const selectedCompatibilities = compatibilities.map((c) => `${c.materialId}:${c.thicknessId}`);
    res.render('admin/edgeProfiles/form', { title: `Redigera ${edgeProfile.name}`, edgeProfile, materials, selectedCompatibilities, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/kantprofiler/:id', uploadImage.single('image'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const edgeProfile = await prisma.edgeProfile.findUnique({ where: { id } });
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

    await prisma.edgeProfile.update({
      where: { id },
      data: {
        name: name.trim(),
        description: description || null,
        priceUnit: priceUnit === 'STYCK' ? 'STYCK' : 'LOPMETER',
        ...(req.file ? { imageUrl: imagePublicUrl(req.file.filename) } : {}),
      },
    });

    await prisma.edgeProfileCompatibility.deleteMany({ where: { edgeProfileId: id } });
    const compatKeys = [].concat(req.body.compatibility || []);
    for (const key of compatKeys) {
      const [materialId, thicknessId] = key.split(':').map(Number);
      await prisma.edgeProfileCompatibility.create({ data: { edgeProfileId: id, materialId, thicknessId } });
    }

    res.redirect('/admin/kantprofiler');
  } catch (err) {
    next(err);
  }
});

router.post('/kantprofiler/:id/vaxla-aktiv', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const edgeProfile = await prisma.edgeProfile.findUnique({ where: { id } });
    if (!edgeProfile) return res.status(404).render('error', { title: 'Hittades inte', message: 'Kantprofilen kunde inte hittas.' });
    await prisma.edgeProfile.update({ where: { id }, data: { active: !edgeProfile.active } });
    res.redirect('/admin/kantprofiler');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
