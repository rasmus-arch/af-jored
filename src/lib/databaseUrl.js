// Bygger en MySQL-anslutningssträng åt Prisma från enkla, separata
// variabler (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME) istället för
// en färdig DATABASE_URL. Användarnamn och lösenord procentkodas automatiskt,
// så specialtecken (@, :, /, # m.fl.) inte behöver hanteras manuellt - det
// är den vanligaste källan till "invalid port number"-fel från Prisma.
//
// DATABASE_URL, om den redan är satt, används alltid oförändrad (full
// kontroll/bakåtkompatibilitet) - vi lägger aldrig till något i den.
//
// När URL:en byggs ihop från DB_HOST m.fl. sätter vi ett lågt
// `connection_limit` (antal samtidiga databaskopplingar Prisma får öppna).
// Standard i Prisma är annars antal CPU-kärnor × 2 + 1, vilket på delad
// hosting med hårda process-/trådgränser (CloudLinux LVE räknar trådar som
// "processer") i onödan kan bidra till att kontot slår i sin gräns. Går att
// styra med DB_CONNECTION_LIMIT om standardvärdet inte passar.
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
  const connectionLimit = env.DB_CONNECTION_LIMIT && env.DB_CONNECTION_LIMIT.trim() ? env.DB_CONNECTION_LIMIT.trim() : '3';

  return `mysql://${user}:${password}@${DB_HOST}:${port}/${DB_NAME}?connection_limit=${connectionLimit}`;
}

module.exports = { resolveDatabaseUrl };
