// Lägger till exakt den exempeldata som efterfrågats, UTAN att röra
// befintliga konton eller data: rör inte ditt eget adminkonto, skapar
// ENDAST de två kontona nedan (inga andra), och skapar 20 dekorer i
// materialen Laminat (12/20/30/40 mm), Trä (30 mm) och Corian (12/20 mm) -
// dekorer har inget varumärke. Varumärken (Stala, Jored Sinks, DecoSteel)
// används enbart för de fristående produkterna (diskho/blandare/tillbehör).
//
// Skriptet är idempotent: kör det flera gånger utan att skapa dubbletter -
// befintliga rader (matchade på namn/artikelkod/e-post) återanvänds.
//
// Användning:
//   node scripts/seed-example-data.js
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '2';

require('../src/config');
const { pool, query, mapRow } = require('../src/lib/db');
const { hashPassword } = require('../src/lib/passwordHash');

const PASSWORD = 'test123!';

async function getOrCreateMaterial(name, sortOrder) {
  const rows = await query('SELECT * FROM materials WHERE name = ?', [name]);
  if (rows.length > 0) return mapRow(rows[0]);
  const result = await query('INSERT INTO materials (name, active, sort_order, created_at, updated_at) VALUES (?, 1, ?, NOW(), NOW())', [
    name,
    sortOrder,
  ]);
  return { id: result.insertId, name };
}

async function getOrCreateThickness(materialId, valueMm, sortOrder) {
  const rows = await query('SELECT * FROM thicknesses WHERE material_id = ? AND value_mm = ?', [materialId, valueMm]);
  if (rows.length > 0) return mapRow(rows[0]);
  const result = await query('INSERT INTO thicknesses (material_id, value_mm, sort_order, active) VALUES (?, ?, ?, 1)', [
    materialId,
    valueMm,
    sortOrder,
  ]);
  return { id: result.insertId, materialId, valueMm };
}

async function getOrCreateCategory(name, sortOrder) {
  const rows = await query('SELECT * FROM decor_categories WHERE name = ?', [name]);
  if (rows.length > 0) return mapRow(rows[0]);
  const result = await query('INSERT INTO decor_categories (name, sort_order, active) VALUES (?, ?, 1)', [name, sortOrder]);
  return { id: result.insertId, name };
}

async function getOrCreateBrand(name) {
  const rows = await query('SELECT * FROM brands WHERE name = ?', [name]);
  if (rows.length > 0) return mapRow(rows[0]);
  const result = await query('INSERT INTO brands (name, active) VALUES (?, 1)', [name]);
  return { id: result.insertId, name };
}

async function getOrCreateDecor(def) {
  const rows = await query('SELECT * FROM decors WHERE article_code = ?', [def.articleCode]);
  if (rows.length > 0) return mapRow(rows[0]);
  const result = await query(
    `INSERT INTO decors (material_id, category_id, article_code, name, surface_texture, max_length_mm, status, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'AKTIV', ?, NOW(), NOW())`,
    [def.materialId, def.categoryId, def.articleCode, def.name, def.surfaceTexture || null, def.maxLengthMm || null, def.sortOrder || 0]
  );
  return { id: result.insertId, articleCode: def.articleCode };
}

async function ensureDecorThickness(decorId, thicknessId) {
  const rows = await query('SELECT * FROM decor_thicknesses WHERE decor_id = ? AND thickness_id = ?', [decorId, thicknessId]);
  if (rows.length > 0) return;
  await query('INSERT INTO decor_thicknesses (decor_id, thickness_id, active) VALUES (?, ?, 1)', [decorId, thicknessId]);
}

async function ensureCountertopPriceRows(priceListId, materialId, thicknessId, pricePerMm) {
  const rows = await query('SELECT * FROM countertop_price_rows WHERE price_list_id = ? AND material_id = ? AND thickness_id = ?', [
    priceListId,
    materialId,
    thicknessId,
  ]);
  if (rows.length > 0) return;
  const depthRanges = [
    { fromMm: 0, toMm: 635 },
    { fromMm: 636, toMm: 1250 },
    { fromMm: 1251, toMm: 1800 },
  ];
  for (let i = 0; i < depthRanges.length; i++) {
    const range = depthRanges[i];
    const price = (pricePerMm * (1 + i * 0.35) * 10).toFixed(2);
    await query(
      'INSERT INTO countertop_price_rows (price_list_id, material_id, thickness_id, depth_from_mm, depth_to_mm, price_per_meter, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [priceListId, materialId, thicknessId, range.fromMm, range.toMm, price]
    );
  }
}

async function ensureEdgeProfileCompatibility(edgeProfileId, materialId, thicknessId, priceListId) {
  const compatRows = await query(
    'SELECT * FROM edge_profile_compatibilities WHERE edge_profile_id = ? AND material_id = ? AND thickness_id = ?',
    [edgeProfileId, materialId, thicknessId]
  );
  if (compatRows.length === 0) {
    await query('INSERT INTO edge_profile_compatibilities (edge_profile_id, material_id, thickness_id) VALUES (?, ?, ?)', [
      edgeProfileId,
      materialId,
      thicknessId,
    ]);
  }
  const priceRows = await query('SELECT * FROM edge_profile_prices WHERE price_list_id = ? AND edge_profile_id = ? AND thickness_id = ?', [
    priceListId,
    edgeProfileId,
    thicknessId,
  ]);
  if (priceRows.length === 0) {
    await query('INSERT INTO edge_profile_prices (price_list_id, edge_profile_id, thickness_id, price, created_at) VALUES (?, ?, ?, ?, NOW())', [
      priceListId,
      edgeProfileId,
      thicknessId,
      '150.00',
    ]);
  }
}

async function getOrCreateProduct(def) {
  const rows = await query('SELECT * FROM products WHERE article_code = ?', [def.articleCode]);
  if (rows.length > 0) return mapRow(rows[0]);
  const result = await query(
    `INSERT INTO products (type, brand_id, article_code, name, description, active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
    [def.type, def.brandId, def.articleCode, def.name, def.description || null, def.sortOrder || 0]
  );
  return { id: result.insertId, articleCode: def.articleCode };
}

async function ensureProductPrice(priceListId, productId, price) {
  const rows = await query('SELECT * FROM product_prices WHERE price_list_id = ? AND product_id = ?', [priceListId, productId]);
  if (rows.length > 0) return;
  await query('INSERT INTO product_prices (price_list_id, product_id, price, created_at) VALUES (?, ?, ?, NOW())', [
    priceListId,
    productId,
    price,
  ]);
}

async function getOrCreateUser(email, data) {
  const rows = await query('SELECT * FROM users WHERE email = ?', [email]);
  if (rows.length > 0) return mapRow(rows[0]);
  const result = await query(
    'INSERT INTO users (email, company_id, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
    [email, data.companyId ?? null, data.passwordHash, data.role, data.active ? 1 : 0]
  );
  return { id: result.insertId, email };
}

async function main() {
  console.log('Hashar lösenord...');
  const passwordHash = await hashPassword(PASSWORD);

  console.log('Säkerställer material och tjocklekar...');
  const laminat = await getOrCreateMaterial('Laminat', 1);
  const tra = await getOrCreateMaterial('Trä', 3);
  const corian = await getOrCreateMaterial('Corian', 4);

  const laminat12 = await getOrCreateThickness(laminat.id, 12, 0);
  const laminat20 = await getOrCreateThickness(laminat.id, 20, 1);
  const laminat30 = await getOrCreateThickness(laminat.id, 30, 2);
  const laminat40 = await getOrCreateThickness(laminat.id, 40, 3);
  const tra30 = await getOrCreateThickness(tra.id, 30, 2);
  const corian12 = await getOrCreateThickness(corian.id, 12, 0);
  const corian20 = await getOrCreateThickness(corian.id, 20, 1);

  console.log('Säkerställer dekorkategorier...');
  const catSten = await getOrCreateCategory('Sten', 1);
  const catTra = await getOrCreateCategory('Trä', 2);
  const catEnfargad = await getOrCreateCategory('Enfärgad', 3);
  const catMonster = await getOrCreateCategory('Mönster', 4);

  console.log('Säkerställer prislista...');
  const priceListRows = mapRow((await query('SELECT * FROM price_lists ORDER BY valid_from DESC LIMIT 1'))[0]);
  let priceList = priceListRows;
  if (!priceList) {
    const result = await query('INSERT INTO price_lists (name, valid_from, created_at) VALUES (?, ?, NOW())', [
      'Prislista 2026',
      new Date('2026-01-01'),
    ]);
    priceList = { id: result.insertId };
  }

  console.log('Säkerställer priser per material/tjocklek...');
  await ensureCountertopPriceRows(priceList.id, laminat.id, laminat12.id, 1.95);
  await ensureCountertopPriceRows(priceList.id, laminat.id, laminat20.id, 1.95);
  await ensureCountertopPriceRows(priceList.id, laminat.id, laminat30.id, 1.95);
  await ensureCountertopPriceRows(priceList.id, laminat.id, laminat40.id, 1.95);
  await ensureCountertopPriceRows(priceList.id, tra.id, tra30.id, 3.4);
  await ensureCountertopPriceRows(priceList.id, corian.id, corian12.id, 4.1);
  await ensureCountertopPriceRows(priceList.id, corian.id, corian20.id, 4.1);

  console.log('Säkerställer kantprofiler för de nya material/tjocklekarna...');
  const edgeProfiles = await query('SELECT * FROM edge_profiles WHERE active = 1');
  const newCombos = [
    [laminat.id, laminat40.id],
    [tra.id, tra30.id],
    [corian.id, corian12.id],
    [corian.id, corian20.id],
  ];
  for (const profile of edgeProfiles) {
    for (const [materialId, thicknessId] of newCombos) {
      await ensureEdgeProfileCompatibility(profile.id, materialId, thicknessId, priceList.id);
    }
  }

  console.log('Skapar 20 dekorer (Laminat 12/20/30/40 mm, Trä 30 mm, Corian 12/20 mm), utan varumärke...');
  const decorDefs = [
    // Laminat (10 st)
    { articleCode: 'NHK-L01', name: 'Vit Källa', material: laminat, thickness: laminat12, category: catEnfargad, surfaceTexture: 'MAT' },
    { articleCode: 'NHK-L02', name: 'Ek Nordic', material: laminat, thickness: laminat12, category: catTra, surfaceTexture: 'ST9' },
    { articleCode: 'NHK-L03', name: 'Marmor Carrara', material: laminat, thickness: laminat20, category: catSten, surfaceTexture: 'HG' },
    { articleCode: 'NHK-L04', name: 'Antracit', material: laminat, thickness: laminat20, category: catEnfargad, surfaceTexture: 'MAT' },
    { articleCode: 'NHK-L05', name: 'Valnöt Mörk', material: laminat, thickness: laminat20, category: catTra, surfaceTexture: 'ST28' },
    { articleCode: 'NHK-L06', name: 'Terrazzo Ljus', material: laminat, thickness: laminat30, category: catMonster, surfaceTexture: 'ST9' },
    { articleCode: 'NHK-L07', name: 'Betonggrå', material: laminat, thickness: laminat30, category: catSten, surfaceTexture: 'MAT' },
    { articleCode: 'NHK-L08', name: 'Björk Ljus', material: laminat, thickness: laminat30, category: catTra, surfaceTexture: 'ST9' },
    { articleCode: 'NHK-L09', name: 'Kritvit', material: laminat, thickness: laminat40, category: catEnfargad, surfaceTexture: 'MAT' },
    { articleCode: 'NHK-L10', name: 'Skiffer Svart', material: laminat, thickness: laminat40, category: catSten, surfaceTexture: 'HG' },
    // Trä (4 st)
    { articleCode: 'NHK-T01', name: 'Ek Massiv Natur', material: tra, thickness: tra30, category: catTra, surfaceTexture: 'Oljad', maxLengthMm: 3200 },
    { articleCode: 'NHK-T02', name: 'Björk Massiv Vit', material: tra, thickness: tra30, category: catTra, surfaceTexture: 'Lackad', maxLengthMm: 3200 },
    { articleCode: 'NHK-T03', name: 'Valnöt Massiv Mörk', material: tra, thickness: tra30, category: catTra, surfaceTexture: 'Oljad', maxLengthMm: 3200 },
    { articleCode: 'NHK-T04', name: 'Ask Massiv', material: tra, thickness: tra30, category: catTra, surfaceTexture: 'Lackad', maxLengthMm: 3200 },
    // Corian (6 st)
    { articleCode: 'NHK-C01', name: 'Glacier White', material: corian, thickness: corian12, category: catEnfargad, surfaceTexture: 'MAT', maxLengthMm: 3680 },
    { articleCode: 'NHK-C02', name: 'Deep Black', material: corian, thickness: corian12, category: catEnfargad, surfaceTexture: 'MAT', maxLengthMm: 3680 },
    { articleCode: 'NHK-C03', name: 'Grey Onyx', material: corian, thickness: corian20, category: catSten, surfaceTexture: 'MAT', maxLengthMm: 3680 },
    { articleCode: 'NHK-C04', name: 'Sandstone', material: corian, thickness: corian20, category: catSten, surfaceTexture: 'MAT', maxLengthMm: 3680 },
    { articleCode: 'NHK-C05', name: 'Arctic Blue', material: corian, thickness: corian12, category: catMonster, surfaceTexture: 'MAT', maxLengthMm: 3680 },
    { articleCode: 'NHK-C06', name: 'Warm Beige', material: corian, thickness: corian20, category: catEnfargad, surfaceTexture: 'MAT', maxLengthMm: 3680 },
  ];

  for (let i = 0; i < decorDefs.length; i++) {
    const def = decorDefs[i];
    const decor = await getOrCreateDecor({
      articleCode: def.articleCode,
      name: def.name,
      materialId: def.material.id,
      categoryId: def.category.id,
      surfaceTexture: def.surfaceTexture,
      maxLengthMm: def.maxLengthMm,
      sortOrder: i,
    });
    await ensureDecorThickness(decor.id, def.thickness.id);
  }

  console.log('Säkerställer varumärken (endast för produkter, inte dekorer)...');
  const brandStala = await getOrCreateBrand('Stala');
  const brandJoredSinks = await getOrCreateBrand('Jored Sinks');
  const brandDecoSteel = await getOrCreateBrand('DecoSteel');

  console.log('Skapar exempelprodukter (diskhoar, blandare, tillbehör)...');
  const productDefs = [
    { type: 'DISKHO', brand: brandStala, articleCode: 'STL-DH-100', name: 'Stala Enkelho 100', description: 'Rostfri enkelho i matt stål.', price: '1495.00' },
    { type: 'DISKHO', brand: brandJoredSinks, articleCode: 'JS-DH-200', name: 'Jored Sinks Dubbelho 200', description: 'Rostfri dubbelho med avrinningsyta.', price: '2295.00' },
    { type: 'BLANDARE', brand: brandStala, articleCode: 'STL-BL-10', name: 'Stala Köksblandare Solo', description: 'Enarms köksblandare, krom.', price: '895.00' },
    { type: 'BLANDARE', brand: brandDecoSteel, articleCode: 'DS-BL-20', name: 'DecoSteel Köksblandare Pro', description: 'Köksblandare med utdragbar pip, borstad stål.', price: '1695.00' },
    { type: 'TILLBEHOR', brand: brandJoredSinks, articleCode: 'JS-TB-01', name: 'Jored Sinks Diskställ', description: 'Diskställ i rostfritt stål anpassat för dubbelho.', price: '295.00' },
    { type: 'TILLBEHOR', brand: brandDecoSteel, articleCode: 'DS-TB-02', name: 'DecoSteel Skärbräda', description: 'Skärbräda i massivt trä som passar ovanpå hon.', price: '450.00' },
  ];
  for (let i = 0; i < productDefs.length; i++) {
    const def = productDefs[i];
    const product = await getOrCreateProduct({
      type: def.type,
      brandId: def.brand.id,
      articleCode: def.articleCode,
      name: def.name,
      description: def.description,
      sortOrder: i,
    });
    await ensureProductPrice(priceList.id, product.id, def.price);
  }

  console.log('Skapar exakt de två efterfrågade kontona (rör inga andra)...');
  let company = mapRow((await query('SELECT * FROM companies WHERE name = ?', ['Nashulta Kök AB']))[0]);
  if (!company) {
    const result = await query(
      `INSERT INTO companies (name, org_number, street, postal_code, city, contact_name, contact_email, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      ['Nashulta Kök AB', '556000-0001', 'Köksvägen 1', '640 32', 'Nashulta', 'Rasmus', 'rasmus@nashultakok.se']
    );
    company = { id: result.insertId };
  }

  await getOrCreateUser('rasmus@nashultakok.se', {
    companyId: company.id,
    passwordHash,
    role: 'RESELLER',
    active: true,
  });
  await getOrCreateUser('sven@joreds.se', {
    passwordHash,
    role: 'ADMIN',
    active: true,
  });

  console.log('Klart!');
  console.log('Nya/uppdaterade konton (lösenord "test123!" om de precis skapats):');
  console.log('  - rasmus@nashultakok.se (återförsäljare, Nashulta Kök AB)');
  console.log('  - sven@joreds.se (admin)');
  console.log('Inga andra konton har rörts.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
