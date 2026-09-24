const { doubleCsrf } = require('csrf-csrf');
const config = require('../config');

const { generateToken, doubleCsrfProtection } = doubleCsrf({
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
});

function exposeCsrfToken(req, res, next) {
  // overwrite=true: skapa alltid en ny token/cookie för sidan som renderas nu,
  // i stället för att försöka återanvända en befintlig cookie. Utan detta
  // kastas ett fel så fort sessionen bytt id (t.ex. vid inloggning, då
  // req.session.regenerate() körs) men den gamla csrf-cookien finns kvar.
  res.locals.csrfToken = generateToken(req, res, true);
  next();
}

module.exports = { doubleCsrfProtection, exposeCsrfToken };
