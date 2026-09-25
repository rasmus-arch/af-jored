const express = require('express');
const { query, mapRow } = require('../../lib/db');
const { uploadImage, imagePublicUrl } = require('../../middleware/upload');
const { verifyCsrfAfterUpload } = require('../../middleware/csrf');
const { invalidateSettingsCache } = require('../../services/catalog');

const router = express.Router();

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

async function getOrCreateSettings() {
  const rows = await query('SELECT * FROM settings LIMIT 1');
  if (rows.length > 0) return mapRow(rows[0]);
  const result = await query('INSERT INTO settings (vat_percentage, updated_at) VALUES (?, NOW())', ['25.00']);
  return { id: result.insertId, vatPercentage: '25.00', logoUrl: null, accentColor: null };
}

router.get('/installningar', async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    res.render('admin/settings/form', { title: 'Inställningar', settings, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/installningar', uploadImage.single('logo'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    const { vatPercentage, accentColor, removeLogo } = req.body;

    if (!vatPercentage || Number.isNaN(Number(vatPercentage))) {
      return res.status(400).render('admin/settings/form', {
        title: 'Inställningar', settings: { ...settings, ...req.body }, error: 'Momssats måste vara ett giltigt tal.',
      });
    }

    const trimmedAccentColor = accentColor ? accentColor.trim() : '';
    if (trimmedAccentColor && !HEX_COLOR.test(trimmedAccentColor)) {
      return res.status(400).render('admin/settings/form', {
        title: 'Inställningar', settings: { ...settings, ...req.body }, error: 'Accentfärg måste anges som en hex-kod, t.ex. #b08a3e.',
      });
    }

    let logoUrl = settings.logoUrl;
    if (removeLogo === 'true') logoUrl = null;
    if (req.file) logoUrl = imagePublicUrl(req.file.filename);

    await query('UPDATE settings SET vat_percentage = ?, accent_color = ?, logo_url = ?, updated_at = NOW() WHERE id = ?', [
      vatPercentage,
      trimmedAccentColor || null,
      logoUrl,
      settings.id,
    ]);
    invalidateSettingsCache();

    res.redirect('/admin/installningar');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
