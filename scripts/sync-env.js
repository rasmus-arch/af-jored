// Körs innan migrations-/seed-scripten, så att en DATABASE_URL som byggts
// ihop från DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME (t.ex. satta som
// miljövariabler i cPanel) skrivs in i .env-filen. Fristående Node-script
// som körs direkt (inte via `npm run`) läser annars bara .env, inte
// processens egna miljövariabler satta av cPanel. Gör ingenting om
// DATABASE_URL redan är satt explicit.
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { resolveDatabaseUrl } = require('../src/lib/databaseUrl');

const envPath = path.join(__dirname, '..', '.env');
const resolved = resolveDatabaseUrl(process.env);

if (!resolved) {
  console.log('Ingen DATABASE_URL kunde byggas (varken DATABASE_URL eller DB_HOST/DB_USER/DB_PASSWORD/DB_NAME är satta). Hoppar över.');
  process.exit(0);
}

let existingContent = '';
if (fs.existsSync(envPath)) {
  existingContent = fs.readFileSync(envPath, 'utf8');
}

const line = `DATABASE_URL="${resolved}"`;
let newContent;
if (/^DATABASE_URL=.*$/m.test(existingContent)) {
  newContent = existingContent.replace(/^DATABASE_URL=.*$/m, line);
} else {
  newContent = existingContent.trimEnd() ? `${existingContent.trimEnd()}\n${line}\n` : `${line}\n`;
}

if (newContent !== existingContent) {
  fs.writeFileSync(envPath, newContent);
  console.log('DATABASE_URL uppdaterad i .env utifrån DB_HOST/DB_USER/DB_PASSWORD/DB_NAME.');
} else {
  console.log('.env är redan uppdaterad.');
}
