// Delad wrapper runt argon2 för lösenordshashning i hela appen.
//
// Standardläget i argon2 begär `parallelism: 4`, dvs. fyra samtidiga trådar
// per hashning. På resursbegränsad delad hosting (CloudLinux LVE) kan det
// leda till "Threading failure" när kontot inte får skapa fler trådar just
// då - även när det inte alls är nära sin gräns för övrigt. Vi sänker
// parallelism till 1 (samma totala arbete, bara inte utfört parallellt) för
// att vara robusta även på hårt begränsade konton. `memoryCost`/`timeCost`
// (den faktiska säkerhetsstyrkan) lämnas oförändrade.
const argon2 = require('argon2');

const OPTIONS = { parallelism: 1 };

function hashPassword(password) {
  return argon2.hash(password, OPTIONS);
}

function verifyPassword(hash, password) {
  return argon2.verify(hash, password);
}

module.exports = { hashPassword, verifyPassword };
