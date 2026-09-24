const { findPriceRowForDepth, calculateLinePrice, applyVat } = require('./pricing');
const { resolveDiscountPercent, calculatePurchasePrice, findNetPriceOverride } = require('./discount');
const { toDecimal, roundMoney } = require('../lib/money');

// Beräknar en komplett bänkskiverad (rekommenderat pris, inköpspris, marginal)
// utifrån djup och längd, med hänsyn till nettopris och rabattprioritering.
// Används av både produktsidans pristabell och priskalkylatorn.
function calculateCountertopLine({
  priceRows,
  netPriceOverrides = [],
  discountRules = [],
  materialId,
  decorId,
  thicknessId,
  depthMm,
  lengthMm,
  vatPercent = null,
  asOf = new Date(),
}) {
  const override = findNetPriceOverride(netPriceOverrides, { decorId, thicknessId, depthMm, asOf });

  let priceRow = null;
  let recommendedPerMeter;
  if (override) {
    recommendedPerMeter = toDecimal(override.netPricePerMeter);
  } else {
    priceRow = findPriceRowForDepth(priceRows, depthMm);
    recommendedPerMeter = toDecimal(priceRow.pricePerMeter);
  }

  const recommended = calculateLinePrice(recommendedPerMeter, lengthMm);

  let purchaseRounded;
  let discountInfo = null;
  if (override) {
    purchaseRounded = recommended.rounded;
  } else {
    discountInfo = resolveDiscountPercent({ rules: discountRules, materialId, brandId: null, asOf });
    purchaseRounded = calculatePurchasePrice(recommended.unrounded, discountInfo.percent).rounded;
  }

  const marginAmount = recommended.rounded.minus(purchaseRounded);
  const marginPercent = recommended.rounded.isZero()
    ? toDecimal(0)
    : marginAmount.dividedBy(recommended.rounded).times(100);

  const result = {
    recommendedPricePerMeter: recommendedPerMeter,
    recommendedPrice: recommended.rounded,
    purchasePrice: purchaseRounded,
    marginAmount: roundMoney(marginAmount),
    marginPercent: marginPercent.toDecimalPlaces(1),
    usedNetPriceOverride: !!override,
    discount: discountInfo,
    priceRow,
  };

  if (vatPercent != null) {
    result.recommendedPriceInclVat = applyVat(recommended.rounded, vatPercent);
    result.purchasePriceInclVat = applyVat(purchaseRounded, vatPercent);
  }

  return result;
}

// Beräknar en produktrad (diskho/blandare/tillbehör) styckprissatt, med
// rabatt matchad enbart på varumärke.
function calculateProductLine({
  unitPrice,
  quantity = 1,
  discountRules = [],
  brandId,
  vatPercent = null,
  asOf = new Date(),
}) {
  const recommendedPerUnit = toDecimal(unitPrice);
  const unrounded = recommendedPerUnit.times(quantity);
  const recommended = { unrounded, rounded: roundMoney(unrounded) };

  const discountInfo = resolveDiscountPercent({ rules: discountRules, materialId: null, brandId, asOf });
  const purchaseRounded = calculatePurchasePrice(recommended.unrounded, discountInfo.percent).rounded;

  const marginAmount = recommended.rounded.minus(purchaseRounded);
  const marginPercent = recommended.rounded.isZero()
    ? toDecimal(0)
    : marginAmount.dividedBy(recommended.rounded).times(100);

  const result = {
    recommendedPricePerUnit: recommendedPerUnit,
    recommendedPrice: recommended.rounded,
    purchasePrice: purchaseRounded,
    marginAmount: roundMoney(marginAmount),
    marginPercent: marginPercent.toDecimalPlaces(1),
    discount: discountInfo,
  };

  if (vatPercent != null) {
    result.recommendedPriceInclVat = applyVat(recommended.rounded, vatPercent);
    result.purchasePriceInclVat = applyVat(purchaseRounded, vatPercent);
  }

  return result;
}

module.exports = { calculateCountertopLine, calculateProductLine };
