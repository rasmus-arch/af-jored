const Decimal = require('decimal.js');

// Alla belopp hanteras som Decimal, aldrig som flyttal. Avrundning sker alltid
// halvt uppåt (ROUND_HALF_UP) till 2 decimaler, om inget annat anges.
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

function toDecimal(value) {
  if (value instanceof Decimal) return value;
  if (value === null || value === undefined) {
    throw new TypeError('Kan inte konvertera null/undefined till Decimal');
  }
  return new Decimal(value.toString());
}

function roundMoney(value, decimalPlaces = 2) {
  return toDecimal(value).toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
}

function sumMoney(values) {
  return values.filter((v) => v != null).reduce((sum, v) => sum.plus(toDecimal(v)), new Decimal(0));
}

module.exports = { Decimal, toDecimal, roundMoney, sumMoney };
