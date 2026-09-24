const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

// E-postutskick är "best effort": misslyckas SMTP loggas felet men
// anropande kod (inbjudan/återställning) kraschar inte - länken skrivs
// alltid till serverloggen så administratören kan skicka den manuellt om
// SMTP inte är konfigurerat i utvecklingsmiljön.
async function sendMail({ to, subject, html, text }) {
  try {
    await getTransporter().sendMail({ from: config.smtp.from, to, subject, html, text });
  } catch (err) {
    console.error(`Kunde inte skicka e-post till ${to}:`, err.message);
  }
}

function sendInvitationEmail({ to, companyName, url }) {
  const text = `Du har blivit inbjuden till Joreds återförsäljarportal å ${companyName}s vägnar.\n\nSkapa ditt lösenord här: ${url}\n\nLänken slutar gälla efter en tid.`;
  console.log(`[inbjudan] ${to}: ${url}`);
  return sendMail({
    to,
    subject: 'Inbjudan till Joreds återförsäljarportal',
    text,
    html: `<p>Du har blivit inbjuden till Joreds återförsäljarportal å <strong>${companyName}</strong>s vägnar.</p><p><a href="${url}">Skapa ditt lösenord</a></p><p>Länken slutar gälla efter en tid.</p>`,
  });
}

function sendPasswordResetEmail({ to, url }) {
  const text = `Återställ ditt lösenord genom att öppna denna länk: ${url}\n\nOm du inte begärt detta kan du ignorera meddelandet.`;
  console.log(`[lösenordsåterställning] ${to}: ${url}`);
  return sendMail({
    to,
    subject: 'Återställ ditt lösenord',
    text,
    html: `<p>Återställ ditt lösenord genom att klicka på länken nedan.</p><p><a href="${url}">Återställ lösenord</a></p><p>Om du inte begärt detta kan du ignorera meddelandet.</p>`,
  });
}

module.exports = { sendMail, sendInvitationEmail, sendPasswordResetEmail };
