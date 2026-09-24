const express = require('express');
const prisma = require('../../lib/prisma');
const { uploadImage, imagePublicUrl } = require('../../middleware/upload');
const { verifyCsrfAfterUpload } = require('../../middleware/csrf');

const router = express.Router();

const PRODUCT_TYPES = [
  { value: 'DISKHO', label: 'Diskho' },
  { value: 'BLANDARE', label: 'Blandare' },
  { value: 'TILLBEHOR', label: 'Tillbehör' },
];

async function getFormOptions() {
  const brands = await prisma.brand.findMany({ orderBy: { name: 'asc' } });
  return { brands, productTypes: PRODUCT_TYPES };
}

router.get('/produkter', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      include: { brand: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.render('admin/products/list', { title: 'Produkter', products, productTypes: PRODUCT_TYPES });
  } catch (err) {
    next(err);
  }
});

router.get('/produkter/nytt', async (req, res, next) => {
  try {
    const options = await getFormOptions();
    res.render('admin/products/form', { title: 'Ny produkt', product: null, ...options, error: null });
  } catch (err) {
    next(err);
  }
});

function parseProductInput(body) {
  return {
    type: PRODUCT_TYPES.some((t) => t.value === body.type) ? body.type : null,
    brandId: Number(body.brandId),
    articleCode: (body.articleCode || '').trim() || null,
    name: (body.name || '').trim(),
    description: body.description ? body.description.trim() : null,
    active: body.active === 'on' || body.active === 'true',
    sortOrder: body.sortOrder ? Number(body.sortOrder) : 0,
  };
}

router.post('/produkter', uploadImage.single('image'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    const options = await getFormOptions();
    const data = parseProductInput(req.body);

    if (!data.type || !data.brandId || !data.name) {
      return res.status(400).render('admin/products/form', {
        title: 'Ny produkt', product: { ...data }, ...options,
        error: 'Typ, varumärke och namn krävs.',
      });
    }

    if (data.articleCode) {
      const existing = await prisma.product.findUnique({ where: { articleCode: data.articleCode } });
      if (existing) {
        return res.status(400).render('admin/products/form', {
          title: 'Ny produkt', product: { ...data }, ...options,
          error: `Artikelkoden ${data.articleCode} används redan.`,
        });
      }
    }

    await prisma.product.create({
      data: { ...data, imageUrl: req.file ? imagePublicUrl(req.file.filename) : null },
    });

    res.redirect('/admin/produkter');
  } catch (err) {
    next(err);
  }
});

router.get('/produkter/:id/redigera', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).render('error', { title: 'Hittades inte', message: 'Produkten kunde inte hittas.' });
    const options = await getFormOptions();
    res.render('admin/products/form', { title: `Redigera ${product.name}`, product, ...options, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/produkter/:id', uploadImage.single('image'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).render('error', { title: 'Hittades inte', message: 'Produkten kunde inte hittas.' });

    const options = await getFormOptions();
    const data = parseProductInput(req.body);

    if (!data.type || !data.brandId || !data.name) {
      return res.status(400).render('admin/products/form', {
        title: `Redigera ${product.name}`, product: { ...product, ...data }, ...options,
        error: 'Typ, varumärke och namn krävs.',
      });
    }

    if (data.articleCode) {
      const existing = await prisma.product.findUnique({ where: { articleCode: data.articleCode } });
      if (existing && existing.id !== id) {
        return res.status(400).render('admin/products/form', {
          title: `Redigera ${product.name}`, product: { ...product, ...data }, ...options,
          error: `Artikelkoden ${data.articleCode} används redan.`,
        });
      }
    }

    await prisma.product.update({
      where: { id },
      data: { ...data, ...(req.file ? { imageUrl: imagePublicUrl(req.file.filename) } : {}) },
    });

    res.redirect('/admin/produkter');
  } catch (err) {
    next(err);
  }
});

router.post('/produkter/:id/vaxla-aktiv', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).render('error', { title: 'Hittades inte', message: 'Produkten kunde inte hittas.' });
    await prisma.product.update({ where: { id }, data: { active: !product.active } });
    res.redirect('/admin/produkter');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
