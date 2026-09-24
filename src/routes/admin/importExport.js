const express = require('express');
const multer = require('multer');
const prisma = require('../../lib/prisma');
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
      prisma.priceList.findMany({ orderBy: { validFrom: 'desc' } }),
      prisma.company.findMany({ orderBy: { name: 'asc' } }),
    ]);
    res.render('admin/importExport/index', { title: 'Import/export', priceLists, companies });
  } catch (err) {
    next(err);
  }
});

// --- Dekorer -----------------------------------------------------------

router.get('/import-export/dekorer/export', async (req, res, next) => {
  try {
    const decors = await prisma.decor.findMany({
      include: { material: true, category: true },
      orderBy: { articleCode: 'asc' },
    });
    const rows = decors.map((d) => ({
      artikelkod: d.articleCode,
      namn: d.name,
      material: d.material.name,
      kategori: d.category.name,
      ytstruktur: d.surfaceTexture || '',
      maxlangd_mm: d.maxLengthMm || '',
      status: d.status,
      anmarkning: d.notes || '',
    }));

    if (req.query.format === 'xlsx') {
      const buffer = await toXlsxBuffer(rows, DECOR_COLUMNS);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="dekorer.xlsx"');
      return res.send(buffer);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="dekorer.csv"');
    res.send(toCsv(rows, DECOR_COLUMNS));
  } catch (err) {
    next(err);
  }
});

function normalize(str) {
  return (str || '').toString().trim().toLowerCase();
}

async function validateDecorRows(rawRows) {
  const [materials, categories, existingDecors] = await Promise.all([
    prisma.material.findMany(),
    prisma.decorCategory.findMany(),
    prisma.decor.findMany({ select: { id: true, articleCode: true } }),
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
      if (row.action === 'update') {
        await prisma.decor.update({ where: { id: row.existingId }, data: row.data });
      } else {
        await prisma.decor.create({ data: row.data });
      }
    }

    await prisma.auditLog.create({
      data: { userId: req.session.user.id, action: 'IMPORT', entityType: 'Decor', newValue: { count: validRows.length }, ipAddress: req.ip },
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
    const rows = await prisma.countertopPriceRow.findMany({
      where: { priceListId },
      include: { material: true, thickness: true },
      orderBy: [{ materialId: 'asc' }, { thicknessId: 'asc' }, { depthFromMm: 'asc' }],
    });
    const data = rows.map((r) => ({
      material: r.material.name,
      tjocklek_mm: r.thickness.valueMm,
      djup_fran_mm: r.depthFromMm,
      djup_till_mm: r.depthToMm,
      pris_per_lopmeter: r.pricePerMeter.toFixed(2),
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
  const materials = await prisma.material.findMany({ include: { thicknesses: true } });
  const materialByName = new Map(materials.map((m) => [normalize(m.name), m]));
  const existingRows = await prisma.countertopPriceRow.findMany({ where: { priceListId } });

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
      thickness = material.thicknesses.find((t) => t.valueMm === thicknessMm);
      if (!thickness) errors.push(`Tjockleken ${row.tjocklek_mm} mm finns inte för ${materialName}.`);
    }
    if (Number.isNaN(depthFromMm) || Number.isNaN(depthToMm) || depthFromMm > depthToMm) errors.push('Ogiltigt djupintervall.');
    if (!pricePerMeter || Number.isNaN(Number(pricePerMeter))) errors.push('Ogiltigt pris.');

    let overlapsExisting = false;
    if (thickness && !Number.isNaN(depthFromMm) && !Number.isNaN(depthToMm)) {
      overlapsExisting = existingRows.some(
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

    const priceList = await prisma.priceList.findUnique({ where: { id: priceListId } });
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
      await prisma.countertopPriceRow.create({ data: row.data });
    }

    await prisma.auditLog.create({
      data: { userId: req.session.user.id, action: 'IMPORT', entityType: 'CountertopPriceRow', entityId: staging.priceListId, newValue: { count: validRows.length }, ipAddress: req.ip },
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
    const rules = await prisma.discountRule.findMany({
      where: { companyId },
      include: { material: true, brand: true },
    });
    const data = rules.map((r) => ({
      material: r.material ? r.material.name : '',
      varumarke: r.brand ? r.brand.name : '',
      rabatt_procent: r.discountPercent.toFixed(2),
      giltig_fran: r.validFrom ? r.validFrom.toISOString().slice(0, 10) : '',
      giltig_till: r.validTo ? r.validTo.toISOString().slice(0, 10) : '',
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
  const materials = await prisma.material.findMany();
  const brands = await prisma.brand.findMany();
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

    const company = await prisma.company.findUnique({ where: { id: companyId } });
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
      await prisma.discountRule.create({
        data: {
          companyId: staging.companyId,
          materialId: row.data.materialId,
          brandId: row.data.brandId,
          discountPercent: row.data.discountPercent,
          validFrom: row.data.validFrom ? new Date(row.data.validFrom) : null,
          validTo: row.data.validTo ? new Date(row.data.validTo) : null,
        },
      });
    }

    await prisma.auditLog.create({
      data: { userId: req.session.user.id, action: 'IMPORT', entityType: 'DiscountRule', entityId: staging.companyId, newValue: { count: validRows.length }, ipAddress: req.ip },
    });

    delete req.session.discountImportStaging;
    res.render('admin/importExport/importDone', { title: 'Import klar', count: validRows.length, entityLabel: 'rabattregler' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
