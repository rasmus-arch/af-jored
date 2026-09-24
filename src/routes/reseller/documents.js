const path = require('path');
const express = require('express');
const prisma = require('../../lib/prisma');
const { DOCUMENT_DIR } = require('../../middleware/upload');

const router = express.Router();

const CATEGORY_LABELS = {
  PRISLISTA: 'Prislista',
  MONTERINGSANVISNING: 'Monteringsanvisning',
  GARANTIVILLKOR: 'Garantivillkor',
  MARKNADSMATERIAL: 'Marknadsmaterial',
};

router.get('/dokument', async (req, res, next) => {
  try {
    const companyId = req.session.user.companyId;
    const documents = await prisma.document.findMany({
      where: {
        OR: [{ visibility: 'ALLA' }, { visibility: 'SPECIFIKA', companies: { some: { companyId } } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    const byCategory = {};
    for (const doc of documents) {
      byCategory[doc.category] = byCategory[doc.category] || [];
      byCategory[doc.category].push(doc);
    }

    res.render('reseller/documents', { title: 'Dokumentarkiv', byCategory, categoryLabels: CATEGORY_LABELS });
  } catch (err) {
    next(err);
  }
});

router.get('/dokument/:id/hamta', async (req, res, next) => {
  try {
    const companyId = req.session.user.companyId;
    const document = await prisma.document.findFirst({
      where: {
        id: Number(req.params.id),
        OR: [{ visibility: 'ALLA' }, { visibility: 'SPECIFIKA', companies: { some: { companyId } } }],
      },
    });
    if (!document) {
      return res.status(404).render('error', { title: 'Hittades inte', message: 'Dokumentet kunde inte hittas.' });
    }
    res.download(path.join(DOCUMENT_DIR, document.fileUrl), document.title);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
