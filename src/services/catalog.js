const { query } = require('../lib/db');

// Prisma exponerade alltid fältnamn i camelCase (utifrån @map-direktiven i
// schema.prisma) även om kolumnerna i databasen är snake_case. mapRow/mapRows
// gör samma omvandling på raka mysql2-rader, så resten av appen (routes,
// vyer) kan fortsätta läsa t.ex. `decor.articleCode` och `decor.materialId`
// utan ändringar.
function toCamel(key) {
  return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function mapRow(row) {
  if (!row) return row;
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[toCamel(key)] = value;
  }
  return mapped;
}

function mapRows(rows) {
  return rows.map(mapRow);
}

async function getCurrentPriceList(asOf = new Date()) {
  const rows = await query(
    'SELECT * FROM price_lists WHERE valid_from <= ? ORDER BY valid_from DESC LIMIT 1',
    [asOf]
  );
  return mapRow(rows[0]);
}

// Inställningarna (moms, logga, accentfärg) läses numera på varje request
// (bl.a. globalt i app.js för att kunna visa logga/accentfärg överallt), så
// de cachas kort i minnet för att inte lägga en extra databasfråga på varje
// enda sidvisning - särskilt viktigt på hosting med hårt begränsat antal
// processer/anslutningar (se tidigare CloudLinux LVE-problem). Cachen
// nollställs direkt när admin sparar inställningar.
const SETTINGS_CACHE_MS = 30 * 1000;
let settingsCache = null;
let settingsCacheExpiresAt = 0;

async function getSettings() {
  if (settingsCache && Date.now() < settingsCacheExpiresAt) {
    return settingsCache;
  }
  const rows = await query('SELECT * FROM settings LIMIT 1');
  settingsCache = mapRow(rows[0]) || { vatPercentage: '25.00' };
  settingsCacheExpiresAt = Date.now() + SETTINGS_CACHE_MS;
  return settingsCache;
}

function invalidateSettingsCache() {
  settingsCache = null;
  settingsCacheExpiresAt = 0;
}

async function listMaterials({ activeOnly = true } = {}) {
  const sql = `SELECT * FROM materials ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY sort_order ASC`;
  return mapRows(await query(sql));
}

async function listBrands({ activeOnly = true } = {}) {
  const sql = `SELECT * FROM brands ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY name ASC`;
  return mapRows(await query(sql));
}

async function listCategories() {
  return mapRows(await query('SELECT * FROM decor_categories WHERE active = 1 ORDER BY sort_order ASC'));
}

// Distinkta tjockleksvärden (mm) som finns bland aktiva material, för
// filtreringslistor i gränssnittet.
async function listDistinctThicknessValues() {
  const rows = await query(
    `SELECT DISTINCT t.value_mm AS value_mm
     FROM thicknesses t
     JOIN materials m ON m.id = t.material_id
     WHERE t.active = 1 AND m.active = 1
     ORDER BY t.value_mm ASC`
  );
  return rows.map((r) => r.value_mm);
}

// Hämtar material/kategori/tjocklekar för en uppsättning dekorer i tre
// samlade frågor (istället för en fråga per dekor) och sätter ihop dem till
// samma nästlade form som Prisma gav med `include`.
async function attachDecorRelations(decors) {
  if (decors.length === 0) return decors;

  const materialIds = [...new Set(decors.map((d) => d.materialId))];
  const categoryIds = [...new Set(decors.map((d) => d.categoryId))];
  const decorIds = decors.map((d) => d.id);

  const [materials, categories, thicknessLinks] = await Promise.all([
    mapRows(await query(`SELECT * FROM materials WHERE id IN (?)`, [materialIds])),
    mapRows(await query(`SELECT * FROM decor_categories WHERE id IN (?)`, [categoryIds])),
    query(
      `SELECT dt.id, dt.decor_id, dt.thickness_id, dt.active,
              t.id AS t_id, t.material_id AS t_material_id, t.value_mm AS t_value_mm,
              t.sort_order AS t_sort_order, t.active AS t_active
       FROM decor_thicknesses dt
       JOIN thicknesses t ON t.id = dt.thickness_id
       WHERE dt.decor_id IN (?) AND dt.active = 1
       ORDER BY t.value_mm ASC`,
      [decorIds]
    ),
  ]);

  const materialById = new Map(materials.map((m) => [m.id, m]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const thicknessesByDecorId = new Map();
  for (const link of thicknessLinks) {
    const entry = {
      id: link.id,
      decorId: link.decor_id,
      thicknessId: link.thickness_id,
      active: link.active,
      thickness: {
        id: link.t_id,
        materialId: link.t_material_id,
        valueMm: link.t_value_mm,
        sortOrder: link.t_sort_order,
        active: link.t_active,
      },
    };
    if (!thicknessesByDecorId.has(link.decor_id)) thicknessesByDecorId.set(link.decor_id, []);
    thicknessesByDecorId.get(link.decor_id).push(entry);
  }

  return decors.map((d) => ({
    ...d,
    material: materialById.get(d.materialId),
    category: categoryById.get(d.categoryId),
    decorThicknesses: thicknessesByDecorId.get(d.id) || [],
  }));
}

// Sortimentslistning med filter på material, tjocklek, kategori, status samt
// fritextsökning på artikelkod/namn.
async function listDecors({ materialId, thicknessMm, categoryId, status, search, activeOnly = true } = {}) {
  const where = [];
  const params = [];

  if (materialId) {
    where.push('material_id = ?');
    params.push(materialId);
  }
  if (categoryId) {
    where.push('category_id = ?');
    params.push(categoryId);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (activeOnly) {
    where.push('material_id IN (SELECT id FROM materials WHERE active = 1)');
  }
  if (search) {
    where.push('(article_code LIKE ? OR name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (thicknessMm) {
    where.push(
      'EXISTS (SELECT 1 FROM decor_thicknesses dt JOIN thicknesses t ON t.id = dt.thickness_id WHERE dt.decor_id = decors.id AND dt.active = 1 AND t.value_mm = ?)'
    );
    params.push(Number(thicknessMm));
  }

  const sql = `SELECT * FROM decors ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY sort_order ASC, name ASC`;
  const decors = mapRows(await query(sql, params));
  return attachDecorRelations(decors);
}

async function getDecorByArticleCode(articleCode) {
  const rows = mapRows(await query('SELECT * FROM decors WHERE article_code = ?', [articleCode]));
  const [decor] = await attachDecorRelations(rows);
  return decor || null;
}

async function getDecorById(id) {
  const rows = mapRows(await query('SELECT * FROM decors WHERE id = ?', [id]));
  const [decor] = await attachDecorRelations(rows);
  return decor || null;
}

// Varumärken som en viss återförsäljare får se. Ett varumärke är synligt som
// standard - det döljs bara om det finns en explicit company_brand_access-
// rad för just det varumärket med visible=false. (Tidigare version tolkade
// EN rad med visible=true som en fullständig allow-lista och dolde av
// misstag alla andra varumärken så fort ett enda varumärke stängts av för en
// kund - fixat här.)
async function listVisibleBrandsForCompany(companyId, { activeOnly = true } = {}) {
  const brands = await listBrands({ activeOnly });
  if (!companyId) return brands;

  const access = await getBrandAccessForCompany(companyId);
  const hiddenIds = new Set(access.filter((a) => !a.visible).map((a) => a.brandId));
  return brands.filter((b) => !hiddenIds.has(b.id));
}

async function getBrandAccessForCompany(companyId) {
  return mapRows(await query('SELECT * FROM company_brand_access WHERE company_id = ?', [companyId]));
}

async function listProducts({ type, brandId, activeOnly = true, companyId } = {}) {
  const where = [];
  const params = [];

  if (type) {
    where.push('p.type = ?');
    params.push(type);
  }
  if (brandId) {
    where.push('p.brand_id = ?');
    params.push(brandId);
  }
  if (activeOnly) {
    where.push('p.active = 1');
    where.push('b.active = 1');
  }

  const sql = `
    SELECT p.*,
           b.id AS b_id, b.name AS b_name, b.logo_url AS b_logo_url, b.active AS b_active
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY p.sort_order ASC, p.name ASC
  `;
  const rows = await query(sql, params);
  const products = rows.map((row) => {
    const product = mapRow(row);
    product.brand = { id: row.b_id, name: row.b_name, logoUrl: row.b_logo_url, active: row.b_active };
    return product;
  });

  if (!companyId) return products;

  const access = await getBrandAccessForCompany(companyId);
  if (access.length === 0) return products;

  const hiddenIds = new Set(access.filter((a) => !a.visible).map((a) => a.brandId));
  return products.filter((p) => !hiddenIds.has(p.brandId));
}

async function getProductById(id) {
  const rows = await query(
    `SELECT p.*,
            b.id AS b_id, b.name AS b_name, b.logo_url AS b_logo_url, b.active AS b_active
     FROM products p
     JOIN brands b ON b.id = p.brand_id
     WHERE p.id = ?`,
    [id]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const product = mapRow(row);
  product.brand = { id: row.b_id, name: row.b_name, logoUrl: row.b_logo_url, active: row.b_active };
  return product;
}

async function getProductPrice({ priceListId, productId }) {
  const rows = await query('SELECT * FROM product_prices WHERE price_list_id = ? AND product_id = ? LIMIT 1', [
    priceListId,
    productId,
  ]);
  return mapRow(rows[0]);
}

async function getCompatibleEdgeProfiles({ materialId, thicknessId }) {
  const rows = await query(
    `SELECT ep.*
     FROM edge_profile_compatibilities epc
     JOIN edge_profiles ep ON ep.id = epc.edge_profile_id
     WHERE epc.material_id = ? AND epc.thickness_id = ? AND ep.active = 1`,
    [materialId, thicknessId]
  );
  return mapRows(rows);
}

async function getAvailableAddOns({ materialId }) {
  const rows = await query(
    `SELECT a.*
     FROM add_on_materials aom
     JOIN add_ons a ON a.id = aom.add_on_id
     WHERE aom.material_id = ? AND a.active = 1`,
    [materialId]
  );
  return mapRows(rows);
}

async function getDiscountRulesForCompany(companyId) {
  return mapRows(await query('SELECT * FROM discount_rules WHERE company_id = ?', [companyId]));
}

async function getNetPriceOverridesForCompany(companyId) {
  return mapRows(await query('SELECT * FROM net_price_overrides WHERE company_id = ?', [companyId]));
}

async function getCountertopPriceRows({ priceListId, materialId, thicknessId }) {
  return mapRows(
    await query(
      'SELECT * FROM countertop_price_rows WHERE price_list_id = ? AND material_id = ? AND thickness_id = ? ORDER BY depth_from_mm ASC',
      [priceListId, materialId, thicknessId]
    )
  );
}

// Föredrar en tjockleksspecifik prisrad, annars generell (thicknessId = null).
// I MySQL sorterar NULL som minsta värde, så ORDER BY thickness_id DESC
// listar en specifik tjocklek (positivt heltal) före NULL - samma prioritet
// som tidigare med Prisma.
async function getEdgeProfilePrice({ priceListId, edgeProfileId, thicknessId }) {
  const rows = await query(
    `SELECT * FROM edge_profile_prices
     WHERE price_list_id = ? AND edge_profile_id = ? AND (thickness_id = ? OR thickness_id IS NULL)
     ORDER BY thickness_id DESC LIMIT 1`,
    [priceListId, edgeProfileId, thicknessId]
  );
  return mapRow(rows[0]);
}

async function getAddOnPrice({ priceListId, addOnId, thicknessId }) {
  const rows = await query(
    `SELECT * FROM add_on_prices
     WHERE price_list_id = ? AND add_on_id = ? AND (thickness_id = ? OR thickness_id IS NULL)
     ORDER BY thickness_id DESC LIMIT 1`,
    [priceListId, addOnId, thicknessId]
  );
  return mapRow(rows[0]);
}

module.exports = {
  mapRow,
  mapRows,
  getCurrentPriceList,
  getSettings,
  invalidateSettingsCache,
  listMaterials,
  listBrands,
  listCategories,
  listDistinctThicknessValues,
  listDecors,
  getDecorByArticleCode,
  getDecorById,
  getCompatibleEdgeProfiles,
  getAvailableAddOns,
  getDiscountRulesForCompany,
  getNetPriceOverridesForCompany,
  getCountertopPriceRows,
  getEdgeProfilePrice,
  getAddOnPrice,
  listVisibleBrandsForCompany,
  getBrandAccessForCompany,
  listProducts,
  getProductById,
  getProductPrice,
};
