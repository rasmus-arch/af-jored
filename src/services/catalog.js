const prisma = require('../lib/prisma');

async function getCurrentPriceList(asOf = new Date()) {
  return prisma.priceList.findFirst({
    where: { validFrom: { lte: asOf } },
    orderBy: { validFrom: 'desc' },
  });
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
  const settings = await prisma.settings.findFirst();
  settingsCache = settings || { vatPercentage: '25.00' };
  settingsCacheExpiresAt = Date.now() + SETTINGS_CACHE_MS;
  return settingsCache;
}

function invalidateSettingsCache() {
  settingsCache = null;
  settingsCacheExpiresAt = 0;
}

async function listMaterials({ activeOnly = true } = {}) {
  return prisma.material.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: { sortOrder: 'asc' },
  });
}

async function listBrands({ activeOnly = true } = {}) {
  return prisma.brand.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: { name: 'asc' },
  });
}

async function listCategories() {
  return prisma.decorCategory.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
}

// Distinkta tjockleksvärden (mm) som finns bland aktiva material, för
// filtreringslistor i gränssnittet.
async function listDistinctThicknessValues() {
  const rows = await prisma.thickness.findMany({
    where: { active: true, material: { active: true } },
    select: { valueMm: true },
    distinct: ['valueMm'],
    orderBy: { valueMm: 'asc' },
  });
  return rows.map((r) => r.valueMm);
}

// Sortimentslistning med filter på material, varumärke, tjocklek, kategori,
// status samt fritextsökning på artikelkod/namn.
async function listDecors({ materialId, thicknessMm, categoryId, status, search, activeOnly = true } = {}) {
  const where = {};
  if (materialId) where.materialId = materialId;
  if (categoryId) where.categoryId = categoryId;
  if (status) where.status = status;
  if (activeOnly) {
    where.material = { active: true };
  }
  if (search) {
    where.OR = [
      { articleCode: { contains: search } },
      { name: { contains: search } },
    ];
  }
  if (thicknessMm) {
    where.decorThicknesses = {
      some: { active: true, thickness: { valueMm: Number(thicknessMm) } },
    };
  }

  return prisma.decor.findMany({
    where,
    include: {
      material: true,
      category: true,
      decorThicknesses: { where: { active: true }, include: { thickness: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

async function getDecorByArticleCode(articleCode) {
  return prisma.decor.findUnique({
    where: { articleCode },
    include: {
      material: true,
      category: true,
      decorThicknesses: { where: { active: true }, include: { thickness: true }, orderBy: { thickness: { valueMm: 'asc' } } },
    },
  });
}

async function getDecorById(id) {
  return prisma.decor.findUnique({
    where: { id },
    include: {
      material: true,
      category: true,
      decorThicknesses: { where: { active: true }, include: { thickness: true }, orderBy: { thickness: { valueMm: 'asc' } } },
    },
  });
}

// Varumärken som en viss återförsäljare får se. Om inga rader finns i
// company_brand_access för kunden syns alla aktiva varumärken (standard).
async function listVisibleBrandsForCompany(companyId, { activeOnly = true } = {}) {
  if (!companyId) return listBrands({ activeOnly });

  const access = await prisma.companyBrandAccess.findMany({ where: { companyId } });
  const brands = await listBrands({ activeOnly });
  if (access.length === 0) return brands;

  const visibleIds = new Set(access.filter((a) => a.visible).map((a) => a.brandId));
  return brands.filter((b) => visibleIds.has(b.id));
}

async function getBrandAccessForCompany(companyId) {
  return prisma.companyBrandAccess.findMany({ where: { companyId } });
}

async function listProducts({ type, brandId, activeOnly = true, companyId } = {}) {
  const where = {};
  if (type) where.type = type;
  if (brandId) where.brandId = brandId;
  if (activeOnly) {
    where.active = true;
    where.brand = { active: true };
  }

  const products = await prisma.product.findMany({
    where,
    include: { brand: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  if (!companyId) return products;

  const access = await getBrandAccessForCompany(companyId);
  if (access.length === 0) return products;

  const hiddenIds = new Set(access.filter((a) => !a.visible).map((a) => a.brandId));
  return products.filter((p) => !hiddenIds.has(p.brandId));
}

async function getProductById(id) {
  return prisma.product.findUnique({ where: { id }, include: { brand: true } });
}

async function getProductPrice({ priceListId, productId }) {
  return prisma.productPrice.findUnique({ where: { priceListId_productId: { priceListId, productId } } });
}

async function getCompatibleEdgeProfiles({ materialId, thicknessId }) {
  const compatibilities = await prisma.edgeProfileCompatibility.findMany({
    where: { materialId, thicknessId },
    include: { edgeProfile: true },
  });
  return compatibilities.map((c) => c.edgeProfile).filter((p) => p.active);
}

async function getAvailableAddOns({ materialId }) {
  const links = await prisma.addOnMaterial.findMany({
    where: { materialId },
    include: { addOn: true },
  });
  return links.map((l) => l.addOn).filter((a) => a.active);
}

async function getDiscountRulesForCompany(companyId) {
  return prisma.discountRule.findMany({ where: { companyId } });
}

async function getNetPriceOverridesForCompany(companyId) {
  return prisma.netPriceOverride.findMany({ where: { companyId } });
}

async function getCountertopPriceRows({ priceListId, materialId, thicknessId }) {
  return prisma.countertopPriceRow.findMany({
    where: { priceListId, materialId, thicknessId },
    orderBy: { depthFromMm: 'asc' },
  });
}

// Föredrar en tjockleksspecifik prisrad, annars generell (thicknessId = null).
async function getEdgeProfilePrice({ priceListId, edgeProfileId, thicknessId }) {
  return prisma.edgeProfilePrice.findFirst({
    where: { priceListId, edgeProfileId, OR: [{ thicknessId }, { thicknessId: null }] },
    orderBy: { thicknessId: 'desc' },
  });
}

async function getAddOnPrice({ priceListId, addOnId, thicknessId }) {
  return prisma.addOnPrice.findFirst({
    where: { priceListId, addOnId, OR: [{ thicknessId }, { thicknessId: null }] },
    orderBy: { thicknessId: 'desc' },
  });
}

module.exports = {
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
