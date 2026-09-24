const { toDecimal, roundMoney } = require('../lib/money');

class PriceRowNotFoundError extends Error {
  constructor(depthMm) {
    super(`Ingen prisrad hittades för djup ${depthMm} mm.`);
    this.name = 'PriceRowNotFoundError';
    this.depthMm = depthMm;
  }
}

// Djupintervallens gränser är inklusive i båda ändar (635 hör till 0-635,
// 636 hör till 636-1250).
function findPriceRowForDepth(rows, depthMm) {
  const row = rows.find((r) => depthMm >= r.depthFromMm && depthMm <= r.depthToMm);
  if (!row) throw new PriceRowNotFoundError(depthMm);
  return row;
}

// Kontrollerar överlapp och luckor i en uppsättning djupintervall som redan
// gäller samma material och tjocklek. Använd vid admin-validering innan spar.
function validateDepthRanges(rows) {
  const sorted = [...rows].sort((a, b) => a.depthFromMm - b.depthFromMm);
  const overlaps = [];
  const gaps = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.depthFromMm <= prev.depthToMm) {
      overlaps.push({ a: prev, b: curr });
    } else if (curr.depthFromMm > prev.depthToMm + 1) {
      gaps.push({ afterDepthToMm: prev.depthToMm, beforeDepthFromMm: curr.depthFromMm });
    }
  }

  return { overlaps, gaps, valid: overlaps.length === 0 && gaps.length === 0 };
}

// Radpris = pris per löpmeter × längd i mm / 1000. Beräknas med full precision
// (oavrundat) och avrundas separat halvt uppåt till 2 decimaler.
function calculateLinePrice(pricePerMeter, lengthMm) {
  const unrounded = toDecimal(pricePerMeter).times(lengthMm).dividedBy(1000);
  return { unrounded, rounded: roundMoney(unrounded) };
}

// Moms räknas på det avrundade beloppet och avrundas i sin tur till 2 decimaler.
function applyVat(amount, vatPercent) {
  const factor = toDecimal(vatPercent).dividedBy(100).plus(1);
  return roundMoney(toDecimal(amount).times(factor));
}

module.exports = {
  PriceRowNotFoundError,
  findPriceRowForDepth,
  validateDepthRanges,
  calculateLinePrice,
  applyVat,
};
