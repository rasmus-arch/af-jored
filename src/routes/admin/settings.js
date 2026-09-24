const express = require('express');
const prisma = require('../../lib/prisma');
const { uploadImage, imagePublicUrl } = require('../../middleware/upload');
const { verifyCsrfAfterUpload } = require('../../middleware/csrf');
const { invalidateSettingsCache } = require('../../services/catalog');

const router = express.Router();

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

async function getOrCreateSettings() {
  const existing = await prisma.settings.findFirst();
  if (existing) return existing;
  return prisma.settings.create({ data: { vatPercentage: '25.00' } });
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

    await prisma.settings.update({
      where: { id: settings.id },
      data: {
        vatPercentage,
        accentColor: trimmedAccentColor || null,
        ...(removeLogo === 'true' ? { logoUrl: null } : {}),
        ...(req.file ? { logoUrl: imagePublicUrl(req.file.filename) } : {}),
      },
    });
    invalidateSettingsCache();

    res.redirect('/admin/installningar');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
