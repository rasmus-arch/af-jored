const test = require('node:test');
const assert = require('node:assert/strict');
const { canAccessCompany } = require('../src/middleware/auth');

const admin = { role: 'ADMIN', companyId: null };
const resellerA = { role: 'RESELLER', companyId: 1 };
const resellerB = { role: 'RESELLER', companyId: 2 };

test('admin får åtkomst till alla företag', () => {
  assert.equal(canAccessCompany(admin, 1), true);
  assert.equal(canAccessCompany(admin, 2), true);
  assert.equal(canAccessCompany(admin, 999), true);
});

test('återförsäljare får åtkomst till sitt eget företag', () => {
  assert.equal(canAccessCompany(resellerA, 1), true);
  assert.equal(canAccessCompany(resellerB, 2), true);
});

test('återförsäljare nekas åtkomst till ett annat företags uppgifter', () => {
  assert.equal(canAccessCompany(resellerA, 2), false);
  assert.equal(canAccessCompany(resellerB, 1), false);
});

test('nekar när ingen användare är inloggad', () => {
  assert.equal(canAccessCompany(null, 1), false);
  assert.equal(canAccessCompany(undefined, 1), false);
});

test('nekar återförsäljare utan companyId (t.ex. trasig session)', () => {
  const brokenSession = { role: 'RESELLER', companyId: null };
  assert.equal(canAccessCompany(brokenSession, 1), false);
});

test('nekar okänd roll som standard', () => {
  assert.equal(canAccessCompany({ role: 'OKÄND', companyId: 1 }, 1), false);
});
