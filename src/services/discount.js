const { toDecimal, roundMoney } = require('../lib/money');

function isRuleActive(rule, asOf) {
  if (rule.validFrom && new Date(rule.validFrom) > asOf) return false;
  if (rule.validTo && new Date(rule.validTo) < asOf) return false;
  return true;
}

// Prioritetsordning: material+varumärke > enbart varumärke > enbart material
// > återförsäljarens grundrabatt. `rules` ska vara förfiltrerat till en enda
// återförsäljare.
function resolveDiscountPercent({ rules, materialId, brandId, baseDiscountPercent = null, asOf = new Date() }) {
  const active = rules.filter((r) => isRuleActive(r, asOf));

  const materialAndBrand = active.find(
    (r) => r.materialId != null && r.brandId != null && r.materialId === materialId && r.brandId === brandId
  );
  if (materialAndBrand) {
    return { percent: toDecimal(materialAndBrand.discountPercent), rule: materialAndBrand, matchedOn: 'material+brand' };
  }

  const brandOnly = active.find((r) => r.materialId == null && r.brandId != null && r.brandId === brandId);
  if (brandOnly) {
    return { percent: toDecimal(brandOnly.discountPercent), rule: brandOnly, matchedOn: 'brand' };
  }

  const materialOnly = active.find((r) => r.brandId == null && r.materialId != null && r.materialId === materialId);
  if (materialOnly) {
    return { percent: toDecimal(materialOnly.discountPercent), rule: materialOnly, matchedOn: 'material' };
  }

  if (baseDiscountPercent != null) {
    return { percent: toDecimal(baseDiscountPercent), rule: null, matchedOn: 'base' };
  }

  return { percent: toDecimal(0), rule: null, matchedOn: 'none' };
}

// Inköpspris = rekommenderat pris (oavrundat radpris) × (1 - rabatt%),
// avrundat halvt uppåt till 2 decimaler.
function calculatePurchasePrice(recommendedUnrounded, discountPercent) {
  const factor = toDecimal(1).minus(toDecimal(discountPercent).dividedBy(100));
  const unrounded = toDecimal(recommendedUnrounded).times(factor);
  return { unrounded, rounded: roundMoney(unrounded) };
}

// Fast nettopris går alltid före procentrabatt när det matchar dekor,
// tjocklek och djup.
function findNetPriceOverride(overrides, { decorId, thicknessId, depthMm, asOf = new Date() }) {
  return (
    overrides.find(
      (o) =>
        o.decorId === decorId &&
        o.thicknessId === thicknessId &&
        depthMm >= o.depthFromMm &&
        depthMm <= o.depthToMm &&
        isRuleActive(o, asOf)
    ) || null
  );
}

module.exports = {
  isRuleActive,
  resolveDiscountPercent,
  calculatePurchasePrice,
  findNetPriceOverride,
};
