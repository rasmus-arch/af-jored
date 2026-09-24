function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/logga-in');
  }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.session && req.session.user;
    if (!user || !roles.includes(user.role)) {
      return res.status(403).render('error', {
        title: 'Åtkomst nekad',
        message: 'Du har inte behörighet till den här sidan.',
      });
    }
    return next();
  };
}

// Ren funktion (testbar utan Express/session) som avgör om en inloggad
// användare får komma åt data för ett visst företag. Admin ser allt.
// En återförsäljare får ALDRIG se ett annat företags uppgifter, oavsett
// vad klienten skickar med i URL:en eller formuläret - kontrollen görs
// alltid mot värdet i den signerade servern-sessionen.
function canAccessCompany(user, companyId) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role === 'RESELLER') return user.companyId != null && user.companyId === companyId;
  return false;
}

// Middleware-variant: getCompanyId(req) läser företags-id från t.ex.
// req.params eller req.body - aldrig direkt från sessionen, så att en
// manipulerad begäran verkligen kontrolleras mot inloggad användares företag.
function requireCompanyAccess(getCompanyId) {
  return (req, res, next) => {
    const user = req.session && req.session.user;
    const companyId = getCompanyId(req);
    if (!canAccessCompany(user, companyId)) {
      return res.status(403).render('error', {
        title: 'Åtkomst nekad',
        message: 'Du har inte behörighet till det här företagets uppgifter.',
      });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole, requireCompanyAccess, canAccessCompany };
