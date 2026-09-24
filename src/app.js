const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const MySQLStoreFactory = require('express-mysql-session');
const mysql = require('mysql2/promise');
const helmet = require('helmet');
const flash = require('connect-flash');

const config = require('./config');
const { doubleCsrfProtection, exposeCsrfToken } = require('./middleware/csrf');

const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/account');
const adminRoutes = require('./routes/admin');
const resellerRoutes = require('./routes/reseller');

const MySQLStore = MySQLStoreFactory(session);

function createApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  // Krävs bakom cPanel/Passengers reverse proxy för att secure-cookies och
  // req.ip ska fungera korrekt.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // Monteras före session/databas så att hälsokontrollen fungerar oberoende
  // av databasanslutningen (t.ex. för drift-/uptime-övervakning).
  app.use('/', healthRoutes);

  const dbPool = mysql.createPool(config.databaseUrl);
  const sessionStore = new MySQLStore({}, dbPool);

  app.use(
    session({
      name: 'af_jored_session',
      secret: config.sessionSecret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.env === 'production',
        maxAge: 1000 * 60 * 60 * 8, // 8 timmar
      },
    })
  );

  app.use(flash());
  app.use(cookieParser());
  app.use(doubleCsrfProtection);
  app.use(exposeCsrfToken);

  app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    res.locals.messages = req.flash();
    next();
  });

  app.use('/', authRoutes);
  app.use('/konto', accountRoutes);
  app.use('/admin', adminRoutes);
  app.use('/portal', resellerRoutes);

  app.get('/', (req, res) => {
    if (!req.session.user) return res.redirect('/logga-in');
    return res.redirect(req.session.user.role === 'ADMIN' ? '/admin' : '/portal');
  });

  app.use((req, res) => {
    res.status(404).render('error', { title: 'Sidan hittades inte', message: 'Sidan kunde inte hittas.' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render('error', { title: 'Fel', message: 'Ett oväntat fel inträffade. Försök igen senare.' });
  });

  return app;
}

module.exports = createApp;
