const { query, mapRow } = require('../lib/db');

async function findUserByEmail(email, executor) {
  const rows = await query('SELECT * FROM users WHERE email = ?', [email], executor);
  return mapRow(rows[0]) || null;
}

async function findUserById(id, executor) {
  const rows = await query('SELECT * FROM users WHERE id = ?', [id], executor);
  return mapRow(rows[0]) || null;
}

async function updateUser(id, data, executor) {
  const columnByField = {
    passwordHash: 'password_hash',
    totpSecret: 'totp_secret',
    totpEnabled: 'totp_enabled',
    active: 'active',
    lastLoginAt: 'last_login_at',
    companyId: 'company_id',
    role: 'role',
  };
  const setClauses = [];
  const params = [];
  for (const [field, value] of Object.entries(data)) {
    const column = columnByField[field];
    if (!column) throw new Error(`Okänt användarfält: ${field}`);
    setClauses.push(`${column} = ?`);
    params.push(value);
  }
  if (setClauses.length === 0) return;
  params.push(id);
  await query(`UPDATE users SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = ?`, params, executor);
}

// Skapar en ny användare, eller uppdaterar lösenord/aktiv-status om
// e-postadressen redan finns (samma beteende som Prismas upsert, används av
// inbjudningsflödet).
async function upsertUserByEmail(email, { passwordHash, role, companyId, active }, executor) {
  const existing = await findUserByEmail(email, executor);
  if (existing) {
    await query(
      'UPDATE users SET password_hash = ?, active = ?, updated_at = NOW() WHERE id = ?',
      [passwordHash, active, existing.id],
      executor
    );
    return findUserById(existing.id, executor);
  }
  const result = await query(
    'INSERT INTO users (email, password_hash, role, company_id, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
    [email, passwordHash, role, companyId ?? null, active],
    executor
  );
  return findUserById(result.insertId, executor);
}

async function createAuditLog({ userId = null, action, entityType = null, entityId = null, oldValue = null, newValue = null, ipAddress = null }, executor) {
  await query(
    'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
    [
      userId,
      action,
      entityType,
      entityId,
      oldValue != null ? JSON.stringify(oldValue) : null,
      newValue != null ? JSON.stringify(newValue) : null,
      ipAddress,
    ],
    executor
  );
}

module.exports = { findUserByEmail, findUserById, updateUser, upsertUserByEmail, createAuditLog };
