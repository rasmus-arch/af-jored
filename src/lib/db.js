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
// i praktiken.
async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = { pool, query };
