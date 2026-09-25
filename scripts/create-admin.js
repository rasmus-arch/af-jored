// Skapar (eller uppdaterar) en admin-användare direkt från terminalen, utan
// att gå via inbjudningsflödet. Användbart för att sätta upp ditt eget
// personliga adminkonto istället för att använda seed-datans generiska
// admin@joredspostformning.se.
//
// Användning:
//   node scripts/create-admin.js din@epost.se "DittLosenord123"
// Måste sättas innan något gör async I/O - håller nere Node:s egen
// bakgrundstrådpool på hårt begränsad delad hosting.
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '2';

require('../src/config'); // löser DATABASE_URL (även från DB_HOST m.fl.)
const { pool } = require('../src/lib/db');
const { hashPassword } = require('../src/lib/passwordHash');
const { findUserByEmail } = require('../src/services/users');

async function main() {
  const [, , email, password] = process.argv;

  if (!email || !password) {
    console.error('Användning: node scripts/create-admin.js din@epost.se "DittLosenord123"');
    process.exitCode = 1;
    return;
  }
  if (password.length < 10) {
    console.error('Lösenordet måste vara minst 10 tecken.');
    process.exitCode = 1;
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await hashPassword(password);

  const existing = await findUserByEmail(normalizedEmail);
  let userId;
  if (existing) {
    await pool.query('UPDATE users SET password_hash = ?, role = ?, active = 1, updated_at = NOW() WHERE id = ?', [
      passwordHash,
      'ADMIN',
      existing.id,
    ]);
    userId = existing.id;
  } else {
    const [result] = await pool.query(
      'INSERT INTO users (email, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [normalizedEmail, passwordHash, 'ADMIN']
    );
    userId = result.insertId;
  }

  console.log(`Admin-konto klart: ${normalizedEmail} (id ${userId}). Du kan nu logga in med ditt lösenord.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
