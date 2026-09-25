const fs = require('fs');
const path = require('path');
const express = require('express');
const { query, mapRow, mapRows } = require('../../lib/db');
const { uploadDocument, DOCUMENT_DIR } = require('../../middleware/upload');
const { verifyCsrfAfterUpload } = require('../../middleware/csrf');

const router = express.Router();

const CATEGORY_LABELS = {
  PRISLISTA: 'Prislista',
  MONTERINGSANVISNING: 'Monteringsanvisning',
  GARANTIVILLKOR: 'Garantivillkor',
  MARKNADSMATERIAL: 'Marknadsmaterial',
};

async function listDocumentsWithCompanies() {
  const [documents, links] = await Promise.all([
    mapRows(await query('SELECT * FROM documents ORDER BY created_at DESC')),
    query(
      `SELECT dc.document_id, c.id AS c_id, c.name AS c_name
       FROM document_companies dc
       JOIN companies c ON c.id = dc.company_id`
    ),
  ]);
  const companiesByDocumentId = new Map();
  for (const link of links) {
    if (!companiesByDocumentId.has(link.document_id)) companiesByDocumentId.set(link.document_id, []);
    companiesByDocumentId.get(link.document_id).push({ company: { id: link.c_id, name: link.c_name } });
  }
  for (const doc of documents) {
    doc.companies = companiesByDocumentId.get(doc.id) || [];
  }
  return documents;
}

router.get('/dokument', async (req, res, next) => {
  try {
    const [documents, companies] = await Promise.all([
      listDocumentsWithCompanies(),
      mapRows(await query('SELECT * FROM companies ORDER BY name ASC')),
    ]);
    res.render('admin/documents/list', { title: 'Dokument', documents, companies, categoryLabels: CATEGORY_LABELS, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/dokument', uploadDocument.single('file'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    const { title, category, visibility } = req.body;
    const companies = mapRows(await query('SELECT * FROM companies ORDER BY name ASC'));

    if (!req.file || !title || !title.trim() || !CATEGORY_LABELS[category]) {
      if (req.file) fs.unlink(path.join(DOCUMENT_DIR, req.file.filename), () => {});
      const documents = await listDocumentsWithCompanies();
      return res.status(400).render('admin/documents/list', {
        title: 'Dokument', documents, companies, categoryLabels: CATEGORY_LABELS,
        error: 'Titel, kategori och fil krävs.',
      });
    }

    const result = await query(
      'INSERT INTO documents (title, file_url, category, visibility, created_by_id, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [title.trim(), req.file.filename, category, visibility === 'SPECIFIKA' ? 'SPECIFIKA' : 'ALLA', req.session.user.id]
    );

    if (visibility === 'SPECIFIKA') {
      const companyIds = [].concat(req.body.companyIds || []).map(Number);
      for (const companyId of companyIds) {
        await query('INSERT INTO document_companies (document_id, company_id) VALUES (?, ?)', [result.insertId, companyId]);
      }
    }

    res.redirect('/admin/dokument');
  } catch (err) {
    next(err);
  }
});

router.get('/dokument/:id/hamta', async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM documents WHERE id = ?', [Number(req.params.id)]);
    const document = mapRow(rows[0]);
    if (!document) return res.status(404).render('error', { title: 'Hittades inte', message: 'Dokumentet kunde inte hittas.' });
    res.download(path.join(DOCUMENT_DIR, document.fileUrl), document.title);
  } catch (err) {
    next(err);
  }
});

router.post('/dokument/:id/ta-bort', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await query('SELECT * FROM documents WHERE id = ?', [id]);
    const document = mapRow(rows[0]);
    if (!document) return res.status(404).render('error', { title: 'Hittades inte', message: 'Dokumentet kunde inte hittas.' });

    await query('DELETE FROM document_companies WHERE document_id = ?', [id]);
    await query('DELETE FROM documents WHERE id = ?', [id]);
    fs.unlink(path.join(DOCUMENT_DIR, document.fileUrl), () => {});

    res.redirect('/admin/dokument');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
