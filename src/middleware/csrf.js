const { doubleCsrf } = require('csrf-csrf');
const config = require('../config');

const { generateToken, doubleCsrfProtection, validateRequest, invalidCsrfTokenError } = doubleCsrf({
  getSecret: () => config.sessionSecret,
  getSessionIdentifier: (req) => req.sessionID || '',
  cookieName: config.env === 'production' ? '__Host-af-jored-csrf' : 'af-jored-csrf',
  cookieOptions: {
    sameSite: 'lax',
    secure: config.env === 'production',
    httpOnly: true,
    path: '/',
  },
  // Formulären renderas server-side (EJS) och skickar token som ett dolt
  // fält, inte som header - så vi läser den därifrån.
  getTokenFromRequest: (req) => (req.body && req.body.csrf_token) || req.headers['x-csrf-token'],
  // multipart/form-data (filuppladdning) hinner inte tolkas av body-parsern
  // innan denna globala middleware körs - req.body är tomt då. Sådana
  // routes validerar CSRF explicit efter sin multer-middleware istället
  // (se t.ex. routes/admin/materials.js).
  skipCsrfProtection: (req) => (req.headers['content-type'] || '').startsWith('multipart/form-data'),
});

function exposeCsrfToken(req, res, next) {
  // overwrite=true: skapa alltid en ny token/cookie för sidan som renderas nu,
  // i stället för att försöka återanvända en befintlig cookie. Utan detta
  // kastas ett fel så fort sessionen bytt id (t.ex. vid inloggning, då
  // req.session.regenerate() körs) men den gamla csrf-cookien finns kvar.
  res.locals.csrfToken = generateToken(req, res, true);
  next();
}

// Multipart/form-data-formulär (filuppladdning) hinner inte tolkas av
// body-parsern innan den globala doubleCsrfProtection körs, så den hoppar
// över dem (se skipCsrfProtection ovan). Den här middlewaren används
// istället, EFTER multer, på just de routes - och anropar
// csrf-csrf:s egen validateRequest direkt (inte doubleCsrfProtection, som
// skulle hoppa över samma begäran en gång till på grund av samma
// content-type-kontroll).
function verifyCsrfAfterUpload(req, res, next) {
  if (!validateRequest(req)) {
    return next(invalidCsrfTokenError);
  }
  return next();
}

module.exports = { doubleCsrfProtection, exposeCsrfToken, verifyCsrfAfterUpload };
