const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCountertopLine, calculateProductLine } = require('../src/services/quote');

const LAMINAT = 1;
const DECOR = 100;
const THICKNESS_30 = 3;

const priceRows = [
  { depthFromMm: 0, depthToMm: 635, pricePerMeter: '1250.00' },
  { depthFromMm: 636, depthToMm: 1250, pricePerMeter: '1890.00' },
];

test('räknar hela raden: djup 600 mm, längd 2 347 mm, 25% materialrabatt', () => {
  const result = calculateCountertopLine({
    priceRows,
    discountRules: [{ materialId: LAMINAT, brandId: null, discountPercent: '25.00' }],
    materialId: LAMINAT,
    decorId: DECOR,
    thicknessId: THICKNESS_30,
    depthMm: 600,
    lengthMm: 2347,
  });

  assert.equal(result.recommendedPrice.toString(), '2933.75');
  assert.equal(result.purchasePrice.toString(), '2200.31');
  assert.equal(result.marginAmount.toString(), '733.44');
  assert.equal(result.discount.matchedOn, 'material');
  assert.equal(result.usedNetPriceOverride, false);
});

test('inkluderar moms när vatPercent anges', () => {
  const result = calculateCountertopLine({
    priceRows,
    discountRules: [{ materialId: LAMINAT, brandId: null, discountPercent: '25.00' }],
    materialId: LAMINAT,
    decorId: DECOR,
    thicknessId: THICKNESS_30,
    depthMm: 600,
    lengthMm: 2347,
    vatPercent: 25,
  });

  assert.equal(result.recommendedPriceInclVat.toString(), '3667.19');
  assert.equal(result.purchasePriceInclVat.toString(), '2750.39');
});

test('fast nettopris går före procentrabatt', () => {
  const result = calculateCountertopLine({
    priceRows,
    netPriceOverrides: [
      { decorId: DECOR, thicknessId: THICKNESS_30, depthFromMm: 0, depthToMm: 635, netPricePerMeter: '1250.00' },
    ],
    discountRules: [{ materialId: LAMINAT, brandId: null, discountPercent: '25.00' }],
    materialId: LAMINAT,
    decorId: DECOR,
    thicknessId: THICKNESS_30,
    depthMm: 600,
    lengthMm: 2347,
  });

  assert.equal(result.usedNetPriceOverride, true);
  assert.equal(result.purchasePrice.toString(), result.recommendedPrice.toString());
  assert.equal(result.discount, null);
});

test('gränsvärde 636 mm ger andra prisraden', () => {
  const result = calculateCountertopLine({
    priceRows,
    discountRules: [],
    materialId: LAMINAT,
    decorId: DECOR,
    thicknessId: THICKNESS_30,
    depthMm: 636,
    lengthMm: 1000,
  });

  assert.equal(result.recommendedPricePerMeter.toString(), '1890');
});

test('produktrad (t.ex. diskho) prissätts per styck med varumärkesrabatt', () => {
  const BRAND_STALA = 50;
  const result = calculateProductLine({
    unitPrice: '2000.00',
    quantity: 2,
    discountRules: [{ materialId: null, brandId: BRAND_STALA, discountPercent: '20.00' }],
    brandId: BRAND_STALA,
  });

  assert.equal(result.recommendedPrice.toString(), '4000');
  assert.equal(result.purchasePrice.toString(), '3200');
  assert.equal(result.discount.matchedOn, 'brand');
});
