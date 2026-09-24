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
const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('../src/lib/passwordHash');

const prisma = new PrismaClient();

const PASSWORD = 'test123!';

async function getOrCreateMaterial(name, sortOrder) {
  const existing = await prisma.material.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.material.create({ data: { name, active: true, sortOrder } });
}

async function getOrCreateThickness(materialId, valueMm, sortOrder) {
  const existing = await prisma.thickness.findFirst({ where: { materialId, valueMm } });
  if (existing) return existing;
  return prisma.thickness.create({ data: { materialId, valueMm, sortOrder, active: true } });
}

async function getOrCreateCategory(name, sortOrder) {
  const existing = await prisma.decorCategory.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.decorCategory.create({ data: { name, sortOrder, active: true } });
}

async function getOrCreateBrand(name) {
  const existing = await prisma.brand.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.brand.create({ data: { name, active: true } });
}

async function getOrCreateDecor(def) {
  const existing = await prisma.decor.findUnique({ where: { articleCode: def.articleCode } });
  if (existing) return existing;
  return prisma.decor.create({
    data: {
      materialId: def.materialId,
      categoryId: def.categoryId,
      articleCode: def.articleCode,
      name: def.name,
      surfaceTexture: def.surfaceTexture || null,
      maxLengthMm: def.maxLengthMm || null,
      status: 'AKTIV',
      sortOrder: def.sortOrder || 0,
    },
  });
}

async function ensureDecorThickness(decorId, thicknessId) {
  const existing = await prisma.decorThickness.findFirst({ where: { decorId, thicknessId } });
  if (existing) return existing;
  return prisma.decorThickness.create({ data: { decorId, thicknessId, active: true } });
}

async function ensureCountertopPriceRows(priceListId, materialId, thicknessId, pricePerMm) {
  const existing = await prisma.countertopPriceRow.findFirst({ where: { priceListId, materialId, thicknessId } });
  if (existing) return;
  const depthRanges = [
    { fromMm: 0, toMm: 635 },
    { fromMm: 636, toMm: 1250 },
    { fromMm: 1251, toMm: 1800 },
  ];
  for (let i = 0; i < depthRanges.length; i++) {
    const range = depthRanges[i];
    const price = (pricePerMm * (1 + i * 0.35) * 10).toFixed(2);
    await prisma.countertopPriceRow.create({
      data: { priceListId, materialId, thicknessId, depthFromMm: range.fromMm, depthToMm: range.toMm, pricePerMeter: price },
    });
  }
}

async function ensureEdgeProfileCompatibility(edgeProfileId, materialId, thicknessId, priceListId) {
  const existingCompat = await prisma.edgeProfileCompatibility.findFirst({ where: { edgeProfileId, materialId, thicknessId } });
  if (!existingCompat) {
    await prisma.edgeProfileCompatibility.create({ data: { edgeProfileId, materialId, thicknessId } });
  }
  const existingPrice = await prisma.edgeProfilePrice.findFirst({ where: { priceListId, edgeProfileId, thicknessId } });
  if (!existingPrice) {
    await prisma.edgeProfilePrice.create({ data: { priceListId, edgeProfileId, thicknessId, price: '150.00' } });
  }
}

async function getOrCreateProduct(def) {
  const existing = await prisma.product.findUnique({ where: { articleCode: def.articleCode } });
  if (existing) return existing;
  return prisma.product.create({
    data: {
      type: def.type,
      brandId: def.brandId,
      articleCode: def.articleCode,
      name: def.name,
      description: def.description || null,
      active: true,
      sortOrder: def.sortOrder || 0,
    },
  });
}

async function ensureProductPrice(priceListId, productId, price) {
  const existing = await prisma.productPrice.findUnique({ where: { priceListId_productId: { priceListId, productId } } });
  if (existing) return;
  await prisma.productPrice.create({ data: { priceListId, productId, price } });
}

async function getOrCreateUser(email, data) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({ data: { email, ...data } });
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
  let priceList = await prisma.priceList.findFirst({ orderBy: { validFrom: 'desc' } });
  if (!priceList) {
    priceList = await prisma.priceList.create({ data: { name: 'Prislista 2026', validFrom: new Date('2026-01-01') } });
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
  const edgeProfiles = await prisma.edgeProfile.findMany({ where: { active: true } });
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
  const company = await (async () => {
    const existing = await prisma.company.findFirst({ where: { name: 'Nashulta Kök AB' } });
    if (existing) return existing;
    return prisma.company.create({
      data: {
        name: 'Nashulta Kök AB',
        orgNumber: '556000-0001',
        street: 'Köksvägen 1',
        postalCode: '640 32',
        city: 'Nashulta',
        contactName: 'Rasmus',
        contactEmail: 'rasmus@nashultakok.se',
        active: true,
      },
    });
  })();

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
    await prisma.$disconnect();
  });
