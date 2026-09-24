// Delad wrapper runt lösenordshashning i hela appen.
//
// Byter från argon2 (native bindning med egen intern trådpool - orsakade
// "Threading failure" på hårt begränsad delad hosting, se driftshistoriken)
// till Node:s inbyggda crypto.scrypt, som kör i huvudtråden utan native-
// bindningar eller egen processöverhead. Samma mönster som koksfokus-
// systemet, som kört stabilt utan resursproblem.
//
// Format på nya hashar: "salt:hash", båda hex-kodade (samma som fokus).
//
// Bakåtkompatibilitet: befintliga konton har redan argon2-hashar
// ($argon2id$...) lagrade. verifyPassword känner igen det formatet och
// verifierar med argon2 precis som förut - argon2 behålls som beroende
// bara för det. needsRehash() talar om när en sådan gammal hash bör bytas
// ut, så inloggningsflödet kan hasha om till scrypt transparent vid nästa
// lyckade inloggning, utan att användaren märker något.
const crypto = require('crypto');
const argon2 = require('argon2');

const SCRYPT_KEY_LENGTH = 64;

function scryptHash(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptHash(password, salt);
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function verifyScryptPassword(hash, password) {
  const [salt, hex] = (hash || '').split(':');
  if (!salt || !hex) return false;
  const stored = Buffer.from(hex, 'hex');
  const derivedKey = await scryptHash(password, salt);
  if (stored.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(stored, derivedKey);
}

function verifyPassword(hash, password) {
  if (typeof hash === 'string' && hash.startsWith('$argon2')) {
    return argon2.verify(hash, password);
  }
  return verifyScryptPassword(hash, password);
}

function needsRehash(hash) {
  return typeof hash === 'string' && hash.startsWith('$argon2');
}

module.exports = { hashPassword, verifyPassword, needsRehash };
