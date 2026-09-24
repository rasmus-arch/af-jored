# Joreds återförsäljarportal

Återförsäljarportal för Joreds Postformning och Laminatteknik AB. Ger varje
återförsäljare en egen inloggning med sortiment, rekommenderade
försäljningspriser och egna inköpspriser. Joreds sköter allt innehåll i en
admindel.

Detta är grundstrukturen (fas 2): datamodell, kärnlogik för prisberäkning och
ett Express-skelett med inloggning och säkerhetsmiddleware. Sortimentsvyer,
priskalkylator, admin-CRUD, import/export, dokumentarkiv m.m. byggs ut i
kommande faser.

## Teknik

- Node.js (LTS) + Express, serverrenderade vyer med EJS
- MySQL/MariaDB via Prisma (ORM + migreringar)
- Sessioner lagras i databasen (`express-mysql-session`), inte i minnet
- Lösenord hashas med argon2, CSRF-skydd (dubbel cookie), rate limiting på
  inloggning
- Alla belopp hanteras som `Decimal` (via `decimal.js` i beräkningstjänsterna
  och Prisma `Decimal`/MySQL `DECIMAL` i databasen) - aldrig som flyttal

## Projektstruktur

```
prisma/
  schema.prisma      Datamodell
  seed.js             Exempeldata (se nedan)
src/
  app.js              Express-app: middleware och routes
  server.js            Startpunkt (även entry-fil för cPanel/Passenger)
  config/              Läser in miljövariabler
  middleware/          auth, csrf, rate limit
  routes/              auth, admin, reseller
  services/            Ren, testbar affärslogik (pricing, discount, quote)
  views/               EJS-mallar
  public/              CSS/JS/bilder - tema (färger) i public/css/theme.css
tests/                 node:test - prisberäkning, rabattlogik, behörighet
```

## Installation (utveckling)

Förutsättningar: Node.js 18+ och en MySQL/MariaDB-server.

```bash
npm install
cp .env.example .env
# redigera .env: DATABASE_URL, SESSION_SECRET, SMTP-uppgifter m.m.

npx prisma migrate dev --name init   # skapar databastabeller
npm run seed                          # exempeldata (se nedan)

npm run dev                           # startar med auto-omstart
# eller: npm start
```

Appen startar på porten i `.env` (`PORT`, standard 3000).
Hälsokontroll: `GET /healthz`.

### Köra tester

```bash
npm test
```

Testerna (`tests/*.test.js`) täcker bland annat:
- Rätt djupintervall för bänkskivepris, inklusive gränsvärdena 635/636 mm
- Exakt pris per mm längd (t.ex. 2 347 mm)
- Avrundning till 2 decimaler (halvt uppåt) och moms
- Rabattprioritering (material+varumärke > varumärke > material > grundrabatt)
- Fast nettopris som går före procentrabatt
- Att en återförsäljare aldrig kan komma åt ett annat företags data

Dessa tester körs mot rena JavaScript-moduler i `src/services/` och `src/
middleware/auth.js` och kräver ingen databas.

### Seed-data

`npm run seed` skapar:
- 1 admin (`admin@joredspostformning.se`)
- 5 material (Laminat, Kompaktlaminat, Trä, Corian, Greengridz)
- 3 varumärken, en dekorkategori-tabell med 4 kategorier
- 15 dekorer fördelade på materialen
- 3 tjocklekar per material (12/20/30 mm) med varierande dekor-kombinationer
- En prislista med 3 djupintervall per material och tjocklek
- 3 kantprofiler och 5 tillval
- 2 återförsäljare med olika rabattregler (materialrabatt,
  varumärkesrabatt inom material, samt grundrabatt)

Alla seedade användare har lösenordet som skrivs ut i terminalen när
seed-scriptet körs (`ByteMigDirekt123!` i skriptet - byt gärna innan ni
seedar en delad miljö).

## Miljövariabler (`.env`)

Se `.env.example` för samtliga variabler: databasanslutning, sessionshemlighet,
bas-URL (används i länkar i utskickade e-postmeddelanden), SMTP-uppgifter samt
giltighetstider för inbjudningar/lösenordsåterställning.

## Färger och logotyp

Allt utseende (färger, mellanrum, grundtypsnitt) styrs från en enda fil:
`src/public/css/theme.css`, via CSS-variabler under `:root`. Byt logotyp genom
att lägga en bildfil i `src/public/images/` och referera den i
`src/views/partials/head.ejs`.

## Driftsättning på cPanel (Phusion Passenger)

1. **Ladda upp koden** till en katalog på webbhotellet, t.ex. via git eller
   filhanteraren (exkludera `node_modules` och `.env` - de skapas/laddas upp
   separat).
2. I cPanel, öppna **"Setup Node.js App"** och skapa en ny applikation:
   - **Node.js-version**: 18 LTS eller senare
   - **Application mode**: Production
   - **Application root**: katalogen där koden ligger
   - **Application URL**: den domän/subdomän portalen ska ligga på
   - **Application startup file**: `src/server.js`
3. Lägg till miljövariabler under **"Environment variables"** i samma
   gränssnitt (samma nycklar som i `.env.example`). `PORT` sätts normalt
   automatiskt av Passenger - låt den vara orörd om cPanel redan fyller i den.
4. Öppna terminalen som cPanel-gränssnittet erbjuder ("Run NPM Install") eller
   SSH:a in och kör, i applikationens virtuella miljö:
   ```bash
   npm install --omit=dev
   npx prisma generate
   npx prisma migrate deploy
   npm run seed   # endast första gången, eller hoppa över i produktion
   ```
5. Starta om applikationen från cPanel-gränssnittet ("Restart").
6. Verifiera genom att öppna `https://din-domän/healthz` - ska returnera
   `{"status":"ok"}`.

### Databas på cPanel

Skapa en MySQL-databas och ett databasanvändarkonto via **"MySQL® Databases"**
i cPanel, och sätt `DATABASE_URL` i formen:

```
mysql://anvandare:losenord@localhost:3306/databasnamn
```

Kom ihåg att cPanel ofta prefixar databas- och användarnamn med kontots
cPanel-användarnamn (t.ex. `cpanelanv_databasnamn`).

**Alternativ, enklare väg:** istället för att sätta ihop `DATABASE_URL` för
hand (lätt att göra fel på om lösenordet innehåller tecken som `@ : / # %`),
kan du sätta separata miljövariabler under "Environment variables" i
"Setup Node.js App":

| Namn | Exempel |
|---|---|
| `DB_HOST` | `localhost` |
| `DB_PORT` | `3306` |
| `DB_USER` | `cpanelanv_dbuser` |
| `DB_PASSWORD` | vilket lösenord som helst, inklusive specialtecken |
| `DB_NAME` | `cpanelanv_databasnamn` |

Appen bygger då själv ihop `DATABASE_URL` och kodar specialtecken i
användarnamn/lösenord automatiskt (`src/lib/databaseUrl.js`). Lämna
`DATABASE_URL` tomt/osatt när du använder dessa. `npm run seed` och alla
`prisma:*`-kommandon kör automatiskt `npm run sync-env` först, som skriver
in den ihopbyggda `DATABASE_URL` i `.env` så att Prisma CLI hittar den.

### Uppdatera en befintlig driftsättning

```bash
git pull
npm install --omit=dev
npx prisma migrate deploy
```
Starta sedan om applikationen i cPanel för att ladda in ändringarna
(Passenger håller annars kvar den gamla processen i minnet).

## Säkerhet

- Lösenord hashas med argon2, aldrig i klartext
- Sessioner i httpOnly-cookies, lagrade i databasen
- CSRF-skydd på alla formulär (dolt `csrf_token`-fält)
- Rate limiting på inloggningsförsök
- All åtkomstkontroll (roll, tillhörighet till företag) görs på servern, inte
  bara i gränssnittet - se `src/middleware/auth.js` och
  `tests/access-control.test.js`
- Tvåstegsverifiering (TOTP) planeras per användare, obligatoriskt för admin
  (byggs ut i kommande fas)
