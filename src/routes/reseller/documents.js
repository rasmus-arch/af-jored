const path = require('path');
const express = require('express');
const { query, mapRow, mapRows } = require('../../lib/db');
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
    const documents = mapRows(
      await query(
        `SELECT DISTINCT d.*
         FROM documents d
         LEFT JOIN document_companies dc ON dc.document_id = d.id AND dc.company_id = ?
         WHERE d.visibility = 'ALLA' OR (d.visibility = 'SPECIFIKA' AND dc.company_id IS NOT NULL)
         ORDER BY d.created_at DESC`,
        [companyId]
      )
    );

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
    const rows = await query(
      `SELECT DISTINCT d.*
       FROM documents d
       LEFT JOIN document_companies dc ON dc.document_id = d.id AND dc.company_id = ?
       WHERE d.id = ? AND (d.visibility = 'ALLA' OR (d.visibility = 'SPECIFIKA' AND dc.company_id IS NOT NULL))`,
      [companyId, Number(req.params.id)]
    );
    const document = mapRow(rows[0]);
    if (!document) {
      return res.status(404).render('error', { title: 'Hittades inte', message: 'Dokumentet kunde inte hittas.' });
    }
    res.download(path.join(DOCUMENT_DIR, document.fileUrl), document.title);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
