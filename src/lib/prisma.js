const { PrismaClient } = require('@prisma/client');

// Återanvänd samma klient vid utveckling (--watch) för att undvika för
// många öppna anslutningar mot databasen.
const prisma = global.__prismaClient || new PrismaClient();
if (process.env.NODE_ENV !== 'production') {
  global.__prismaClient = prisma;
}

module.exports = prisma;
