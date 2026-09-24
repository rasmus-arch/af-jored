/* eslint-disable no-console */
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const { withLock } = require('../scripts/lib/lockfile');

const prisma = new PrismaClient();

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

async function main() {
  // Argon2 är avsiktligt tungt (minne + flera trådar) för att stå emot
  // brute-force. Alla seed-användare får samma lösenord, så vi hashar det
  // bara en gång och återanvänder resultatet - annars blir seed onödigt
  // resurskrävande (särskilt märkbart på begränsad delad hosting).
  console.log('Hashar lösenord (kan ta några sekunder)...');
  const seedPasswordHash = await argon2.hash(SEED_PASSWORD);

  console.log('Rensar befintlig data...');
  await prisma.productView.deleteMany();
  await prisma.documentCompany.deleteMany();
  await prisma.document.deleteMany();
  await prisma.newsPost.deleteMany();
  await prisma.netPriceOverride.deleteMany();
  await prisma.discountRule.deleteMany();
  await prisma.addOnPrice.deleteMany();
  await prisma.edgeProfilePrice.deleteMany();
  await prisma.countertopPriceRow.deleteMany();
  await prisma.priceList.deleteMany();
  await prisma.addOnMaterial.deleteMany();
  await prisma.addOn.deleteMany();
  await prisma.edgeProfileCompatibility.deleteMany();
  await prisma.edgeProfile.deleteMany();
  await prisma.decorThickness.deleteMany();
  await prisma.decor.deleteMany();
  await prisma.decorCategory.deleteMany();
  await prisma.thickness.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.material.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
  await prisma.settings.deleteMany();

  console.log('Skapar inställningar...');
  await prisma.settings.create({ data: { vatPercentage: '25.00' } });

  console.log('Skapar admin...');
  await prisma.user.create({
    data: {
      email: 'admin@joredspostformning.se',
      passwordHash: seedPasswordHash,
      role: 'ADMIN',
      totpEnabled: false, // kan aktiveras frivilligt via Mitt konto
      active: true,
    },
  });

  console.log('Skapar dekorkategorier...');
  const [catSten, catTra, catEnfargad, catMonster] = await Promise.all([
    prisma.decorCategory.create({ data: { name: 'Sten', sortOrder: 1 } }),
    prisma.decorCategory.create({ data: { name: 'Trä', sortOrder: 2 } }),
    prisma.decorCategory.create({ data: { name: 'Enfärgad', sortOrder: 3 } }),
    prisma.decorCategory.create({ data: { name: 'Mönster', sortOrder: 4 } }),
  ]);

  console.log('Skapar varumärken...');
  const [brandNordisk, brandSkandinavisk, brandKompakt] = await Promise.all([
    prisma.brand.create({ data: { name: 'Nordisk Ytskikt', active: true } }),
    prisma.brand.create({ data: { name: 'Skandinavisk Laminat', active: true } }),
    prisma.brand.create({ data: { name: 'Kompakt & Co', active: true } }),
  ]);

  console.log('Skapar material, tjocklekar och dekorer...');
  const materialDefs = [
    { name: 'Laminat', description: 'Slitstarkt och prisvärt ytskikt.', sortOrder: 1 },
    { name: 'Kompaktlaminat', description: 'Massivt, fuktbeständigt material.', sortOrder: 2 },
    { name: 'Trä', description: 'Massiv trästomme med naturlig känsla.', sortOrder: 3 },
    { name: 'Corian', description: 'Solid yta som kan formas sömlöst.', sortOrder: 4 },
    { name: 'Greengridz', description: 'Miljövänligt komposittmaterial.', sortOrder: 5 },
  ];

  const materials = {};
  for (const def of materialDefs) {
    materials[def.name] = await prisma.material.create({ data: { ...def, active: true } });
  }

  const thicknessValues = [12, 20, 30];
  const thicknesses = {}; // { [materialName]: { [valueMm]: Thickness } }
  for (const [name, material] of Object.entries(materials)) {
    thicknesses[name] = {};
    for (let i = 0; i < thicknessValues.length; i++) {
      const valueMm = thicknessValues[i];
      thicknesses[name][valueMm] = await prisma.thickness.create({
        data: { materialId: material.id, valueMm, sortOrder: i, active: true },
      });
    }
  }

  const decorDefs = [
    // Laminat
    { material: 'Laminat', brand: brandNordisk, category: catSten, articleCode: 'F800', name: 'Crystal Marble', surfaceTexture: 'ST9', maxLengthMm: 4080, status: 'AKTIV', thicknessesMm: [12, 30] },
    { material: 'Laminat', brand: brandSkandinavisk, category: catTra, articleCode: 'F812', name: 'Nordic Oak', surfaceTexture: 'ST28', maxLengthMm: 4080, status: 'AKTIV', thicknessesMm: [12, 20] },
    { material: 'Laminat', brand: brandSkandinavisk, category: catEnfargad, articleCode: 'U100', name: 'Ren Vit', surfaceTexture: 'MAT', maxLengthMm: 4080, status: 'AKTIV', thicknessesMm: [12, 20, 30] },
    // Kompaktlaminat
    { material: 'Kompaktlaminat', brand: brandKompakt, category: catSten, articleCode: 'K200', name: 'Basalt Grey', surfaceTexture: 'HG', maxLengthMm: 3660, status: 'AKTIV', thicknessesMm: [12, 20] },
    { material: 'Kompaktlaminat', brand: brandKompakt, category: catEnfargad, articleCode: 'K210', name: 'Kolsvart', surfaceTexture: 'MAT', maxLengthMm: 3660, status: 'AKTIV', thicknessesMm: [12, 20, 30] },
    { material: 'Kompaktlaminat', brand: brandNordisk, category: catTra, articleCode: 'K220', name: 'Valnöt Ceramic', surfaceTexture: 'ST9', maxLengthMm: 3660, status: 'UTGAENDE', thicknessesMm: [20] },
    // Trä
    { material: 'Trä', brand: brandNordisk, category: catTra, articleCode: 'T100', name: 'Ek Massiv', surfaceTexture: 'Oljad', maxLengthMm: 3200, status: 'AKTIV', thicknessesMm: [20, 30] },
    { material: 'Trä', brand: brandNordisk, category: catTra, articleCode: 'T110', name: 'Björk Massiv', surfaceTexture: 'Lackad', maxLengthMm: 3200, status: 'AKTIV', thicknessesMm: [20, 30] },
    { material: 'Trä', brand: brandSkandinavisk, category: catTra, articleCode: 'T120', name: 'Valnöt Massiv', surfaceTexture: 'Oljad', maxLengthMm: 3200, status: 'AKTIV', thicknessesMm: [30] },
    // Corian
    { material: 'Corian', brand: brandKompakt, category: catEnfargad, articleCode: 'C300', name: 'Glacier White', surfaceTexture: 'MAT', maxLengthMm: 3680, status: 'AKTIV', thicknessesMm: [12] },
    { material: 'Corian', brand: brandKompakt, category: catSten, articleCode: 'C310', name: 'Grey Onyx', surfaceTexture: 'MAT', maxLengthMm: 3680, status: 'AKTIV', thicknessesMm: [12, 20] },
    { material: 'Corian', brand: brandNordisk, category: catEnfargad, articleCode: 'C320', name: 'Deep Black', surfaceTexture: 'MAT', maxLengthMm: 3680, status: 'UTGATT', thicknessesMm: [12] },
    // Greengridz
    { material: 'Greengridz', brand: brandSkandinavisk, category: catMonster, articleCode: 'G400', name: 'Terrazzo Green', surfaceTexture: 'ST9', maxLengthMm: 3050, status: 'AKTIV', thicknessesMm: [12, 20] },
    { material: 'Greengridz', brand: brandSkandinavisk, category: catEnfargad, articleCode: 'G410', name: 'Sand', surfaceTexture: 'MAT', maxLengthMm: 3050, status: 'AKTIV', thicknessesMm: [12, 20] },
    { material: 'Greengridz', brand: brandKompakt, category: catMonster, articleCode: 'G420', name: 'Terrazzo Grey', surfaceTexture: 'ST9', maxLengthMm: 3050, status: 'AKTIV', thicknessesMm: [20] },
  ];

  const decors = {};
  for (let i = 0; i < decorDefs.length; i++) {
    const def = decorDefs[i];
    const material = materials[def.material];
    const decor = await prisma.decor.create({
      data: {
        materialId: material.id,
        brandId: def.brand.id,
        categoryId: def.category.id,
        articleCode: def.articleCode,
        name: def.name,
        surfaceTexture: def.surfaceTexture,
        maxLengthMm: def.maxLengthMm,
        status: def.status,
        sortOrder: i,
      },
    });
    decors[def.articleCode] = decor;

    for (const mm of def.thicknessesMm) {
      await prisma.decorThickness.create({
        data: { decorId: decor.id, thicknessId: thicknesses[def.material][mm].id, active: true },
      });
    }
  }

  console.log('Skapar kantprofiler...');
  const edgeProfileDefs = [
    { name: 'Rak kant', description: 'Standardkant, rätvinklig.' },
    { name: 'Rundad kant R3', description: 'Lätt rundad kant, radie 3 mm.' },
    { name: 'Fasad kant 45°', description: 'Fasad kant i 45 graders vinkel.' },
  ];
  const edgeProfiles = {};
  for (const def of edgeProfileDefs) {
    edgeProfiles[def.name] = await prisma.edgeProfile.create({ data: { ...def, active: true } });
  }
  // Alla kantprofiler kompatibla med Laminat och Kompaktlaminat i alla tjocklekar,
  // som exempel på att kompatibilitet styrs per material+tjocklek.
  for (const materialName of ['Laminat', 'Kompaktlaminat']) {
    for (const mm of thicknessValues) {
      for (const profile of Object.values(edgeProfiles)) {
        await prisma.edgeProfileCompatibility.create({
          data: {
            edgeProfileId: profile.id,
            materialId: materials[materialName].id,
            thicknessId: thicknesses[materialName][mm].id,
          },
        });
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
  const addOns = {};
  for (const def of addOnDefs) {
    const addOn = await prisma.addOn.create({ data: { name: def.name, priceUnit: def.priceUnit, active: true } });
    addOns[def.name] = addOn;
    for (const materialName of def.materials) {
      await prisma.addOnMaterial.create({ data: { addOnId: addOn.id, materialId: materials[materialName].id } });
    }
  }

  console.log('Skapar prislista med prisrader...');
  const priceList = await prisma.priceList.create({
    data: { name: 'Prislista 2026', validFrom: new Date('2026-01-01') },
  });

  // Tre djupintervall per material+tjocklek. Priset per löpmeter ökar med
  // både djup och tjocklek, som exempel.
  const depthRanges = [
    { fromMm: 0, toMm: 635 },
    { fromMm: 636, toMm: 1250 },
    { fromMm: 1251, toMm: 1800 },
  ];
  const basePricePerMm = { Laminat: 1.95, Kompaktlaminat: 2.6, Trä: 3.4, Corian: 4.1, Greengridz: 2.9 };

  for (const [materialName, material] of Object.entries(materials)) {
    for (const mm of thicknessValues) {
      const thickness = thicknesses[materialName][mm];
      for (let i = 0; i < depthRanges.length; i++) {
        const range = depthRanges[i];
        const price = (basePricePerMm[materialName] * mm * (1 + i * 0.35) * 10).toFixed(2);
        await prisma.countertopPriceRow.create({
          data: {
            priceListId: priceList.id,
            materialId: material.id,
            thicknessId: thickness.id,
            depthFromMm: range.fromMm,
            depthToMm: range.toMm,
            pricePerMeter: price,
          },
        });
      }
    }
  }

  for (const profile of Object.values(edgeProfiles)) {
    await prisma.edgeProfilePrice.create({
      data: { priceListId: priceList.id, edgeProfileId: profile.id, price: '150.00' },
    });
  }
  for (const addOn of Object.values(addOns)) {
    const price = addOn.priceUnit === 'STYCK' ? '450.00' : '95.00';
    await prisma.addOnPrice.create({ data: { priceListId: priceList.id, addOnId: addOn.id, price } });
  }

  console.log('Skapar återförsäljare, användare och rabattregler...');
  const companyA = await prisma.company.create({
    data: {
      name: 'Kakelspecialisten AB',
      orgNumber: '556123-4567',
      street: 'Verkstadsgatan 4',
      postalCode: '541 34',
      city: 'Skövde',
      contactName: 'Anna Andersson',
      contactEmail: 'anna@kakelspecialisten.se',
      contactPhone: '0500-123 456',
      active: true,
    },
  });
  const companyB = await prisma.company.create({
    data: {
      name: 'Köksmontören i Väst AB',
      orgNumber: '556765-4321',
      street: 'Industrivägen 12',
      postalCode: '541 45',
      city: 'Skövde',
      contactName: 'Björn Berg',
      contactEmail: 'bjorn@koksmontoren.se',
      contactPhone: '0500-987 654',
      baseDiscountPercent: '10.00',
      active: true,
    },
  });

  await prisma.user.create({
    data: {
      companyId: companyA.id,
      email: 'anna@kakelspecialisten.se',
      passwordHash: seedPasswordHash,
      role: 'RESELLER',
      active: true,
    },
  });
  await prisma.user.create({
    data: {
      companyId: companyA.id,
      email: 'kollega@kakelspecialisten.se',
      passwordHash: seedPasswordHash,
      role: 'RESELLER',
      active: true,
    },
  });
  await prisma.user.create({
    data: {
      companyId: companyB.id,
      email: 'bjorn@koksmontoren.se',
      passwordHash: seedPasswordHash,
      role: 'RESELLER',
      active: true,
    },
  });

  // Company A: 25% på Laminat, 30% på Nordisk Ytskikt inom Laminat, 15% på Corian.
  await prisma.discountRule.create({
    data: { companyId: companyA.id, materialId: materials.Laminat.id, discountPercent: '25.00' },
  });
  await prisma.discountRule.create({
    data: { companyId: companyA.id, materialId: materials.Laminat.id, brandId: brandNordisk.id, discountPercent: '30.00' },
  });
  await prisma.discountRule.create({
    data: { companyId: companyA.id, materialId: materials.Corian.id, discountPercent: '15.00' },
  });

  // Company B: grundrabatt 10% (satt på Company), plus 20% specifikt på Kompaktlaminat.
  await prisma.discountRule.create({
    data: { companyId: companyB.id, materialId: materials.Kompaktlaminat.id, discountPercent: '20.00' },
  });

  console.log('Skapar nyhet och exempeldokument...');
  await prisma.newsPost.create({
    data: {
      title: 'Välkommen till nya återförsäljarportalen',
      body: 'Här hittar ni sortiment, priser och dokument samlat på ett ställe.',
      publishedAt: new Date(),
      active: true,
    },
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
    await prisma.$disconnect();
  });
