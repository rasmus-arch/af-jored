const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findPriceRowForDepth,
  validateDepthRanges,
  calculateLinePrice,
  applyVat,
  PriceRowNotFoundError,
} = require('../src/services/pricing');

const rows30mm = [
  { depthFromMm: 0, depthToMm: 635, pricePerMeter: '1250.00' },
  { depthFromMm: 636, depthToMm: 1250, pricePerMeter: '1890.00' },
];

test('hittar rätt djupintervall, gränsvärde 635 mm hör till första intervallet', () => {
  const row = findPriceRowForDepth(rows30mm, 635);
  assert.equal(row.pricePerMeter, '1250.00');
});

test('hittar rätt djupintervall, gränsvärde 636 mm hör till andra intervallet', () => {
  const row = findPriceRowForDepth(rows30mm, 636);
  assert.equal(row.pricePerMeter, '1890.00');
});

test('kastar tydligt fel när djup saknar prisrad', () => {
  assert.throws(() => findPriceRowForDepth(rows30mm, 2000), PriceRowNotFoundError);
});

test('räknar exakt pris per mm längd (2 347 mm × 1 250,00 kr/lm)', () => {
  const { unrounded, rounded } = calculateLinePrice('1250.00', 2347);
  assert.equal(unrounded.toString(), '2933.75');
  assert.equal(rounded.toString(), '2933.75');
});

test('avrundar radpris halvt uppåt till 2 decimaler', () => {
  // 1233.335 * 1000 / 1000 = 1233.335 -> avrundas till 1233.34
  const { rounded } = calculateLinePrice('1233.335', 1000);
  assert.equal(rounded.toString(), '1233.34');
});

test('validerar överlappande djupintervall', () => {
  const result = validateDepthRanges([
    { depthFromMm: 0, depthToMm: 635 },
    { depthFromMm: 600, depthToMm: 1250 },
  ]);
  assert.equal(result.valid, false);
  assert.equal(result.overlaps.length, 1);
});

test('validerar luckor mellan djupintervall', () => {
  const result = validateDepthRanges([
    { depthFromMm: 0, depthToMm: 635 },
    { depthFromMm: 700, depthToMm: 1250 },
  ]);
  assert.equal(result.valid, false);
  assert.equal(result.gaps.length, 1);
});

test('godkänner sammanhängande, icke överlappande djupintervall', () => {
  const result = validateDepthRanges(rows30mm);
  assert.equal(result.valid, true);
});

test('räknar moms på avrundat belopp, avrundat halvt uppåt', () => {
  const inclVat = applyVat('2933.75', 25);
  assert.equal(inclVat.toString(), '3667.19');
});
