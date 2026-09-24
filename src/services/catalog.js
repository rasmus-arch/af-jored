const prisma = require('../lib/prisma');

async function getCurrentPriceList(asOf = new Date()) {
  return prisma.priceList.findFirst({
    where: { validFrom: { lte: asOf } },
    orderBy: { validFrom: 'desc' },
  });
}

async function getSettings() {
  const settings = await prisma.settings.findFirst();
  return settings || { vatPercentage: '25.00' };
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
async function listDecors({ materialId, brandId, thicknessMm, categoryId, status, search, activeOnly = true } = {}) {
  const where = {};
  if (materialId) where.materialId = materialId;
  if (brandId) where.brandId = brandId;
  if (categoryId) where.categoryId = categoryId;
  if (status) where.status = status;
  if (activeOnly) {
    where.material = { active: true };
    where.brand = { active: true };
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
      brand: true,
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
      brand: true,
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
      brand: true,
      category: true,
      decorThicknesses: { where: { active: true }, include: { thickness: true }, orderBy: { thickness: { valueMm: 'asc' } } },
    },
  });
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
};
