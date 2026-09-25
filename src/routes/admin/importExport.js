const express = require('express');
const multer = require('multer');
const { query, mapRow, mapRows } = require('../../lib/db');
const { createAuditLog } = require('../../services/users');
const { parseSpreadsheet, toCsv, toXlsxBuffer } = require('../../services/spreadsheet');
const { verifyCsrfAfterUpload } = require('../../middleware/csrf');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const DECOR_COLUMNS = [
  { header: 'artikelkod', key: 'artikelkod' },
  { header: 'namn', key: 'namn' },
  { header: 'material', key: 'material' },
  { header: 'kategori', key: 'kategori' },
  { header: 'ytstruktur', key: 'ytstruktur' },
  { header: 'maxlängd_mm', key: 'maxlangd_mm' },
  { header: 'status', key: 'status' },
  { header: 'anmärkning', key: 'anmarkning' },
];

const PRICE_ROW_COLUMNS = [
  { header: 'material', key: 'material' },
  { header: 'tjocklek_mm', key: 'tjocklek_mm' },
  { header: 'djup_fran_mm', key: 'djup_fran_mm' },
  { header: 'djup_till_mm', key: 'djup_till_mm' },
  { header: 'pris_per_lopmeter', key: 'pris_per_lopmeter' },
];

const DISCOUNT_COLUMNS = [
  { header: 'material', key: 'material' },
  { header: 'varumärke', key: 'varumarke' },
  { header: 'rabatt_procent', key: 'rabatt_procent' },
  { header: 'giltig_fran', key: 'giltig_fran' },
  { header: 'giltig_till', key: 'giltig_till' },
];

router.get('/import-export', async (req, res, next) => {
  try {
    const [priceLists, companies] = await Promise.all([
      mapRows(await query('SELECT * FROM price_lists ORDER BY valid_from DESC')),
      mapRows(await query('SELECT * FROM companies ORDER BY name ASC')),
    ]);
    res.render('admin/importExport/index', { title: 'Import/export', priceLists, companies });
  } catch (err) {
    next(err);
  }
});

// --- Dekorer -----------------------------------------------------------

router.get('/import-export/dekorer/export', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT d.*, m.name AS m_name, c.name AS c_name
       FROM decors d
       JOIN materials m ON m.id = d.material_id
       JOIN decor_categories c ON c.id = d.category_id
       ORDER BY d.article_code ASC`
    );
    const data = rows.map((d) => ({
      artikelkod: d.article_code,
      namn: d.name,
      material: d.m_name,
      kategori: d.c_name,
      ytstruktur: d.surface_texture || '',
      maxlangd_mm: d.max_length_mm || '',
      status: d.status,
      anmarkning: d.notes || '',
    }));

    if (req.query.format === 'xlsx') {
      const buffer = await toXlsxBuffer(data, DECOR_COLUMNS);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="dekorer.xlsx"');
      return res.send(buffer);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="dekorer.csv"');
    res.send(toCsv(data, DECOR_COLUMNS));
  } catch (err) {
    next(err);
  }
});

function normalize(str) {
  return (str || '').toString().trim().toLowerCase();
}

async function validateDecorRows(rawRows) {
  const [materials, categories, existingDecors] = await Promise.all([
    mapRows(await query('SELECT * FROM materials')),
    mapRows(await query('SELECT * FROM decor_categories')),
    mapRows(await query('SELECT id, article_code FROM decors')),
  ]);
  const materialByName = new Map(materials.map((m) => [normalize(m.name), m]));
  const categoryByName = new Map(categories.map((c) => [normalize(c.name), c]));
  const existingByCode = new Map(existingDecors.map((d) => [normalize(d.articleCode), d]));
  const validStatuses = new Set(['AKTIV', 'UTGAENDE', 'UTGATT']);

  const seenCodes = new Set();

  return rawRows.map((row, index) => {
    const errors = [];
    const articleCode = (row.artikelkod || '').trim();
    const name = (row.namn || '').trim();
    const materialName = (row.material || '').trim();
    const categoryName = (row.kategori || '').trim();
    const status = (row.status || 'AKTIV').trim().toUpperCase();
    const maxLengthMm = row['maxlängd_mm'] ? Number(row['maxlängd_mm']) : null;

    if (!articleCode) errors.push('Artikelkod saknas.');
    if (!name) errors.push('Namn saknas.');
    if (seenCodes.has(normalize(articleCode))) errors.push('Artikelkoden förekommer flera gånger i filen.');
    seenCodes.add(normalize(articleCode));

    const material = materialByName.get(normalize(materialName));
    if (!material) errors.push(`Materialet "${materialName}" finns inte.`);
    const category = categoryByName.get(normalize(categoryName));
    if (!category) errors.push(`Kategorin "${categoryName}" finns inte.`);
    if (!validStatuses.has(status)) errors.push(`Ogiltig status "${status}".`);
    if (row['maxlängd_mm'] && Number.isNaN(maxLengthMm)) errors.push('Maxlängd måste vara ett tal.');

    const existing = existingByCode.get(normalize(articleCode));

    return {
      rowNumber: index + 2,
      errors,
      action: existing ? 'update' : 'create',
      data: {
        articleCode,
        name,
        materialId: material?.id,
        categoryId: category?.id,
        surfaceTexture: row.ytstruktur || null,
        maxLengthMm: maxLengthMm || null,
        status: validStatuses.has(status) ? status : 'AKTIV',
        notes: row['anmärkning'] || null,
      },
      existingId: existing?.id,
    };
  });
}

router.post('/import-export/dekorer/forhandsgranska', upload.single('file'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.redirect('/admin/import-export');
    }
    const rawRows = await parseSpreadsheet(req.file.buffer, req.file.originalname);
    const validated = await validateDecorRows(rawRows);
    req.session.decorImportStaging = validated;

    res.render('admin/importExport/decorPreview', { title: 'Förhandsgranska dekorimport', rows: validated });
  } catch (err) {
    next(err);
  }
});

router.post('/import-export/dekorer/bekrafta', async (req, res, next) => {
  try {
    const staging = req.session.decorImportStaging || [];
    const validRows = staging.filter((r) => r.errors.length === 0);

    for (const row of validRows) {
      const d = row.data;
      if (row.action === 'update') {
        await query(
          `UPDATE decors SET material_id = ?, category_id = ?, article_code = ?, name = ?, surface_texture = ?, max_length_mm = ?, status = ?, notes = ?, updated_at = NOW() WHERE id = ?`,
          [d.materialId, d.categoryId, d.articleCode, d.name, d.surfaceTexture, d.maxLengthMm, d.status, d.notes, row.existingId]
        );
      } else {
        await query(
          `INSERT INTO decors (material_id, category_id, article_code, name, surface_texture, max_length_mm, status, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [d.materialId, d.categoryId, d.articleCode, d.name, d.surfaceTexture, d.maxLengthMm, d.status, d.notes]
        );
      }
    }

    await createAuditLog({
      userId: req.session.user.id,
      action: 'IMPORT',
      entityType: 'Decor',
      newValue: { count: validRows.length },
      ipAddress: req.ip,
    });

    delete req.session.decorImportStaging;
    res.render('admin/importExport/importDone', { title: 'Import klar', count: validRows.length, entityLabel: 'dekorer' });
  } catch (err) {
    next(err);
  }
});

// --- Prisrader -----------------------------------------------------------

router.get('/import-export/prisrader/export', async (req, res, next) => {
  try {
    const priceListId = Number(req.query.priceListId);
    const rows = await query(
      `SELECT r.*, m.name AS m_name, t.value_mm AS t_value_mm
       FROM countertop_price_rows r
       JOIN materials m ON m.id = r.material_id
       JOIN thicknesses t ON t.id = r.thickness_id
       WHERE r.price_list_id = ?
       ORDER BY r.material_id ASC, r.thickness_id ASC, r.depth_from_mm ASC`,
      [priceListId]
    );
    const data = rows.map((r) => ({
      material: r.m_name,
      tjocklek_mm: r.t_value_mm,
      djup_fran_mm: r.depth_from_mm,
      djup_till_mm: r.depth_to_mm,
      pris_per_lopmeter: Number(r.price_per_meter).toFixed(2),
    }));

    if (req.query.format === 'xlsx') {
      const buffer = await toXlsxBuffer(data, PRICE_ROW_COLUMNS);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="prisrader.xlsx"');
      return res.send(buffer);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="prisrader.csv"');
    res.send(toCsv(data, PRICE_ROW_COLUMNS));
  } catch (err) {
    next(err);
  }
});

async function validatePriceRows(rawRows, priceListId) {
  const [materials, thicknesses, existingRows] = await Promise.all([
    mapRows(await query('SELECT * FROM materials')),
    mapRows(await query('SELECT * FROM thicknesses')),
    mapRows(await query('SELECT * FROM countertop_price_rows WHERE price_list_id = ?', [priceListId])),
  ]);
  const materialByName = new Map(materials.map((m) => [normalize(m.name), m]));
  const thicknessesByMaterialId = new Map();
  for (const t of thicknesses) {
    if (!thicknessesByMaterialId.has(t.materialId)) thicknessesByMaterialId.set(t.materialId, []);
    thicknessesByMaterialId.get(t.materialId).push(t);
  }

  return rawRows.map((row, index) => {
    const errors = [];
    const materialName = (row.material || '').trim();
    const thicknessMm = Number(row.tjocklek_mm);
    const depthFromMm = Number(row.djup_fran_mm);
    const depthToMm = Number(row.djup_till_mm);
    const pricePerMeter = row.pris_per_lopmeter;

    const material = materialByName.get(normalize(materialName));
    if (!material) errors.push(`Materialet "${materialName}" finns inte.`);
    let thickness = null;
    if (material) {
      thickness = (thicknessesByMaterialId.get(material.id) || []).find((t) => t.valueMm === thicknessMm);
      if (!thickness) errors.push(`Tjockleken ${row.tjocklek_mm} mm finns inte för ${materialName}.`);
    }
    if (Number.isNaN(depthFromMm) || Number.isNaN(depthToMm) || depthFromMm > depthToMm) errors.push('Ogiltigt djupintervall.');
    if (!pricePerMeter || Number.isNaN(Number(pricePerMeter))) errors.push('Ogiltigt pris.');

    if (thickness && !Number.isNaN(depthFromMm) && !Number.isNaN(depthToMm)) {
      const overlapsExisting = existingRows.some(
        (r) => r.materialId === material.id && r.thicknessId === thickness.id && depthFromMm <= r.depthToMm && r.depthFromMm <= depthToMm
      );
      if (overlapsExisting) errors.push('Djupintervallet överlappar en befintlig rad i prislistan.');
    }

    return {
      rowNumber: index + 2,
      errors,
      data: material && thickness
        ? { priceListId, materialId: material.id, thicknessId: thickness.id, depthFromMm, depthToMm, pricePerMeter }
        : null,
      display: { material: materialName, tjocklek_mm: row.tjocklek_mm, djup_fran_mm: row.djup_fran_mm, djup_till_mm: row.djup_till_mm, pris_per_lopmeter: row.pris_per_lopmeter },
    };
  });
}

router.post('/import-export/prisrader/forhandsgranska', upload.single('file'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    const priceListId = Number(req.body.priceListId);
    if (!req.file || !priceListId) return res.redirect('/admin/import-export');

    const rawRows = await parseSpreadsheet(req.file.buffer, req.file.originalname);
    const validated = await validatePriceRows(rawRows, priceListId);
    req.session.priceRowImportStaging = { priceListId, rows: validated };

    const rows = await query('SELECT * FROM price_lists WHERE id = ?', [priceListId]);
    const priceList = mapRow(rows[0]);
    res.render('admin/importExport/priceRowPreview', { title: 'Förhandsgranska prisimport', rows: validated, priceList });
  } catch (err) {
    next(err);
  }
});

router.post('/import-export/prisrader/bekrafta', async (req, res, next) => {
  try {
    const staging = req.session.priceRowImportStaging;
    if (!staging) return res.redirect('/admin/import-export');
    const validRows = staging.rows.filter((r) => r.errors.length === 0 && r.data);

    for (const row of validRows) {
      const d = row.data;
      await query(
        'INSERT INTO countertop_price_rows (price_list_id, material_id, thickness_id, depth_from_mm, depth_to_mm, price_per_meter, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
        [d.priceListId, d.materialId, d.thicknessId, d.depthFromMm, d.depthToMm, d.pricePerMeter]
      );
    }

    await createAuditLog({
      userId: req.session.user.id,
      action: 'IMPORT',
      entityType: 'CountertopPriceRow',
      entityId: staging.priceListId,
      newValue: { count: validRows.length },
      ipAddress: req.ip,
    });

    delete req.session.priceRowImportStaging;
    res.render('admin/importExport/importDone', { title: 'Import klar', count: validRows.length, entityLabel: 'prisrader' });
  } catch (err) {
    next(err);
  }
});

// --- Rabattregler --------------------------------------------------------

router.get('/import-export/rabatter/export', async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId);
    const rows = await query(
      `SELECT r.*, m.name AS m_name, b.name AS b_name
       FROM discount_rules r
       LEFT JOIN materials m ON m.id = r.material_id
       LEFT JOIN brands b ON b.id = r.brand_id
       WHERE r.company_id = ?`,
      [companyId]
    );
    const data = rows.map((r) => ({
      material: r.m_name || '',
      varumarke: r.b_name || '',
      rabatt_procent: Number(r.discount_percent).toFixed(2),
      giltig_fran: r.valid_from ? r.valid_from.toISOString().slice(0, 10) : '',
      giltig_till: r.valid_to ? r.valid_to.toISOString().slice(0, 10) : '',
    }));

    if (req.query.format === 'xlsx') {
      const buffer = await toXlsxBuffer(data, DISCOUNT_COLUMNS);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="rabatter.xlsx"');
      return res.send(buffer);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="rabatter.csv"');
    res.send(toCsv(data, DISCOUNT_COLUMNS));
  } catch (err) {
    next(err);
  }
});

async function validateDiscountRows(rawRows) {
  const [materials, brands] = await Promise.all([
    mapRows(await query('SELECT * FROM materials')),
    mapRows(await query('SELECT * FROM brands')),
  ]);
  const materialByName = new Map(materials.map((m) => [normalize(m.name), m]));
  const brandByName = new Map(brands.map((b) => [normalize(b.name), b]));

  return rawRows.map((row, index) => {
    const errors = [];
    const materialName = (row.material || '').trim();
    const brandName = (row['varumärke'] || '').trim();
    const percent = row.rabatt_procent;

    let materialId = null;
    if (materialName) {
      const material = materialByName.get(normalize(materialName));
      if (!material) errors.push(`Materialet "${materialName}" finns inte.`);
      else materialId = material.id;
    }
    let brandId = null;
    if (brandName) {
      const brand = brandByName.get(normalize(brandName));
      if (!brand) errors.push(`Varumärket "${brandName}" finns inte.`);
      else brandId = brand.id;
    }
    if (!percent || Number.isNaN(Number(percent))) errors.push('Ogiltig rabattprocent.');

    return {
      rowNumber: index + 2,
      errors,
      data: { materialId, brandId, discountPercent: percent, validFrom: row.giltig_fran || null, validTo: row.giltig_till || null },
      display: row,
    };
  });
}

router.post('/import-export/rabatter/forhandsgranska', upload.single('file'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    const companyId = Number(req.body.companyId);
    if (!req.file || !companyId) return res.redirect('/admin/import-export');

    const rawRows = await parseSpreadsheet(req.file.buffer, req.file.originalname);
    const validated = await validateDiscountRows(rawRows);
    req.session.discountImportStaging = { companyId, rows: validated };

    const rows = await query('SELECT * FROM companies WHERE id = ?', [companyId]);
    const company = mapRow(rows[0]);
    res.render('admin/importExport/discountPreview', { title: 'Förhandsgranska rabattimport', rows: validated, company });
  } catch (err) {
    next(err);
  }
});

router.post('/import-export/rabatter/bekrafta', async (req, res, next) => {
  try {
    const staging = req.session.discountImportStaging;
    if (!staging) return res.redirect('/admin/import-export');
    const validRows = staging.rows.filter((r) => r.errors.length === 0);

    for (const row of validRows) {
      const d = row.data;
      await query(
        'INSERT INTO discount_rules (company_id, material_id, brand_id, discount_percent, valid_from, valid_to, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [staging.companyId, d.materialId, d.brandId, d.discountPercent, d.validFrom ? new Date(d.validFrom) : null, d.validTo ? new Date(d.validTo) : null]
      );
    }

    await createAuditLog({
      userId: req.session.user.id,
      action: 'IMPORT',
      entityType: 'DiscountRule',
      entityId: staging.companyId,
      newValue: { count: validRows.length },
      ipAddress: req.ip,
    });

    delete req.session.discountImportStaging;
    res.render('admin/importExport/importDone', { title: 'Import klar', count: validRows.length, entityLabel: 'rabattregler' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
