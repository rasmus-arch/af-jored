const express = require('express');
const PDFDocument = require('pdfkit');
const prisma = require('../../lib/prisma');
const catalog = require('../../services/catalog');
const { calculateCountertopLine } = require('../../services/quote');
const { toCsv } = require('../../services/spreadsheet');

const router = express.Router();

const COLUMNS = [
  { header: 'artikelkod', key: 'artikelkod' },
  { header: 'namn', key: 'namn' },
  { header: 'material', key: 'material' },
  { header: 'tjocklek_mm', key: 'tjocklek_mm' },
  { header: 'djup_mm', key: 'djup_mm' },
  { header: 'rekommenderat_pris_per_lm', key: 'rekommenderat_pris_per_lm' },
  { header: 'inkopspris_per_lm', key: 'inkopspris_per_lm' },
];

async function buildPriceListRows(companyId, asOf) {
  const [company, priceList, discountRules, netPriceOverrides, decors] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    catalog.getCurrentPriceList(asOf),
    catalog.getDiscountRulesForCompany(companyId),
    catalog.getNetPriceOverridesForCompany(companyId),
    catalog.listDecors({}),
  ]);

  if (!priceList) return { priceList: null, rows: [] };

  const rows = [];
  for (const decor of decors) {
    for (const dt of decor.decorThicknesses) {
      const priceRows = await catalog.getCountertopPriceRows({
        priceListId: priceList.id,
        materialId: decor.materialId,
        thicknessId: dt.thickness.id,
      });
      for (const row of priceRows) {
        const line = calculateCountertopLine({
          priceRows,
          netPriceOverrides,
          discountRules,
          baseDiscountPercent: company.baseDiscountPercent,
          materialId: decor.materialId,
          brandId: decor.brandId,
          decorId: decor.id,
          thicknessId: dt.thickness.id,
          depthMm: row.depthFromMm,
          lengthMm: 1000,
        });
        rows.push({
          artikelkod: decor.articleCode,
          namn: decor.name,
          material: decor.material.name,
          tjocklek_mm: dt.thickness.valueMm,
          djup_mm: `${row.depthFromMm}-${row.depthToMm}`,
          rekommenderat_pris_per_lm: line.recommendedPrice.toFixed(2),
          inkopspris_per_lm: line.purchasePrice.toFixed(2),
        });
      }
    }
  }

  return { priceList, rows };
}

router.get('/prislista', (req, res) => {
  res.render('reseller/priceList', { title: 'Min prislista', datum: req.query.datum || new Date().toISOString().slice(0, 10) });
});

router.get('/prislista/csv', async (req, res, next) => {
  try {
    const asOf = req.query.datum ? new Date(req.query.datum) : new Date();
    const { rows } = await buildPriceListRows(req.session.user.companyId, asOf);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="prislista-${asOf.toISOString().slice(0, 10)}.csv"`);
    res.send(toCsv(rows, COLUMNS));
  } catch (err) {
    next(err);
  }
});

router.get('/prislista/pdf', async (req, res, next) => {
  try {
    const asOf = req.query.datum ? new Date(req.query.datum) : new Date();
    const company = await prisma.company.findUnique({ where: { id: req.session.user.companyId } });
    const { priceList, rows } = await buildPriceListRows(req.session.user.companyId, asOf);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="prislista-${asOf.toISOString().slice(0, 10)}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(16).text(`Prislista - ${company.name}`, { align: 'left' });
    doc.fontSize(10).fillColor('#666').text(
      priceList ? `Gäller från ${priceList.validFrom.toISOString().slice(0, 10)} (visad för datum ${asOf.toISOString().slice(0, 10)})` : 'Ingen gällande prislista för valt datum'
    );
    doc.moveDown();
    doc.fillColor('#000');

    const colWidths = [60, 110, 70, 55, 70, 90, 90];
    const headers = ['Kod', 'Namn', 'Material', 'Tjocklek', 'Djup (mm)', 'Rek. pris/lm', 'Inköpspris/lm'];

    function drawRow(values, y, bold) {
      let x = doc.page.margins.left;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      values.forEach((v, i) => {
        doc.text(String(v), x, y, { width: colWidths[i] });
        x += colWidths[i];
      });
    }

    let y = doc.y;
    drawRow(headers, y, true);
    y += 16;
    doc.moveTo(doc.page.margins.left, y - 2).lineTo(555, y - 2).strokeColor('#ccc').stroke();

    rows.forEach((r) => {
      if (y > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        y = doc.page.margins.top;
        drawRow(headers, y, true);
        y += 16;
      }
      drawRow(
        [r.artikelkod, r.namn, r.material, `${r.tjocklek_mm} mm`, r.djup_mm, `${r.rekommenderat_pris_per_lm} kr`, `${r.inkopspris_per_lm} kr`],
        y,
        false
      );
      y += 14;
    });

    doc.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
