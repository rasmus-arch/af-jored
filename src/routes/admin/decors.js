const express = require('express');
const prisma = require('../../lib/prisma');
const { uploadImage, imagePublicUrl } = require('../../middleware/upload');
const { verifyCsrfAfterUpload } = require('../../middleware/csrf');

const router = express.Router();

async function getFormOptions() {
  const [materials, categories] = await Promise.all([
    prisma.material.findMany({ orderBy: { sortOrder: 'asc' }, include: { thicknesses: { orderBy: { valueMm: 'asc' } } } }),
    prisma.decorCategory.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);
  return { materials, categories };
}

router.get('/dekorer', async (req, res, next) => {
  try {
    const decors = await prisma.decor.findMany({
      include: { material: true, category: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
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

    const existing = await prisma.decor.findUnique({ where: { articleCode: data.articleCode } });
    if (existing) {
      return res.status(400).render('admin/decors/form', {
        title: 'Ny dekor', decor: { ...data }, selectedThicknessIds: thicknessIds, ...options,
        error: `Artikelkoden ${data.articleCode} används redan.`,
      });
    }

    const decor = await prisma.decor.create({
      data: { ...data, imageUrl: req.file ? imagePublicUrl(req.file.filename) : null },
    });

    for (const thicknessId of thicknessIds) {
      await prisma.decorThickness.create({ data: { decorId: decor.id, thicknessId, active: true } });
    }

    res.redirect('/admin/dekorer');
  } catch (err) {
    next(err);
  }
});

router.get('/dekorer/:id/redigera', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const decor = await prisma.decor.findUnique({ where: { id } });
    if (!decor) return res.status(404).render('error', { title: 'Hittades inte', message: 'Dekoren kunde inte hittas.' });
    const options = await getFormOptions();
    const links = await prisma.decorThickness.findMany({ where: { decorId: id } });
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
    const decor = await prisma.decor.findUnique({ where: { id } });
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

    const existing = await prisma.decor.findUnique({ where: { articleCode: data.articleCode } });
    if (existing && existing.id !== id) {
      return res.status(400).render('admin/decors/form', {
        title: `Redigera ${decor.name}`, decor: { ...decor, ...data }, selectedThicknessIds: thicknessIds, ...options,
        error: `Artikelkoden ${data.articleCode} används redan.`,
      });
    }

    await prisma.decor.update({
      where: { id },
      data: { ...data, ...(req.file ? { imageUrl: imagePublicUrl(req.file.filename) } : {}) },
    });

    await prisma.decorThickness.deleteMany({ where: { decorId: id } });
    for (const thicknessId of thicknessIds) {
      await prisma.decorThickness.create({ data: { decorId: id, thicknessId, active: true } });
    }

    res.redirect('/admin/dekorer');
  } catch (err) {
    next(err);
  }
});

router.post('/dekorer/:id/inaktivera', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const decor = await prisma.decor.findUnique({ where: { id } });
    if (!decor) return res.status(404).render('error', { title: 'Hittades inte', message: 'Dekoren kunde inte hittas.' });
    await prisma.decor.update({ where: { id }, data: { status: decor.status === 'UTGATT' ? 'AKTIV' : 'UTGATT' } });
    res.redirect('/admin/dekorer');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
