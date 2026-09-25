const express = require('express');
const { query, mapRow, mapRows } = require('../../lib/db');
const { createAuditLog } = require('../../services/users');
const { validateDepthRanges, rangesOverlap, applyPercentageIncrease } = require('../../services/pricing');

const router = express.Router();

async function getMaterialsWithThicknesses() {
  const [materials, thicknesses] = await Promise.all([
    mapRows(await query('SELECT * FROM materials WHERE active = 1 ORDER BY sort_order ASC')),
    mapRows(await query('SELECT * FROM thicknesses WHERE active = 1 ORDER BY value_mm ASC')),
  ]);
  const thicknessesByMaterialId = new Map();
  for (const t of thicknesses) {
    if (!thicknessesByMaterialId.has(t.materialId)) thicknessesByMaterialId.set(t.materialId, []);
    thicknessesByMaterialId.get(t.materialId).push(t);
  }
  for (const m of materials) {
    m.thicknesses = thicknessesByMaterialId.get(m.id) || [];
  }
  return materials;
}

async function findPriceListById(id) {
  const rows = await query('SELECT * FROM price_lists WHERE id = ?', [id]);
  return mapRow(rows[0]) || null;
}

async function logPriceChange(req, entityType, entityId, oldValue, newValue) {
  await createAuditLog({
    userId: req.session.user.id,
    action: 'PRICE_CHANGE',
    entityType,
    entityId,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
    ipAddress: req.ip,
  });
}

router.get('/prislistor', async (req, res, next) => {
  try {
    const priceLists = mapRows(await query('SELECT * FROM price_lists ORDER BY valid_from DESC'));
    const [countertopCounts, edgeCounts, addOnCounts] = await Promise.all([
      query('SELECT price_list_id, COUNT(*) AS n FROM countertop_price_rows GROUP BY price_list_id'),
      query('SELECT price_list_id, COUNT(*) AS n FROM edge_profile_prices GROUP BY price_list_id'),
      query('SELECT price_list_id, COUNT(*) AS n FROM add_on_prices GROUP BY price_list_id'),
    ]);
    const toMap = (rows) => new Map(rows.map((r) => [r.price_list_id, r.n]));
    const countertopById = toMap(countertopCounts);
    const edgeById = toMap(edgeCounts);
    const addOnById = toMap(addOnCounts);
    for (const pl of priceLists) {
      pl._count = {
        countertopRows: countertopById.get(pl.id) || 0,
        edgeProfilePrices: edgeById.get(pl.id) || 0,
        addOnPrices: addOnById.get(pl.id) || 0,
      };
    }
    const now = new Date();
    const currentId = priceLists.find((p) => p.validFrom <= now)?.id;
    res.render('admin/priceLists/list', { title: 'Prislistor', priceLists, currentId });
  } catch (err) {
    next(err);
  }
});

router.get('/prislistor/ny', async (req, res, next) => {
  try {
    const priceLists = mapRows(await query('SELECT * FROM price_lists ORDER BY valid_from DESC'));
    res.render('admin/priceLists/form', { title: 'Ny prislista', priceLists, error: null });
  } catch (err) {
    next(err);
  }
});

async function copyPriceListContents(sourceId, targetId, transform = (x) => x) {
  const [rows, edgePrices, addOnPrices, productPrices] = await Promise.all([
    mapRows(await query('SELECT * FROM countertop_price_rows WHERE price_list_id = ?', [sourceId])),
    mapRows(await query('SELECT * FROM edge_profile_prices WHERE price_list_id = ?', [sourceId])),
    mapRows(await query('SELECT * FROM add_on_prices WHERE price_list_id = ?', [sourceId])),
    mapRows(await query('SELECT * FROM product_prices WHERE price_list_id = ?', [sourceId])),
  ]);

  for (const row of rows) {
    await query(
      'INSERT INTO countertop_price_rows (price_list_id, material_id, thickness_id, depth_from_mm, depth_to_mm, price_per_meter, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [targetId, row.materialId, row.thicknessId, row.depthFromMm, row.depthToMm, transform(row.pricePerMeter)]
    );
  }
  for (const p of edgePrices) {
    await query(
      'INSERT INTO edge_profile_prices (price_list_id, edge_profile_id, thickness_id, price, created_at) VALUES (?, ?, ?, ?, NOW())',
      [targetId, p.edgeProfileId, p.thicknessId, transform(p.price)]
    );
  }
  for (const p of addOnPrices) {
    await query(
      'INSERT INTO add_on_prices (price_list_id, add_on_id, thickness_id, price, created_at) VALUES (?, ?, ?, ?, NOW())',
      [targetId, p.addOnId, p.thicknessId, transform(p.price)]
    );
  }
  for (const p of productPrices) {
    await query('INSERT INTO product_prices (price_list_id, product_id, price, created_at) VALUES (?, ?, ?, NOW())', [
      targetId,
      p.productId,
      transform(p.price),
    ]);
  }
}

router.post('/prislistor', async (req, res, next) => {
  try {
    const { name, validFrom, copyFromId } = req.body;
    if (!name || !name.trim() || !validFrom) {
      const priceLists = mapRows(await query('SELECT * FROM price_lists ORDER BY valid_from DESC'));
      return res.status(400).render('admin/priceLists/form', { title: 'Ny prislista', priceLists, error: 'Namn och giltig från-datum krävs.' });
    }

    const result = await query('INSERT INTO price_lists (name, valid_from, created_by_id, created_at) VALUES (?, ?, ?, NOW())', [
      name.trim(),
      new Date(validFrom),
      req.session.user.id,
    ]);
    const priceListId = result.insertId;

    if (copyFromId) {
      await copyPriceListContents(Number(copyFromId), priceListId);
    }

    await logPriceChange(req, 'PriceList', priceListId, null, { name: name.trim(), validFrom, copiedFrom: copyFromId || null });
    res.redirect(`/admin/prislistor/${priceListId}`);
  } catch (err) {
    next(err);
  }
});

// Skapar en ny prislista genom att höja alla priser i en befintlig med en
// procentsats - för att förbereda nästa periods priser i förväg.
router.post('/prislistor/:id/hoja', async (req, res, next) => {
  try {
    const sourceId = Number(req.params.id);
    const sourceList = await findPriceListById(sourceId);
    if (!sourceList) return res.status(404).render('error', { title: 'Hittades inte', message: 'Prislistan kunde inte hittas.' });

    const { name, validFrom, percent } = req.body;
    if (!name || !name.trim() || !validFrom || percent === undefined || percent === '') {
      return res.redirect(`/admin/prislistor/${sourceId}?hojError=${encodeURIComponent('Namn, giltig från-datum och procentsats krävs.')}`);
    }

    const result = await query('INSERT INTO price_lists (name, valid_from, created_by_id, created_at) VALUES (?, ?, ?, NOW())', [
      name.trim(),
      new Date(validFrom),
      req.session.user.id,
    ]);
    const newListId = result.insertId;

    await copyPriceListContents(sourceId, newListId, (price) => applyPercentageIncrease(price, percent));

    await logPriceChange(req, 'PriceList', newListId, { basedOn: sourceId }, { name: name.trim(), validFrom, percent });
    res.redirect(`/admin/prislistor/${newListId}`);
  } catch (err) {
    next(err);
  }
});

router.get('/prislistor/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const priceList = await findPriceListById(id);
    if (!priceList) return res.status(404).render('error', { title: 'Hittades inte', message: 'Prislistan kunde inte hittas.' });

    const [materials, rowsRaw, edgeProfiles, edgePricesRaw, addOns, addOnPricesRaw, productsRaw, productPricesRaw] = await Promise.all([
      getMaterialsWithThicknesses(),
      query(
        `SELECT r.*, m.name AS m_name, t.value_mm AS t_value_mm
         FROM countertop_price_rows r
         JOIN materials m ON m.id = r.material_id
         JOIN thicknesses t ON t.id = r.thickness_id
         WHERE r.price_list_id = ?
         ORDER BY r.material_id ASC, r.thickness_id ASC, r.depth_from_mm ASC`,
        [id]
      ),
      mapRows(await query('SELECT * FROM edge_profiles WHERE active = 1 ORDER BY name ASC')),
      query(
        `SELECT p.*, ep.name AS ep_name, ep.price_unit AS ep_price_unit, t.value_mm AS t_value_mm
         FROM edge_profile_prices p
         JOIN edge_profiles ep ON ep.id = p.edge_profile_id
         LEFT JOIN thicknesses t ON t.id = p.thickness_id
         WHERE p.price_list_id = ?`,
        [id]
      ),
      mapRows(await query('SELECT * FROM add_ons WHERE active = 1 ORDER BY name ASC')),
      query(
        `SELECT p.*, a.name AS a_name, a.price_unit AS a_price_unit, t.value_mm AS t_value_mm
         FROM add_on_prices p
         JOIN add_ons a ON a.id = p.add_on_id
         LEFT JOIN thicknesses t ON t.id = p.thickness_id
         WHERE p.price_list_id = ?`,
        [id]
      ),
      query(
        `SELECT pr.*, b.name AS b_name
         FROM products pr
         JOIN brands b ON b.id = pr.brand_id
         WHERE pr.active = 1
         ORDER BY pr.name ASC`
      ),
      query(
        `SELECT pp.*, pr.name AS pr_name, b.name AS b_name
         FROM product_prices pp
         JOIN products pr ON pr.id = pp.product_id
         JOIN brands b ON b.id = pr.brand_id
         WHERE pp.price_list_id = ?`,
        [id]
      ),
    ]);

    const rows = rowsRaw.map((row) => {
      const r = mapRow(row);
      r.material = { name: row.m_name };
      r.thickness = { valueMm: row.t_value_mm };
      return r;
    });
    const edgePrices = edgePricesRaw.map((row) => {
      const p = mapRow(row);
      p.edgeProfile = { name: row.ep_name, priceUnit: row.ep_price_unit };
      p.thickness = row.t_value_mm != null ? { valueMm: row.t_value_mm } : null;
      return p;
    });
    const addOnPrices = addOnPricesRaw.map((row) => {
      const p = mapRow(row);
      p.addOn = { name: row.a_name, priceUnit: row.a_price_unit };
      p.thickness = row.t_value_mm != null ? { valueMm: row.t_value_mm } : null;
      return p;
    });
    const products = productsRaw.map((row) => {
      const p = mapRow(row);
      p.brand = { name: row.b_name };
      return p;
    });
    const productPrices = productPricesRaw.map((row) => {
      const p = mapRow(row);
      p.product = { name: row.pr_name, brand: { name: row.b_name } };
      return p;
    });

    // Gruppera rader per material+tjocklek och varna för luckor (överlapp
    // stoppas redan vid tillägg, men luckor kan uppstå medvetet under arbete).
    const groups = new Map();
    for (const row of rows) {
      const key = `${row.materialId}:${row.thicknessId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    const gapWarnings = [];
    for (const [, groupRows] of groups) {
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
      products,
      productPrices,
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

    const existingRows = mapRows(
      await query('SELECT * FROM countertop_price_rows WHERE price_list_id = ? AND material_id = ? AND thickness_id = ?', [
        priceListId,
        materialId,
        thicknessId,
      ])
    );
    const overlap = existingRows.find((r) => rangesOverlap(r.depthFromMm, r.depthToMm, depthFromMm, depthToMm));
    if (overlap) {
      return res.redirect(`/admin/prislistor/${priceListId}?rowError=${encodeURIComponent(`Djupintervallet överlappar en befintlig rad (${overlap.depthFromMm}-${overlap.depthToMm} mm).`)}`);
    }

    const result = await query(
      'INSERT INTO countertop_price_rows (price_list_id, material_id, thickness_id, depth_from_mm, depth_to_mm, price_per_meter, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [priceListId, materialId, thicknessId, depthFromMm, depthToMm, pricePerMeter]
    );
    await logPriceChange(req, 'CountertopPriceRow', result.insertId, null, { materialId, thicknessId, depthFromMm, depthToMm, pricePerMeter });

    res.redirect(`/admin/prislistor/${priceListId}`);
  } catch (err) {
    next(err);
  }
});

router.post('/prislistor/:id/rader/:rowId/uppdatera', async (req, res, next) => {
  try {
    const priceListId = Number(req.params.id);
    const rowId = Number(req.params.rowId);
    const rows = mapRows(await query('SELECT * FROM countertop_price_rows WHERE id = ? AND price_list_id = ?', [rowId, priceListId]));
    const row = rows[0];
    if (!row) return res.status(404).render('error', { title: 'Hittades inte', message: 'Prisraden kunde inte hittas.' });

    const depthFromMm = Number(req.body.depthFromMm);
    const depthToMm = Number(req.body.depthToMm);
    const pricePerMeter = req.body.pricePerMeter;

    if (!pricePerMeter || Number.isNaN(depthFromMm) || Number.isNaN(depthToMm) || depthFromMm > depthToMm) {
      return res.redirect(`/admin/prislistor/${priceListId}?rowError=${encodeURIComponent('Ogiltigt djupintervall eller pris.')}`);
    }

    const siblings = mapRows(
      await query(
        'SELECT * FROM countertop_price_rows WHERE price_list_id = ? AND material_id = ? AND thickness_id = ? AND id != ?',
        [priceListId, row.materialId, row.thicknessId, rowId]
      )
    );
    const overlap = siblings.find((r) => rangesOverlap(r.depthFromMm, r.depthToMm, depthFromMm, depthToMm));
    if (overlap) {
      return res.redirect(`/admin/prislistor/${priceListId}?rowError=${encodeURIComponent(`Djupintervallet överlappar en annan rad (${overlap.depthFromMm}-${overlap.depthToMm} mm).`)}`);
    }

    await query('UPDATE countertop_price_rows SET depth_from_mm = ?, depth_to_mm = ?, price_per_meter = ? WHERE id = ?', [
      depthFromMm,
      depthToMm,
      pricePerMeter,
      rowId,
    ]);
    await logPriceChange(
      req,
      'CountertopPriceRow',
      rowId,
      { depthFromMm: row.depthFromMm, depthToMm: row.depthToMm, pricePerMeter: row.pricePerMeter },
      { depthFromMm, depthToMm, pricePerMeter }
    );

    res.redirect(`/admin/prislistor/${priceListId}`);
  } catch (err) {
    next(err);
  }
});

router.post('/prislistor/:id/rader/:rowId/ta-bort', async (req, res, next) => {
  try {
    const priceListId = Number(req.params.id);
    const rowId = Number(req.params.rowId);
    const rows = mapRows(await query('SELECT * FROM countertop_price_rows WHERE id = ? AND price_list_id = ?', [rowId, priceListId]));
    const row = rows[0];
    if (!row) return res.status(404).render('error', { title: 'Hittades inte', message: 'Prisraden kunde inte hittas.' });
    await query('DELETE FROM countertop_price_rows WHERE id = ?', [rowId]);
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

    const existingRows = mapRows(
      await query(
        thicknessId == null
          ? 'SELECT * FROM edge_profile_prices WHERE price_list_id = ? AND edge_profile_id = ? AND thickness_id IS NULL'
          : 'SELECT * FROM edge_profile_prices WHERE price_list_id = ? AND edge_profile_id = ? AND thickness_id = ?',
        thicknessId == null ? [priceListId, edgeProfileId] : [priceListId, edgeProfileId, thicknessId]
      )
    );
    const existing = existingRows[0];
    if (existing) {
      await query('UPDATE edge_profile_prices SET price = ? WHERE id = ?', [price, existing.id]);
      await logPriceChange(req, 'EdgeProfilePrice', existing.id, { price: existing.price }, { price });
    } else {
      const result = await query(
        'INSERT INTO edge_profile_prices (price_list_id, edge_profile_id, thickness_id, price, created_at) VALUES (?, ?, ?, ?, NOW())',
        [priceListId, edgeProfileId, thicknessId, price]
      );
      await logPriceChange(req, 'EdgeProfilePrice', result.insertId, null, { edgeProfileId, thicknessId, price });
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

    const existingRows = mapRows(
      await query(
        thicknessId == null
          ? 'SELECT * FROM add_on_prices WHERE price_list_id = ? AND add_on_id = ? AND thickness_id IS NULL'
          : 'SELECT * FROM add_on_prices WHERE price_list_id = ? AND add_on_id = ? AND thickness_id = ?',
        thicknessId == null ? [priceListId, addOnId] : [priceListId, addOnId, thicknessId]
      )
    );
    const existing = existingRows[0];
    if (existing) {
      await query('UPDATE add_on_prices SET price = ? WHERE id = ?', [price, existing.id]);
      await logPriceChange(req, 'AddOnPrice', existing.id, { price: existing.price }, { price });
    } else {
      const result = await query(
        'INSERT INTO add_on_prices (price_list_id, add_on_id, thickness_id, price, created_at) VALUES (?, ?, ?, ?, NOW())',
        [priceListId, addOnId, thicknessId, price]
      );
      await logPriceChange(req, 'AddOnPrice', result.insertId, null, { addOnId, thicknessId, price });
    }

    res.redirect(`/admin/prislistor/${priceListId}`);
  } catch (err) {
    next(err);
  }
});

router.post('/prislistor/:id/produktpriser', async (req, res, next) => {
  try {
    const priceListId = Number(req.params.id);
    const productId = Number(req.body.productId);
    const price = req.body.price;

    if (!productId || !price) {
      return res.redirect(`/admin/prislistor/${priceListId}?rowError=${encodeURIComponent('Produkt och pris krävs.')}`);
    }

    const existingRows = mapRows(
      await query('SELECT * FROM product_prices WHERE price_list_id = ? AND product_id = ?', [priceListId, productId])
    );
    const existing = existingRows[0];
    if (existing) {
      await query('UPDATE product_prices SET price = ? WHERE id = ?', [price, existing.id]);
      await logPriceChange(req, 'ProductPrice', existing.id, { price: existing.price }, { price });
    } else {
      const result = await query('INSERT INTO product_prices (price_list_id, product_id, price, created_at) VALUES (?, ?, ?, NOW())', [
        priceListId,
        productId,
        price,
      ]);
      await logPriceChange(req, 'ProductPrice', result.insertId, null, { productId, price });
    }

    res.redirect(`/admin/prislistor/${priceListId}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
