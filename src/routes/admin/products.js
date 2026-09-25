const express = require('express');
const { query, mapRow, mapRows } = require('../../lib/db');
const { uploadImage, imagePublicUrl } = require('../../middleware/upload');
const { verifyCsrfAfterUpload } = require('../../middleware/csrf');

const router = express.Router();

const PRODUCT_TYPES = [
  { value: 'DISKHO', label: 'Diskho' },
  { value: 'BLANDARE', label: 'Blandare' },
  { value: 'TILLBEHOR', label: 'Tillbehör' },
];

async function getFormOptions() {
  const brands = mapRows(await query('SELECT * FROM brands ORDER BY name ASC'));
  return { brands, productTypes: PRODUCT_TYPES };
}

async function findProductById(id) {
  const rows = await query('SELECT * FROM products WHERE id = ?', [id]);
  return mapRow(rows[0]) || null;
}

async function findProductByArticleCode(articleCode) {
  const rows = await query('SELECT * FROM products WHERE article_code = ?', [articleCode]);
  return mapRow(rows[0]) || null;
}

router.get('/produkter', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT p.*, b.name AS b_name
       FROM products p
       JOIN brands b ON b.id = p.brand_id
       ORDER BY p.sort_order ASC, p.name ASC`
    );
    const products = rows.map((row) => {
      const product = mapRow(row);
      product.brand = { name: row.b_name };
      return product;
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
      const existing = await findProductByArticleCode(data.articleCode);
      if (existing) {
        return res.status(400).render('admin/products/form', {
          title: 'Ny produkt', product: { ...data }, ...options,
          error: `Artikelkoden ${data.articleCode} används redan.`,
        });
      }
    }

    await query(
      `INSERT INTO products (type, brand_id, article_code, name, description, image_url, active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [data.type, data.brandId, data.articleCode, data.name, data.description, req.file ? imagePublicUrl(req.file.filename) : null, data.active ? 1 : 0, data.sortOrder]
    );

    res.redirect('/admin/produkter');
  } catch (err) {
    next(err);
  }
});

router.get('/produkter/:id/redigera', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const product = await findProductById(id);
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
    const product = await findProductById(id);
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
      const existing = await findProductByArticleCode(data.articleCode);
      if (existing && existing.id !== id) {
        return res.status(400).render('admin/products/form', {
          title: `Redigera ${product.name}`, product: { ...product, ...data }, ...options,
          error: `Artikelkoden ${data.articleCode} används redan.`,
        });
      }
    }

    await query(
      `UPDATE products SET type = ?, brand_id = ?, article_code = ?, name = ?, description = ?, active = ?, sort_order = ?, updated_at = NOW()${req.file ? ', image_url = ?' : ''} WHERE id = ?`,
      req.file
        ? [data.type, data.brandId, data.articleCode, data.name, data.description, data.active ? 1 : 0, data.sortOrder, imagePublicUrl(req.file.filename), id]
        : [data.type, data.brandId, data.articleCode, data.name, data.description, data.active ? 1 : 0, data.sortOrder, id]
    );

    res.redirect('/admin/produkter');
  } catch (err) {
    next(err);
  }
});

router.post('/produkter/:id/vaxla-aktiv', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const product = await findProductById(id);
    if (!product) return res.status(404).render('error', { title: 'Hittades inte', message: 'Produkten kunde inte hittas.' });
    await query('UPDATE products SET active = ?, updated_at = NOW() WHERE id = ?', [product.active ? 0 : 1, id]);
    res.redirect('/admin/produkter');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
