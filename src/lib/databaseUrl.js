// Bygger en MySQL-anslutningssträng åt Prisma från enkla, separata
// variabler (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME) istället för
// en färdig DATABASE_URL. Användarnamn och lösenord procentkodas automatiskt,
// så specialtecken (@, :, /, # m.fl.) inte behöver hanteras manuellt - det
// är den vanligaste källan till "invalid port number"-fel från Prisma.
//
// DATABASE_URL, om den redan är satt, används alltid oförändrad (full
// kontroll/bakåtkompatibilitet).
function resolveDatabaseUrl(env = process.env) {
  if (env.DATABASE_URL && env.DATABASE_URL.trim()) {
    return env.DATABASE_URL.trim();
  }

  const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    return null;
  }

  const port = env.DB_PORT && env.DB_PORT.trim() ? env.DB_PORT.trim() : '3306';
  const user = encodeURIComponent(DB_USER);
  const password = encodeURIComponent(DB_PASSWORD);

  return `mysql://${user}:${password}@${DB_HOST}:${port}/${DB_NAME}`;
}

module.exports = { resolveDatabaseUrl };
