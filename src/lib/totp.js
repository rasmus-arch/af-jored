const { authenticator } = require('otplib');
const QRCode = require('qrcode');

const ISSUER = 'Joreds återförsäljarportal';

function generateSecret() {
  return authenticator.generateSecret();
}

function verifyToken(secret, token) {
  if (!secret || !token) return false;
  try {
    return authenticator.verify({ token: String(token).trim(), secret });
  } catch {
    return false;
  }
}

async function generateQrCodeDataUrl(email, secret) {
  const otpauthUrl = authenticator.keyuri(email, ISSUER, secret);
  return QRCode.toDataURL(otpauthUrl);
}

module.exports = { generateSecret, verifyToken, generateQrCodeDataUrl };
