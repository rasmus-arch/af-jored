// Delad databaspool för hela appen. Ersätter Prisma Client, som startade en
// egen separat "query engine"-process (Rust, egen Tokio-runtime) bredvid
// Node-processen - det var den enskilt största orsaken till den höga
// process-/trådanvändningen på delad hosting (CloudLinux LVE/PNO). Rå
// mysql2 pratar direkt mot MySQL utan någon sådan sidoprocess, samma mönster
// som koksfokus-systemet redan kör stabilt med.
//
// decimalNumbers är avsiktligt INTE satt till true: DECIMAL-kolumner ska
// komma tillbaka som strängar (mysql2:s standardbeteende), inte JS-flyttal,
// eftersom src/lib/money.js konverterar allt till decimal.js självt.
const mysql = require('mysql2/promise');
const config = require('../config');

const pool = mysql.createPool(config.databaseUrl);

// Enkel wrapper som bara returnerar raderna (inte [rows, fields]-paret),
// för att hålla anropsstället kort - samma som `db.query(...).then(rows =>`
// i praktiken. `executor` är antingen den delade poolen (standard) eller en
// utcheckad anslutning från withTransaction, så samma tjänstefunktioner kan
// användas både fristående och inom en transaktion.
async function query(sql, params, executor = pool) {
  const [rows] = await executor.query(sql, params);
  return rows;
}

// Prisma exponerade alltid fältnamn i camelCase (utifrån @map-direktiven i
// schema.prisma) även om kolumnerna i databasen är snake_case. mapRow/mapRows
// gör samma omvandling på raka mysql2-rader, så resten av appen (routes,
// vyer) kan fortsätta läsa t.ex. `user.passwordHash` och `user.companyId`
// utan ändringar.
function toCamel(key) {
  return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function mapRow(row) {
  if (!row) return row;
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[toCamel(key)] = value;
  }
  return mapped;
}

function mapRows(rows) {
  return rows.map(mapRow);
}

// Kör en funktion inom en transaktion på en utcheckad anslutning - ersätter
// Prismas `$transaction([...])` för de få ställen där flera skrivningar
// måste lyckas eller misslyckas tillsammans (t.ex. inbjudning/lösenords-
// återställning: skapa/uppdatera användare + markera token som använd).
// `fn` får en `conn`-parameter och ska använda `conn.query(...)` istället för
// den delade poolen för sina frågor.
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, mapRow, mapRows, withTransaction };
