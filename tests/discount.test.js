const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveDiscountPercent,
  calculatePurchasePrice,
  findNetPriceOverride,
} = require('../src/services/discount');

const LAMINAT = 1;
const CORIAN = 2;
const BRAND_X = 10;
const BRAND_Y = 20;

const rules = [
  { materialId: LAMINAT, brandId: null, discountPercent: '25.00' },
  { materialId: LAMINAT, brandId: BRAND_X, discountPercent: '30.00' },
  { materialId: CORIAN, brandId: null, discountPercent: '15.00' },
];

test('material+varumärke slår enbart material', () => {
  const result = resolveDiscountPercent({ rules, materialId: LAMINAT, brandId: BRAND_X });
  assert.equal(result.matchedOn, 'material+brand');
  assert.equal(result.percent.toString(), '30');
});

test('enbart material används när inget varumärkesspecifikt finns', () => {
  const result = resolveDiscountPercent({ rules, materialId: LAMINAT, brandId: BRAND_Y });
  assert.equal(result.matchedOn, 'material');
  assert.equal(result.percent.toString(), '25');
});

test('enbart varumärke slår material när det är mer specifikt', () => {
  const brandOnlyRules = [
    { materialId: null, brandId: BRAND_X, discountPercent: '40.00' },
    { materialId: LAMINAT, brandId: null, discountPercent: '25.00' },
  ];
  const result = resolveDiscountPercent({ rules: brandOnlyRules, materialId: LAMINAT, brandId: BRAND_X });
  assert.equal(result.matchedOn, 'brand');
  assert.equal(result.percent.toString(), '40');
});

test('grundrabatt används när ingen specifik regel matchar', () => {
  const result = resolveDiscountPercent({
    rules,
    materialId: 999,
    brandId: 999,
    baseDiscountPercent: '10.00',
  });
  assert.equal(result.matchedOn, 'base');
  assert.equal(result.percent.toString(), '10');
});

test('ingen rabatt (0%) när varken regel eller grundrabatt matchar', () => {
  const result = resolveDiscountPercent({ rules, materialId: 999, brandId: 999 });
  assert.equal(result.matchedOn, 'none');
  assert.equal(result.percent.toString(), '0');
});

test('respekterar giltighetsperiod (validFrom/validTo)', () => {
  const timedRules = [
    { materialId: LAMINAT, brandId: null, discountPercent: '50.00', validFrom: '2030-01-01', validTo: null },
    { materialId: LAMINAT, brandId: null, discountPercent: '20.00', validFrom: null, validTo: null },
  ];
  const result = resolveDiscountPercent({ rules: timedRules, materialId: LAMINAT, brandId: null, asOf: new Date('2026-01-01') });
  assert.equal(result.percent.toString(), '20');
});

test('inköpspris = oavrundat rekommenderat pris × (1 - rabatt), avrundat halvt uppåt', () => {
  // Radexempel: 2 347 mm × 1 250,00 kr/lm = 2 933,75 kr, 25 % rabatt
  const { rounded } = calculatePurchasePrice('2933.75', '25.00');
  assert.equal(rounded.toString(), '2200.31');
});

test('nettopris hittas för matchande dekor, tjocklek och djup', () => {
  const overrides = [
    { decorId: 5, thicknessId: 2, depthFromMm: 0, depthToMm: 635, netPricePerMeter: '1100.00' },
  ];
  const found = findNetPriceOverride(overrides, { decorId: 5, thicknessId: 2, depthMm: 600 });
  assert.ok(found);
  assert.equal(found.netPricePerMeter, '1100.00');
});

test('nettopris matchar inte fel djup', () => {
  const overrides = [
    { decorId: 5, thicknessId: 2, depthFromMm: 0, depthToMm: 635, netPricePerMeter: '1100.00' },
  ];
  const found = findNetPriceOverride(overrides, { decorId: 5, thicknessId: 2, depthMm: 900 });
  assert.equal(found, null);
});
