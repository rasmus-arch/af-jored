const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveDatabaseUrl } = require('../src/lib/databaseUrl');

test('använder DATABASE_URL oförändrad om den redan är satt', () => {
  const url = resolveDatabaseUrl({ DATABASE_URL: 'mysql://redan:satt@localhost:3306/db' });
  assert.equal(url, 'mysql://redan:satt@localhost:3306/db');
});

test('bygger DATABASE_URL från separata variabler', () => {
  const url = resolveDatabaseUrl({
    DB_HOST: 'localhost',
    DB_USER: 'afjored_user',
    DB_PASSWORD: 'enkeltlosenord',
    DB_NAME: 'afjored_db',
  });
  assert.equal(url, 'mysql://afjored_user:enkeltlosenord@localhost:3306/afjored_db?connection_limit=3');
});

test('DB_CONNECTION_LIMIT styr connection_limit i den ihopbyggda URL:en', () => {
  const url = resolveDatabaseUrl({
    DB_HOST: 'localhost',
    DB_USER: 'user',
    DB_PASSWORD: 'pass',
    DB_NAME: 'db',
    DB_CONNECTION_LIMIT: '1',
  });
  assert.match(url, /\?connection_limit=1$/);
});

test('använder DB_PORT om den anges', () => {
  const url = resolveDatabaseUrl({
    DB_HOST: 'localhost',
    DB_PORT: '3307',
    DB_USER: 'user',
    DB_PASSWORD: 'pass',
    DB_NAME: 'db',
  });
  assert.match(url, /:3307\//);
});

test('kodar specialtecken i användarnamn och lösenord automatiskt', () => {
  const url = resolveDatabaseUrl({
    DB_HOST: 'localhost',
    DB_USER: 'user@host',
    DB_PASSWORD: 'p@ss:w/rd#1',
    DB_NAME: 'db',
  });
  assert.equal(url, 'mysql://user%40host:p%40ss%3Aw%2Frd%231@localhost:3306/db?connection_limit=3');
});

test('returnerar null om varken DATABASE_URL eller alla DB_*-variabler finns', () => {
  assert.equal(resolveDatabaseUrl({}), null);
  assert.equal(resolveDatabaseUrl({ DB_HOST: 'localhost', DB_USER: 'user' }), null);
});
