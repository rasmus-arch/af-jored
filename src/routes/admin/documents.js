const fs = require('fs');
const path = require('path');
const express = require('express');
const prisma = require('../../lib/prisma');
const { uploadDocument, DOCUMENT_DIR } = require('../../middleware/upload');
const { verifyCsrfAfterUpload } = require('../../middleware/csrf');

const router = express.Router();

const CATEGORY_LABELS = {
  PRISLISTA: 'Prislista',
  MONTERINGSANVISNING: 'Monteringsanvisning',
  GARANTIVILLKOR: 'Garantivillkor',
  MARKNADSMATERIAL: 'Marknadsmaterial',
};

router.get('/dokument', async (req, res, next) => {
  try {
    const [documents, companies] = await Promise.all([
      prisma.document.findMany({ orderBy: { createdAt: 'desc' }, include: { companies: { include: { company: true } } } }),
      prisma.company.findMany({ orderBy: { name: 'asc' } }),
    ]);
    res.render('admin/documents/list', { title: 'Dokument', documents, companies, categoryLabels: CATEGORY_LABELS, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/dokument', uploadDocument.single('file'), verifyCsrfAfterUpload, async (req, res, next) => {
  try {
    const { title, category, visibility } = req.body;
    const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });

    if (!req.file || !title || !title.trim() || !CATEGORY_LABELS[category]) {
      if (req.file) fs.unlink(path.join(DOCUMENT_DIR, req.file.filename), () => {});
      const documents = await prisma.document.findMany({ orderBy: { createdAt: 'desc' }, include: { companies: { include: { company: true } } } });
      return res.status(400).render('admin/documents/list', {
        title: 'Dokument', documents, companies, categoryLabels: CATEGORY_LABELS,
        error: 'Titel, kategori och fil krävs.',
      });
    }

    const document = await prisma.document.create({
      data: {
        title: title.trim(),
        fileUrl: req.file.filename,
        category,
        visibility: visibility === 'SPECIFIKA' ? 'SPECIFIKA' : 'ALLA',
        createdById: req.session.user.id,
      },
    });

    if (visibility === 'SPECIFIKA') {
      const companyIds = [].concat(req.body.companyIds || []).map(Number);
      for (const companyId of companyIds) {
        await prisma.documentCompany.create({ data: { documentId: document.id, companyId } });
      }
    }

    res.redirect('/admin/dokument');
  } catch (err) {
    next(err);
  }
});

router.get('/dokument/:id/hamta', async (req, res, next) => {
  try {
    const document = await prisma.document.findUnique({ where: { id: Number(req.params.id) } });
    if (!document) return res.status(404).render('error', { title: 'Hittades inte', message: 'Dokumentet kunde inte hittas.' });
    res.download(path.join(DOCUMENT_DIR, document.fileUrl), document.title);
  } catch (err) {
    next(err);
  }
});

router.post('/dokument/:id/ta-bort', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const document = await prisma.document.findUnique({ where: { id } });
    if (!document) return res.status(404).render('error', { title: 'Hittades inte', message: 'Dokumentet kunde inte hittas.' });

    await prisma.documentCompany.deleteMany({ where: { documentId: id } });
    await prisma.document.delete({ where: { id } });
    fs.unlink(path.join(DOCUMENT_DIR, document.fileUrl), () => {});

    res.redirect('/admin/dokument');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
