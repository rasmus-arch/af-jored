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
  res.locals.csrfToken = generateToken(req, res);
  next();
}

module.exports = { doubleCsrfProtection, exposeCsrfToken };
