// Egen minimal migrationsrunnare - ersätter `prisma migrate deploy`.
//
// Prismas CLI/migrationsmotor behövs inte längre: migrationsfilerna under
// prisma/migrations/*/migration.sql är redan helt vanlig, portabel SQL (de
// genererades en gång av Prisma men innehåller ingen Prisma-specifik
// syntax), så de återanvänds som de är. Det här scriptet kör bara varje
// migrations-mapp i bokstavsordning (mappnamnen börjar med tidsstämpel,
// precis som Prisma själv namnger dem) och kommer ihåg vilka som redan
// körts i en egen `_migrations`-tabell.
//
// Användning:
//   node scripts/migrate.js
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '2';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('../src/config');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations');

// Egen anslutning (inte den delade poolen i src/lib/db.js) eftersom den här
// behöver multipleStatements=true för att kunna köra en hel .sql-fil med
// flera CREATE TABLE/ALTER TABLE-satser i ett svep. Det slås bara på här,
// aldrig för appens vanliga pool, som bara kör en parametriserad fråga i
// taget mot betrodda .sql-filer - aldrig användarinput.
function buildMigrationUrl() {
  const base = process.env.DATABASE_URL;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}multipleStatements=true`;
}

async function ensureMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

async function getAppliedMigrations(connection) {
  const [rows] = await connection.query('SELECT name FROM _migrations');
  return new Set(rows.map((r) => r.name));
}

async function main() {
  const connection = await mysql.createConnection(buildMigrationUrl());
  try {
    await ensureMigrationsTable(connection);
    const applied = await getAppliedMigrations(connection);

    const migrationDirs = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    let ranCount = 0;
    for (const dirName of migrationDirs) {
      if (applied.has(dirName)) continue;

      const sqlPath = path.join(MIGRATIONS_DIR, dirName, 'migration.sql');
      if (!fs.existsSync(sqlPath)) continue;

      const sql = fs.readFileSync(sqlPath, 'utf8');
      console.log(`Kör migration: ${dirName}`);
      await connection.query(sql);
      await connection.query('INSERT INTO _migrations (name) VALUES (?)', [dirName]);
      ranCount += 1;
    }

    if (ranCount === 0) {
      console.log('Inga nya migrationer att köra - databasen är redan uppdaterad.');
    } else {
      console.log(`Klart! ${ranCount} migration(er) kördes.`);
    }
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
