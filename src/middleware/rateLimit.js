const rateLimit = require('express-rate-limit');

// Begränsar antalet inloggningsförsök för att försvåra lösenordsgissning.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'För många inloggningsförsök. Försök igen om en stund.',
});

module.exports = { loginLimiter };
