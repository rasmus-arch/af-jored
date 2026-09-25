/* eslint-disable no-console */
// Måste sättas innan något gör async I/O (fil/nätverk/kryptooperationer),
// annars hinner Node redan initiera sin trådpool med standardstorleken.
// Håller nere antalet bakgrundstrådar - viktigt på delad hosting där
// CloudLinux LVE räknar trådar mot kontots processgräns (NPROC/PNO).
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '2';

const path = require('path');
require('../src/config');
const { pool, withTransaction } = require('../src/lib/db');
const { hashPassword } = require('../src/lib/passwordHash');
const { withLock } = require('../scripts/lib/lockfile');

const SEED_PASSWORD = 'ByteMigDirekt123!';
const LOCK_PATH = path.join(__dirname, '..', '.seed.lock');

// Om seed av någon anledning hänger (t.ex. tappad databasanslutning) ska
// processen dö av sig själv istället för att ligga kvar och äta en
// processplats på obestämd tid - se felet i chatten om hängda processer på
// begränsad delad hosting.
const MAX_RUNTIME_MS = 5 * 60 * 1000;
const watchdog = setTimeout(() => {
  console.error(`Seed tog längre än ${MAX_RUNTIME_MS / 1000} sekunder och avbryts. Kontrollera databasanslutningen.`);
  process.exit(1);
}, MAX_RUNTIME_MS);
watchdog.unref();

// Enkla insert-hjälpare som returnerar auto-increment-id:t, för att hålla
// resten av scriptet läsbart.
async function insert(conn, sql, params) {
  const [result] = await conn.query(sql, params);
  return result.insertId;
}

async function main() {
  // Argon2 är avsiktligt tungt (minne + trådar) för att stå emot brute-
  // force - src/lib/passwordHash.js begränsar den till en tråd (parallelism
  // 1) för att undvika "Threading failure" på hårt begränsad delad hosting.
  // Alla seed-användare får samma lösenord, så vi hashar det bara en gång
  // och återanvänder resultatet.
  console.log('Hashar lösenord (kan ta några sekunder)...');
  const seedPasswordHash = await hashPassword(SEED_PASSWORD);

  await withTransaction(async (conn) => {
    // Körs som EN transaktion över EN utcheckad anslutning istället för 28
    // separata frågor mot poolen - färre samtidiga anslutningar/trådar, och
    // en enda commit/rollback för hela rensningen.
    console.log('Rensar befintlig data...');
    const tablesInDeleteOrder = [
      'product_views',
      'document_companies',
      'documents',
      'news_posts',
      'net_price_overrides',
      'discount_rules',
      'company_brand_access',
      'product_prices',
      'products',
      'add_on_prices',
      'edge_profile_prices',
      'countertop_price_rows',
      'price_lists',
      'add_on_materials',
      'add_ons',
      'edge_profile_compatibilities',
      'edge_profiles',
      'decor_thicknesses',
      'decors',
      'decor_categories',
      'thicknesses',
      'brands',
      'materials',
      'invitations',
      'password_reset_tokens',
      'audit_logs',
      'users',
      'companies',
      'settings',
    ];
    for (const table of tablesInDeleteOrder) {
      await conn.query(`DELETE FROM ${table}`);
    }

    console.log('Skapar inställningar...');
    await conn.query('INSERT INTO settings (vat_percentage, updated_at) VALUES (?, NOW())', ['25.00']);

    console.log('Skapar admin...');
    await conn.query(
      'INSERT INTO users (email, password_hash, role, totp_enabled, active, created_at, updated_at) VALUES (?, ?, ?, 0, 1, NOW(), NOW())',
      ['admin@joredspostformning.se', seedPasswordHash, 'ADMIN']
    );

    console.log('Skapar dekorkategorier...');
    const catSten = await insert(conn, 'INSERT INTO decor_categories (name, sort_order, active) VALUES (?, ?, 1)', ['Sten', 1]);
    const catTra = await insert(conn, 'INSERT INTO decor_categories (name, sort_order, active) VALUES (?, ?, 1)', ['Trä', 2]);
    const catEnfargad = await insert(conn, 'INSERT INTO decor_categories (name, sort_order, active) VALUES (?, ?, 1)', ['Enfärgad', 3]);
    const catMonster = await insert(conn, 'INSERT INTO decor_categories (name, sort_order, active) VALUES (?, ?, 1)', ['Mönster', 4]);

    // Varumärken gäller enbart fristående produkter (diskhoar, blandare,
    // tillbehör) - dekorer/bänkskivor har inget varumärke.
    console.log('Skapar varumärken...');
    const brandStala = await insert(conn, 'INSERT INTO brands (name, active) VALUES (?, 1)', ['Stala']);
    const brandJoredSinks = await insert(conn, 'INSERT INTO brands (name, active) VALUES (?, 1)', ['Jored Sinks']);
    const brandDecoSteel = await insert(conn, 'INSERT INTO brands (name, active) VALUES (?, 1)', ['DecoSteel']);

    console.log('Skapar material, tjocklekar och dekorer...');
    const materialDefs = [
      { name: 'Laminat', description: 'Slitstarkt och prisvärt ytskikt.', sortOrder: 1 },
      { name: 'Kompaktlaminat', description: 'Massivt, fuktbeständigt material.', sortOrder: 2 },
      { name: 'Trä', description: 'Massiv trästomme med naturlig känsla.', sortOrder: 3 },
      { name: 'Corian', description: 'Solid yta som kan formas sömlöst.', sortOrder: 4 },
      { name: 'Greengridz', description: 'Miljövänligt komposittmaterial.', sortOrder: 5 },
    ];

    const materials = {}; // { [name]: id }
    for (const def of materialDefs) {
      materials[def.name] = await insert(
        conn,
        'INSERT INTO materials (name, description, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
        [def.name, def.description, def.sortOrder]
      );
    }

    const thicknessValues = [12, 20, 30];
    const thicknesses = {}; // { [materialName]: { [valueMm]: id } }
    for (const [name, materialId] of Object.entries(materials)) {
      thicknesses[name] = {};
      for (let i = 0; i < thicknessValues.length; i++) {
        const valueMm = thicknessValues[i];
        thicknesses[name][valueMm] = await insert(
          conn,
          'INSERT INTO thicknesses (material_id, value_mm, sort_order, active) VALUES (?, ?, ?, 1)',
          [materialId, valueMm, i]
        );
      }
    }

    const decorDefs = [
      // Laminat
      { material: 'Laminat', category: catSten, articleCode: 'F800', name: 'Crystal Marble', surfaceTexture: 'ST9', maxLengthMm: 4080, status: 'AKTIV', thicknessesMm: [12, 30] },
      { material: 'Laminat', category: catTra, articleCode: 'F812', name: 'Nordic Oak', surfaceTexture: 'ST28', maxLengthMm: 4080, status: 'AKTIV', thicknessesMm: [12, 20] },
      { material: 'Laminat', category: catEnfargad, articleCode: 'U100', name: 'Ren Vit', surfaceTexture: 'MAT', maxLengthMm: 4080, status: 'AKTIV', thicknessesMm: [12, 20, 30] },
      // Kompaktlaminat
      { material: 'Kompaktlaminat', category: catSten, articleCode: 'K200', name: 'Basalt Grey', surfaceTexture: 'HG', maxLengthMm: 3660, status: 'AKTIV', thicknessesMm: [12, 20] },
      { material: 'Kompaktlaminat', category: catEnfargad, articleCode: 'K210', name: 'Kolsvart', surfaceTexture: 'MAT', maxLengthMm: 3660, status: 'AKTIV', thicknessesMm: [12, 20, 30] },
      { material: 'Kompaktlaminat', category: catTra, articleCode: 'K220', name: 'Valnöt Ceramic', surfaceTexture: 'ST9', maxLengthMm: 3660, status: 'UTGAENDE', thicknessesMm: [20] },
      // Trä
      { material: 'Trä', category: catTra, articleCode: 'T100', name: 'Ek Massiv', surfaceTexture: 'Oljad', maxLengthMm: 3200, status: 'AKTIV', thicknessesMm: [20, 30] },
      { material: 'Trä', category: catTra, articleCode: 'T110', name: 'Björk Massiv', surfaceTexture: 'Lackad', maxLengthMm: 3200, status: 'AKTIV', thicknessesMm: [20, 30] },
      { material: 'Trä', category: catTra, articleCode: 'T120', name: 'Valnöt Massiv', surfaceTexture: 'Oljad', maxLengthMm: 3200, status: 'AKTIV', thicknessesMm: [30] },
      // Corian
      { material: 'Corian', category: catEnfargad, articleCode: 'C300', name: 'Glacier White', surfaceTexture: 'MAT', maxLengthMm: 3680, status: 'AKTIV', thicknessesMm: [12] },
      { material: 'Corian', category: catSten, articleCode: 'C310', name: 'Grey Onyx', surfaceTexture: 'MAT', maxLengthMm: 3680, status: 'AKTIV', thicknessesMm: [12, 20] },
      { material: 'Corian', category: catEnfargad, articleCode: 'C320', name: 'Deep Black', surfaceTexture: 'MAT', maxLengthMm: 3680, status: 'UTGATT', thicknessesMm: [12] },
      // Greengridz
      { material: 'Greengridz', category: catMonster, articleCode: 'G400', name: 'Terrazzo Green', surfaceTexture: 'ST9', maxLengthMm: 3050, status: 'AKTIV', thicknessesMm: [12, 20] },
      { material: 'Greengridz', category: catEnfargad, articleCode: 'G410', name: 'Sand', surfaceTexture: 'MAT', maxLengthMm: 3050, status: 'AKTIV', thicknessesMm: [12, 20] },
      { material: 'Greengridz', category: catMonster, articleCode: 'G420', name: 'Terrazzo Grey', surfaceTexture: 'ST9', maxLengthMm: 3050, status: 'AKTIV', thicknessesMm: [20] },
    ];

    for (let i = 0; i < decorDefs.length; i++) {
      const def = decorDefs[i];
      const materialId = materials[def.material];
      const decorId = await insert(
        conn,
        `INSERT INTO decors (material_id, category_id, article_code, name, surface_texture, max_length_mm, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [materialId, def.category, def.articleCode, def.name, def.surfaceTexture, def.maxLengthMm, def.status, i]
      );

      for (const mm of def.thicknessesMm) {
        await conn.query('INSERT INTO decor_thicknesses (decor_id, thickness_id, active) VALUES (?, ?, 1)', [
          decorId,
          thicknesses[def.material][mm],
        ]);
      }
    }

    console.log('Skapar kantprofiler...');
    const edgeProfileDefs = [
      { name: 'Rak kant', description: 'Standardkant, rätvinklig.' },
      { name: 'Rundad kant R3', description: 'Lätt rundad kant, radie 3 mm.' },
      { name: 'Fasad kant 45°', description: 'Fasad kant i 45 graders vinkel.' },
    ];
    const edgeProfiles = {}; // { [name]: id }
    for (const def of edgeProfileDefs) {
      edgeProfiles[def.name] = await insert(
        conn,
        'INSERT INTO edge_profiles (name, description, price_unit, active) VALUES (?, ?, ?, 1)',
        [def.name, def.description, 'LOPMETER']
      );
    }
    // Alla kantprofiler kompatibla med Laminat och Kompaktlaminat i alla tjocklekar,
    // som exempel på att kompatibilitet styrs per material+tjocklek.
    for (const materialName of ['Laminat', 'Kompaktlaminat']) {
      for (const mm of thicknessValues) {
        for (const edgeProfileId of Object.values(edgeProfiles)) {
          await conn.query('INSERT INTO edge_profile_compatibilities (edge_profile_id, material_id, thickness_id) VALUES (?, ?, ?)', [
            edgeProfileId,
            materials[materialName],
            thicknesses[materialName][mm],
          ]);
        }
      }
    }

    console.log('Skapar tillval...');
    const addOnDefs = [
      { name: 'Urtag för diskho', priceUnit: 'STYCK', materials: ['Laminat', 'Kompaktlaminat', 'Corian'] },
      { name: 'Underlimmad ho', priceUnit: 'STYCK', materials: ['Corian'] },
      { name: 'Hål för blandare', priceUnit: 'STYCK', materials: ['Laminat', 'Kompaktlaminat', 'Corian', 'Trä'] },
      { name: 'Ändlist', priceUnit: 'LOPMETER', materials: ['Laminat', 'Kompaktlaminat'] },
      { name: 'Väggskydd', priceUnit: 'LOPMETER', materials: ['Laminat', 'Kompaktlaminat', 'Trä'] },
    ];
    const addOns = {}; // { [name]: { id, priceUnit } }
    for (const def of addOnDefs) {
      const addOnId = await insert(conn, 'INSERT INTO add_ons (name, price_unit, active) VALUES (?, ?, 1)', [def.name, def.priceUnit]);
      addOns[def.name] = { id: addOnId, priceUnit: def.priceUnit };
      for (const materialName of def.materials) {
        await conn.query('INSERT INTO add_on_materials (add_on_id, material_id) VALUES (?, ?)', [addOnId, materials[materialName]]);
      }
    }

    console.log('Skapar produkter (diskhoar, blandare, tillbehör)...');
    const productDefs = [
      { type: 'DISKHO', brandId: brandStala, articleCode: 'STL-DH-100', name: 'Stala Enkelho 100', description: 'Rostfri enkelho i matt stål.' },
      { type: 'DISKHO', brandId: brandJoredSinks, articleCode: 'JS-DH-200', name: 'Jored Sinks Dubbelho 200', description: 'Rostfri dubbelho med avrinningsyta.' },
      { type: 'BLANDARE', brandId: brandStala, articleCode: 'STL-BL-10', name: 'Stala Köksblandare Solo', description: 'Enarms köksblandare, krom.' },
      { type: 'BLANDARE', brandId: brandDecoSteel, articleCode: 'DS-BL-20', name: 'DecoSteel Köksblandare Pro', description: 'Köksblandare med utdragbar pip, borstad stål.' },
      { type: 'TILLBEHOR', brandId: brandJoredSinks, articleCode: 'JS-TB-01', name: 'Jored Sinks Diskställ', description: 'Diskställ i rostfritt stål anpassat för dubbelho.' },
      { type: 'TILLBEHOR', brandId: brandDecoSteel, articleCode: 'DS-TB-02', name: 'DecoSteel Skärbräda', description: 'Skärbräda i massivt trä som passar ovanpå hon.' },
    ];
    const products = {}; // { [articleCode]: id }
    for (let i = 0; i < productDefs.length; i++) {
      const def = productDefs[i];
      products[def.articleCode] = await insert(
        conn,
        `INSERT INTO products (type, brand_id, article_code, name, description, active, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
        [def.type, def.brandId, def.articleCode, def.name, def.description, i]
      );
    }

    console.log('Skapar prislista med prisrader...');
    const priceListId = await insert(conn, 'INSERT INTO price_lists (name, valid_from, created_at) VALUES (?, ?, NOW())', [
      'Prislista 2026',
      new Date('2026-01-01'),
    ]);

    // Tre djupintervall per material+tjocklek. Priset per löpmeter ökar med
    // både djup och tjocklek, som exempel.
    const depthRanges = [
      { fromMm: 0, toMm: 635 },
      { fromMm: 636, toMm: 1250 },
      { fromMm: 1251, toMm: 1800 },
    ];
    const basePricePerMm = { Laminat: 1.95, Kompaktlaminat: 2.6, Trä: 3.4, Corian: 4.1, Greengridz: 2.9 };

    for (const [materialName, materialId] of Object.entries(materials)) {
      for (const mm of thicknessValues) {
        const thicknessId = thicknesses[materialName][mm];
        for (let i = 0; i < depthRanges.length; i++) {
          const range = depthRanges[i];
          const price = (basePricePerMm[materialName] * mm * (1 + i * 0.35) * 10).toFixed(2);
          await conn.query(
            'INSERT INTO countertop_price_rows (price_list_id, material_id, thickness_id, depth_from_mm, depth_to_mm, price_per_meter, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [priceListId, materialId, thicknessId, range.fromMm, range.toMm, price]
          );
        }
      }
    }

    for (const edgeProfileId of Object.values(edgeProfiles)) {
      await conn.query('INSERT INTO edge_profile_prices (price_list_id, edge_profile_id, price, created_at) VALUES (?, ?, ?, NOW())', [
        priceListId,
        edgeProfileId,
        '150.00',
      ]);
    }
    for (const addOn of Object.values(addOns)) {
      const price = addOn.priceUnit === 'STYCK' ? '450.00' : '95.00';
      await conn.query('INSERT INTO add_on_prices (price_list_id, add_on_id, price, created_at) VALUES (?, ?, ?, NOW())', [
        priceListId,
        addOn.id,
        price,
      ]);
    }

    const productPrices = {
      'STL-DH-100': '1495.00',
      'JS-DH-200': '2295.00',
      'STL-BL-10': '895.00',
      'DS-BL-20': '1695.00',
      'JS-TB-01': '295.00',
      'DS-TB-02': '450.00',
    };
    for (const [articleCode, price] of Object.entries(productPrices)) {
      await conn.query('INSERT INTO product_prices (price_list_id, product_id, price, created_at) VALUES (?, ?, ?, NOW())', [
        priceListId,
        products[articleCode],
        price,
      ]);
    }

    console.log('Skapar återförsäljare, användare och rabattregler...');
    const companyA = await insert(
      conn,
      `INSERT INTO companies (name, org_number, street, postal_code, city, contact_name, contact_email, contact_phone, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      ['Kakelspecialisten AB', '556123-4567', 'Verkstadsgatan 4', '541 34', 'Skövde', 'Anna Andersson', 'anna@kakelspecialisten.se', '0500-123 456']
    );
    const companyB = await insert(
      conn,
      `INSERT INTO companies (name, org_number, street, postal_code, city, contact_name, contact_email, contact_phone, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      ['Köksmontören i Väst AB', '556765-4321', 'Industrivägen 12', '541 45', 'Skövde', 'Björn Berg', 'bjorn@koksmontoren.se', '0500-987 654']
    );

    await conn.query(
      'INSERT INTO users (company_id, email, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())',
      [companyA, 'anna@kakelspecialisten.se', seedPasswordHash, 'RESELLER']
    );
    await conn.query(
      'INSERT INTO users (company_id, email, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())',
      [companyA, 'kollega@kakelspecialisten.se', seedPasswordHash, 'RESELLER']
    );
    await conn.query(
      'INSERT INTO users (company_id, email, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())',
      [companyB, 'bjorn@koksmontoren.se', seedPasswordHash, 'RESELLER']
    );

    // Company A: 25% på Laminat, 15% på Corian, samt 20% på varumärket Stala.
    await conn.query(
      'INSERT INTO discount_rules (company_id, material_id, discount_percent, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
      [companyA, materials.Laminat, '25.00']
    );
    await conn.query(
      'INSERT INTO discount_rules (company_id, material_id, discount_percent, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
      [companyA, materials.Corian, '15.00']
    );
    await conn.query(
      'INSERT INTO discount_rules (company_id, brand_id, discount_percent, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
      [companyA, brandStala, '20.00']
    );

    // Company B: 20% specifikt på Kompaktlaminat, plus 10% på DecoSteel. Ser
    // inte Jored Sinks alls (varumärkessynlighet avstängd för den kunden).
    await conn.query(
      'INSERT INTO discount_rules (company_id, material_id, discount_percent, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
      [companyB, materials.Kompaktlaminat, '20.00']
    );
    await conn.query(
      'INSERT INTO discount_rules (company_id, brand_id, discount_percent, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
      [companyB, brandDecoSteel, '10.00']
    );
    await conn.query('INSERT INTO company_brand_access (company_id, brand_id, visible) VALUES (?, ?, 0)', [companyB, brandJoredSinks]);

    console.log('Skapar nyhet och exempeldokument...');
    await conn.query(
      'INSERT INTO news_posts (title, body, published_at, active, created_at, updated_at) VALUES (?, ?, NOW(), 1, NOW(), NOW())',
      ['Välkommen till nya återförsäljarportalen', 'Här hittar ni sortiment, priser och dokument samlat på ett ställe.']
    );
  });

  console.log('Klart!');
  console.log(`Alla seed-användare har lösenordet: ${SEED_PASSWORD}`);
}

withLock(LOCK_PATH, main)
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
