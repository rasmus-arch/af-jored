const express = require('express');
const prisma = require('../../lib/prisma');
const { validateDepthRanges, rangesOverlap, applyPercentageIncrease } = require('../../services/pricing');

const router = express.Router();

async function getMaterialsWithThicknesses() {
  return prisma.material.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    include: { thicknesses: { where: { active: true }, orderBy: { valueMm: 'asc' } } },
  });
}

async function logPriceChange(req, entityType, entityId, oldValue, newValue) {
  await prisma.auditLog.create({
    data: {
      userId: req.session.user.id,
      action: 'PRICE_CHANGE',
      entityType,
      entityId,
      oldValue: oldValue ?? undefined,
      newValue: newValue ?? undefined,
      ipAddress: req.ip,
    },
  });
}

router.get('/prislistor', async (req, res, next) => {
  try {
    const priceLists = await prisma.priceList.findMany({
      orderBy: { validFrom: 'desc' },
      include: { _count: { select: { countertopRows: true, edgeProfilePrices: true, addOnPrices: true } } },
    });
    const now = new Date();
    const currentId = priceLists.find((p) => p.validFrom <= now)?.id;
    res.render('admin/priceLists/list', { title: 'Prislistor', priceLists, currentId });
  } catch (err) {
    next(err);
  }
});

router.get('/prislistor/ny', async (req, res, next) => {
  try {
    const priceLists = await prisma.priceList.findMany({ orderBy: { validFrom: 'desc' } });
    res.render('admin/priceLists/form', { title: 'Ny prislista', priceLists, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/prislistor', async (req, res, next) => {
  try {
    const { name, validFrom, copyFromId } = req.body;
    if (!name || !name.trim() || !validFrom) {
      const priceLists = await prisma.priceList.findMany({ orderBy: { validFrom: 'desc' } });
      return res.status(400).render('admin/priceLists/form', { title: 'Ny prislista', priceLists, error: 'Namn och giltig från-datum krävs.' });
    }

    const priceList = await prisma.priceList.create({
      data: { name: name.trim(), validFrom: new Date(validFrom), createdById: req.session.user.id },
    });

    if (copyFromId) {
      const sourceId = Number(copyFromId);
      const [rows, edgePrices, addOnPrices] = await Promise.all([
        prisma.countertopPriceRow.findMany({ where: { priceListId: sourceId } }),
        prisma.edgeProfilePrice.findMany({ where: { priceListId: sourceId } }),
        prisma.addOnPrice.findMany({ where: { priceListId: sourceId } }),
      ]);
      for (const row of rows) {
        await prisma.countertopPriceRow.create({
          data: { priceListId: priceList.id, materialId: row.materialId, thicknessId: row.thicknessId, depthFromMm: row.depthFromMm, depthToMm: row.depthToMm, pricePerMeter: row.pricePerMeter },
        });
      }
      for (const p of edgePrices) {
        await prisma.edgeProfilePrice.create({ data: { priceListId: priceList.id, edgeProfileId: p.edgeProfileId, thicknessId: p.thicknessId, price: p.price } });
      }
      for (const p of addOnPrices) {
        await prisma.addOnPrice.create({ data: { priceListId: priceList.id, addOnId: p.addOnId, thicknessId: p.thicknessId, price: p.price } });
      }
    }

    await logPriceChange(req, 'PriceList', priceList.id, null, { name: priceList.name, validFrom: priceList.validFrom, copiedFrom: copyFromId || null });
    res.redirect(`/admin/prislistor/${priceList.id}`);
  } catch (err) {
    next(err);
  }
});

// Skapar en ny prislista genom att höja alla priser i en befintlig med en
// procentsats - för att förbereda nästa periods priser i förväg.
router.post('/prislistor/:id/hoja', async (req, res, next) => {
  try {
    const sourceId = Number(req.params.id);
    const sourceList = await prisma.priceList.findUnique({ where: { id: sourceId } });
    if (!sourceList) return res.status(404).render('error', { title: 'Hittades inte', message: 'Prislistan kunde inte hittas.' });

    const { name, validFrom, percent } = req.body;
    if (!name || !name.trim() || !validFrom || percent === undefined || percent === '') {
      return res.redirect(`/admin/prislistor/${sourceId}?hojError=${encodeURIComponent('Namn, giltig från-datum och procentsats krävs.')}`);
    }

    const newList = await prisma.priceList.create({
      data: { name: name.trim(), validFrom: new Date(validFrom), createdById: req.session.user.id },
    });

    const [rows, edgePrices, addOnPrices] = await Promise.all([
      prisma.countertopPriceRow.findMany({ where: { priceListId: sourceId } }),
      prisma.edgeProfilePrice.findMany({ where: { priceListId: sourceId } }),
      prisma.addOnPrice.findMany({ where: { priceListId: sourceId } }),
    ]);

    for (const row of rows) {
      const newPrice = applyPercentageIncrease(row.pricePerMeter, percent);
      await prisma.countertopPriceRow.create({
        data: { priceListId: newList.id, materialId: row.materialId, thicknessId: row.thicknessId, depthFromMm: row.depthFromMm, depthToMm: row.depthToMm, pricePerMeter: newPrice },
      });
    }
    for (const p of edgePrices) {
      const newPrice = applyPercentageIncrease(p.price, percent);
      await prisma.edgeProfilePrice.create({ data: { priceListId: newList.id, edgeProfileId: p.edgeProfileId, thicknessId: p.thicknessId, price: newPrice } });
    }
    for (const p of addOnPrices) {
      const newPrice = applyPercentageIncrease(p.price, percent);
      await prisma.addOnPrice.create({ data: { priceListId: newList.id, addOnId: p.addOnId, thicknessId: p.thicknessId, price: newPrice } });
    }

    await logPriceChange(req, 'PriceList', newList.id, { basedOn: sourceId }, { name: newList.name, validFrom: newList.validFrom, percent });
    res.redirect(`/admin/prislistor/${newList.id}`);
  } catch (err) {
    next(err);
  }
});

router.get('/prislistor/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const priceList = await prisma.priceList.findUnique({ where: { id } });
    if (!priceList) return res.status(404).render('error', { title: 'Hittades inte', message: 'Prislistan kunde inte hittas.' });

    const [materials, rows, edgeProfiles, edgePrices, addOns, addOnPrices] = await Promise.all([
      getMaterialsWithThicknesses(),
      prisma.countertopPriceRow.findMany({
        where: { priceListId: id },
        include: { material: true, thickness: true },
        orderBy: [{ materialId: 'asc' }, { thicknessId: 'asc' }, { depthFromMm: 'asc' }],
      }),
      prisma.edgeProfile.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      prisma.edgeProfilePrice.findMany({ where: { priceListId: id }, include: { edgeProfile: true, thickness: true } }),
      prisma.addOn.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      prisma.addOnPrice.findMany({ where: { priceListId: id }, include: { addOn: true, thickness: true } }),
    ]);

    // Gruppera rader per material+tjocklek och varna för luckor (överlapp
    // stoppas redan vid tillägg, men luckor kan uppstå medvetet under arbete).
    const groups = new Map();
    for (const row of rows) {
      const key = `${row.materialId}:${row.thicknessId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    const gapWarnings = [];
    for (const [key, groupRows] of groups) {
      const { gaps } = validateDepthRanges(groupRows);
      if (gaps.length > 0) {
        const sample = groupRows[0];
        gaps.forEach((gap) => {
          gapWarnings.push(`${sample.material.name} ${sample.thickness.valueMm} mm: lucka mellan ${gap.afterDepthToMm} och ${gap.beforeDepthFromMm} mm.`);
        });
      }
    }

    res.render('admin/priceLists/detail', {
      title: priceList.name,
      priceList,
      materials,
      rows,
      edgeProfiles,
      edgePrices,
      addOns,
      addOnPrices,
      gapWarnings,
      rowError: req.query.rowError || null,
      hojError: req.query.hojError || null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/prislistor/:id/rader', async (req, res, next) => {
  try {
    const priceListId = Number(req.params.id);
    const materialId = Number(req.body.materialId);
    const thicknessId = Number(req.body.thicknessId);
    const depthFromMm = Number(req.body.depthFromMm);
    const depthToMm = Number(req.body.depthToMm);
    const pricePerMeter = req.body.pricePerMeter;

    if (!materialId || !thicknessId || !pricePerMeter || Number.isNaN(depthFromMm) || Number.isNaN(depthToMm) || depthFromMm > depthToMm) {
      return res.redirect(`/admin/prislistor/${priceListId}?rowError=${encodeURIComponent('Fyll i material, tjocklek, ett giltigt djupintervall och pris.')}`);
    }

    const existingRows = await prisma.countertopPriceRow.findMany({ where: { priceListId, materialId, thicknessId } });
    const overlap = existingRows.find((r) => rangesOverlap(r.depthFromMm, r.depthToMm, depthFromMm, depthToMm));
    if (overlap) {
      return res.redirect(`/admin/prislistor/${priceListId}?rowError=${encodeURIComponent(`Djupintervallet överlappar en befintlig rad (${overlap.depthFromMm}-${overlap.depthToMm} mm).`)}`);
    }

    const row = await prisma.countertopPriceRow.create({
      data: { priceListId, materialId, thicknessId, depthFromMm, depthToMm, pricePerMeter },
    });
    await logPriceChange(req, 'CountertopPriceRow', row.id, null, { materialId, thicknessId, depthFromMm, depthToMm, pricePerMeter });

    res.redirect(`/admin/prislistor/${priceListId}`);
  } catch (err) {
    next(err);
  }
});

router.post('/prislistor/:id/rader/:rowId/uppdatera', async (req, res, next) => {
  try {
    const priceListId = Number(req.params.id);
    const rowId = Number(req.params.rowId);
    const row = await prisma.countertopPriceRow.findFirst({ where: { id: rowId, priceListId } });
    if (!row) return res.status(404).render('error', { title: 'Hittades inte', message: 'Prisraden kunde inte hittas.' });

    const depthFromMm = Number(req.body.depthFromMm);
    const depthToMm = Number(req.body.depthToMm);
    const pricePerMeter = req.body.pricePerMeter;

    if (!pricePerMeter || Number.isNaN(depthFromMm) || Number.isNaN(depthToMm) || depthFromMm > depthToMm) {
      return res.redirect(`/admin/prislistor/${priceListId}?rowError=${encodeURIComponent('Ogiltigt djupintervall eller pris.')}`);
    }

    const siblings = await prisma.countertopPriceRow.findMany({
      where: { priceListId, materialId: row.materialId, thicknessId: row.thicknessId, NOT: { id: rowId } },
    });
    const overlap = siblings.find((r) => rangesOverlap(r.depthFromMm, r.depthToMm, depthFromMm, depthToMm));
    if (overlap) {
      return res.redirect(`/admin/prislistor/${priceListId}?rowError=${encodeURIComponent(`Djupintervallet överlappar en annan rad (${overlap.depthFromMm}-${overlap.depthToMm} mm).`)}`);
    }

    const updated = await prisma.countertopPriceRow.update({ where: { id: rowId }, data: { depthFromMm, depthToMm, pricePerMeter } });
    await logPriceChange(req, 'CountertopPriceRow', rowId, { depthFromMm: row.depthFromMm, depthToMm: row.depthToMm, pricePerMeter: row.pricePerMeter }, { depthFromMm: updated.depthFromMm, depthToMm: updated.depthToMm, pricePerMeter: updated.pricePerMeter });

    res.redirect(`/admin/prislistor/${priceListId}`);
  } catch (err) {
    next(err);
  }
});

router.post('/prislistor/:id/rader/:rowId/ta-bort', async (req, res, next) => {
  try {
    const priceListId = Number(req.params.id);
    const rowId = Number(req.params.rowId);
    const row = await prisma.countertopPriceRow.findFirst({ where: { id: rowId, priceListId } });
    if (!row) return res.status(404).render('error', { title: 'Hittades inte', message: 'Prisraden kunde inte hittas.' });
    await prisma.countertopPriceRow.delete({ where: { id: rowId } });
    await logPriceChange(req, 'CountertopPriceRow', rowId, { depthFromMm: row.depthFromMm, depthToMm: row.depthToMm, pricePerMeter: row.pricePerMeter }, null);
    res.redirect(`/admin/prislistor/${priceListId}`);
  } catch (err) {
    next(err);
  }
});

router.post('/prislistor/:id/kantprofilpriser', async (req, res, next) => {
  try {
    const priceListId = Number(req.params.id);
    const edgeProfileId = Number(req.body.edgeProfileId);
    const thicknessId = req.body.thicknessId ? Number(req.body.thicknessId) : null;
    const price = req.body.price;

    if (!edgeProfileId || !price) {
      return res.redirect(`/admin/prislistor/${priceListId}?rowError=${encodeURIComponent('Kantprofil och pris krävs.')}`);
    }

    const existing = await prisma.edgeProfilePrice.findFirst({ where: { priceListId, edgeProfileId, thicknessId } });
    if (existing) {
      await prisma.edgeProfilePrice.update({ where: { id: existing.id }, data: { price } });
      await logPriceChange(req, 'EdgeProfilePrice', existing.id, { price: existing.price }, { price });
    } else {
      const created = await prisma.edgeProfilePrice.create({ data: { priceListId, edgeProfileId, thicknessId, price } });
      await logPriceChange(req, 'EdgeProfilePrice', created.id, null, { edgeProfileId, thicknessId, price });
    }

    res.redirect(`/admin/prislistor/${priceListId}`);
  } catch (err) {
    next(err);
  }
});

router.post('/prislistor/:id/tillvalspriser', async (req, res, next) => {
  try {
    const priceListId = Number(req.params.id);
    const addOnId = Number(req.body.addOnId);
    const thicknessId = req.body.thicknessId ? Number(req.body.thicknessId) : null;
    const price = req.body.price;

    if (!addOnId || !price) {
      return res.redirect(`/admin/prislistor/${priceListId}?rowError=${encodeURIComponent('Tillval och pris krävs.')}`);
    }

    const existing = await prisma.addOnPrice.findFirst({ where: { priceListId, addOnId, thicknessId } });
    if (existing) {
      await prisma.addOnPrice.update({ where: { id: existing.id }, data: { price } });
      await logPriceChange(req, 'AddOnPrice', existing.id, { price: existing.price }, { price });
    } else {
      const created = await prisma.addOnPrice.create({ data: { priceListId, addOnId, thicknessId, price } });
      await logPriceChange(req, 'AddOnPrice', created.id, null, { addOnId, thicknessId, price });
    }

    res.redirect(`/admin/prislistor/${priceListId}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
