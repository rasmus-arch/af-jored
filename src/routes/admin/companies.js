const express = require('express');
const prisma = require('../../lib/prisma');
const config = require('../../config');
const { generateToken } = require('../../lib/tokens');
const { sendInvitationEmail } = require('../../lib/mailer');
const catalog = require('../../services/catalog');
const { resolveDiscountPercent } = require('../../services/discount');
const { calculateCountertopLine } = require('../../services/quote');
const { PriceRowNotFoundError } = require('../../services/pricing');

const router = express.Router();

router.get('/aterforsaljare', async (req, res, next) => {
  try {
    const companies = await prisma.company.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true, discountRules: true } } },
    });
    res.render('admin/companies/list', { title: 'Återförsäljare', companies });
  } catch (err) {
    next(err);
  }
});

router.get('/aterforsaljare/nytt', (req, res) => {
  res.render('admin/companies/new', { title: 'Ny återförsäljare', error: null, values: {} });
});

router.post('/aterforsaljare', async (req, res, next) => {
  try {
    const { name, orgNumber, street, postalCode, city, contactName, contactEmail, contactPhone, baseDiscountPercent } = req.body;
    if (!name || !name.trim() || !orgNumber || !orgNumber.trim()) {
      return res.status(400).render('admin/companies/new', { title: 'Ny återförsäljare', error: 'Namn och org.nr krävs.', values: req.body });
    }

    const company = await prisma.company.create({
      data: {
        name: name.trim(),
        orgNumber: orgNumber.trim(),
        street: street || null,
        postalCode: postalCode || null,
        city: city || null,
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        baseDiscountPercent: baseDiscountPercent ? baseDiscountPercent : null,
        active: true,
      },
    });
    res.redirect(`/admin/aterforsaljare/${company.id}`);
  } catch (err) {
    next(err);
  }
});

async function loadCompanyDetailData(companyId) {
  const [company, users, discountRules, materials, brands, otherCompanies] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.user.findMany({ where: { companyId }, orderBy: { email: 'asc' } }),
    prisma.discountRule.findMany({ where: { companyId }, include: { material: true, brand: true }, orderBy: { id: 'desc' } }),
    catalog.listMaterials(),
    catalog.listBrands(),
    prisma.company.findMany({ where: { id: { not: companyId } }, orderBy: { name: 'asc' } }),
  ]);
  return { company, users, discountRules, materials, brands, otherCompanies };
}

router.get('/aterforsaljare/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = await loadCompanyDetailData(id);
    if (!data.company) return res.status(404).render('error', { title: 'Hittades inte', message: 'Återförsäljaren kunde inte hittas.' });

    let preview = null;
    let previewError = null;
    const { decorId, thicknessId, depthMm, lengthMm } = req.query;
    if (decorId && thicknessId && depthMm && lengthMm) {
      const decor = await catalog.getDecorById(Number(decorId));
      const priceList = await catalog.getCurrentPriceList();
      if (decor && priceList) {
        try {
          const priceRows = await catalog.getCountertopPriceRows({ priceListId: priceList.id, materialId: decor.materialId, thicknessId: Number(thicknessId) });
          const discountRulesForCalc = await catalog.getDiscountRulesForCompany(id);
          const netPriceOverrides = await catalog.getNetPriceOverridesForCompany(id);
          const line = calculateCountertopLine({
            priceRows,
            netPriceOverrides,
            discountRules: discountRulesForCalc,
            baseDiscountPercent: data.company.baseDiscountPercent,
            materialId: decor.materialId,
            brandId: decor.brandId,
            decorId: decor.id,
            thicknessId: Number(thicknessId),
            depthMm: Number(depthMm),
            lengthMm: Number(lengthMm),
          });
          preview = { decor, line };
        } catch (err) {
          if (err instanceof PriceRowNotFoundError) previewError = err.message;
          else throw err;
        }
      }
    }
    const allDecors = await catalog.listDecors({});

    res.render('admin/companies/detail', {
      title: data.company.name,
      ...data,
      allDecors,
      preview,
      previewError,
      previewQuery: { decorId, thicknessId, depthMm, lengthMm },
      error: null,
      inviteError: null,
      discountError: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/aterforsaljare/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = await loadCompanyDetailData(id);
    if (!data.company) return res.status(404).render('error', { title: 'Hittades inte', message: 'Återförsäljaren kunde inte hittas.' });

    const { name, orgNumber, street, postalCode, city, contactName, contactEmail, contactPhone, baseDiscountPercent } = req.body;
    if (!name || !name.trim() || !orgNumber || !orgNumber.trim()) {
      return res.status(400).render('admin/companies/detail', {
        title: data.company.name, ...data, allDecors: [], preview: null, previewError: null, previewQuery: {},
        error: 'Namn och org.nr krävs.', inviteError: null, discountError: null,
      });
    }

    await prisma.company.update({
      where: { id },
      data: {
        name: name.trim(),
        orgNumber: orgNumber.trim(),
        street: street || null,
        postalCode: postalCode || null,
        city: city || null,
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        baseDiscountPercent: baseDiscountPercent ? baseDiscountPercent : null,
      },
    });
    res.redirect(`/admin/aterforsaljare/${id}`);
  } catch (err) {
    next(err);
  }
});

router.post('/aterforsaljare/:id/vaxla-aktiv', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) return res.status(404).render('error', { title: 'Hittades inte', message: 'Återförsäljaren kunde inte hittas.' });
    await prisma.company.update({ where: { id }, data: { active: !company.active } });
    res.redirect('/admin/aterforsaljare');
  } catch (err) {
    next(err);
  }
});

router.post('/aterforsaljare/:id/anvandare', async (req, res, next) => {
  try {
    const companyId = Number(req.params.id);
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return res.status(404).render('error', { title: 'Hittades inte', message: 'Återförsäljaren kunde inte hittas.' });

    const email = (req.body.email || '').toLowerCase().trim();
    const data = await loadCompanyDetailData(companyId);

    if (!email) {
      return res.status(400).render('admin/companies/detail', {
        title: company.name, ...data, allDecors: [], preview: null, previewError: null, previewQuery: {},
        error: null, inviteError: 'E-postadress krävs.', discountError: null,
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).render('admin/companies/detail', {
        title: company.name, ...data, allDecors: [], preview: null, previewError: null, previewQuery: {},
        error: null, inviteError: 'Det finns redan ett konto med den e-postadressen.', discountError: null,
      });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + config.invitationExpiryHours * 60 * 60 * 1000);
    await prisma.invitation.create({
      data: { companyId, email, role: 'RESELLER', token, expiresAt, invitedById: req.session.user.id },
    });

    const url = `${config.appBaseUrl}/bjudits-in/${token}`;
    await sendInvitationEmail({ to: email, companyName: company.name, url });

    res.redirect(`/admin/aterforsaljare/${companyId}`);
  } catch (err) {
    next(err);
  }
});

router.post('/aterforsaljare/:id/anvandare/:userId/vaxla-aktiv', async (req, res, next) => {
  try {
    const companyId = Number(req.params.id);
    const userId = Number(req.params.userId);
    const user = await prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) return res.status(404).render('error', { title: 'Hittades inte', message: 'Användaren kunde inte hittas.' });
    await prisma.user.update({ where: { id: userId }, data: { active: !user.active } });
    res.redirect(`/admin/aterforsaljare/${companyId}`);
  } catch (err) {
    next(err);
  }
});

router.post('/aterforsaljare/:id/rabatter', async (req, res, next) => {
  try {
    const companyId = Number(req.params.id);
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return res.status(404).render('error', { title: 'Hittades inte', message: 'Återförsäljaren kunde inte hittas.' });

    const materialId = req.body.materialId ? Number(req.body.materialId) : null;
    const brandId = req.body.brandId ? Number(req.body.brandId) : null;
    const discountPercent = req.body.discountPercent;
    const data = await loadCompanyDetailData(companyId);

    if (!discountPercent) {
      return res.status(400).render('admin/companies/detail', {
        title: company.name, ...data, allDecors: [], preview: null, previewError: null, previewQuery: {},
        error: null, inviteError: null, discountError: 'Rabattprocent krävs.',
      });
    }

    await prisma.discountRule.create({
      data: {
        companyId,
        materialId,
        brandId,
        discountPercent,
        validFrom: req.body.validFrom ? new Date(req.body.validFrom) : null,
        validTo: req.body.validTo ? new Date(req.body.validTo) : null,
      },
    });
    await prisma.auditLog.create({
      data: { userId: req.session.user.id, action: 'DISCOUNT_RULE_CREATED', entityType: 'Company', entityId: companyId, newValue: { materialId, brandId, discountPercent }, ipAddress: req.ip },
    });

    res.redirect(`/admin/aterforsaljare/${companyId}`);
  } catch (err) {
    next(err);
  }
});

router.post('/aterforsaljare/:id/rabatter/:ruleId/ta-bort', async (req, res, next) => {
  try {
    const companyId = Number(req.params.id);
    const ruleId = Number(req.params.ruleId);
    const rule = await prisma.discountRule.findFirst({ where: { id: ruleId, companyId } });
    if (!rule) return res.status(404).render('error', { title: 'Hittades inte', message: 'Rabattregeln kunde inte hittas.' });
    await prisma.discountRule.delete({ where: { id: ruleId } });
    await prisma.auditLog.create({
      data: { userId: req.session.user.id, action: 'DISCOUNT_RULE_DELETED', entityType: 'Company', entityId: companyId, oldValue: { materialId: rule.materialId, brandId: rule.brandId, discountPercent: rule.discountPercent }, ipAddress: req.ip },
    });
    res.redirect(`/admin/aterforsaljare/${companyId}`);
  } catch (err) {
    next(err);
  }
});

router.post('/aterforsaljare/:id/rabatter/kopiera', async (req, res, next) => {
  try {
    const companyId = Number(req.params.id);
    const sourceCompanyId = Number(req.body.sourceCompanyId);
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return res.status(404).render('error', { title: 'Hittades inte', message: 'Återförsäljaren kunde inte hittas.' });

    const sourceRules = await prisma.discountRule.findMany({ where: { companyId: sourceCompanyId } });
    for (const rule of sourceRules) {
      await prisma.discountRule.create({
        data: {
          companyId,
          materialId: rule.materialId,
          brandId: rule.brandId,
          discountPercent: rule.discountPercent,
          validFrom: rule.validFrom,
          validTo: rule.validTo,
        },
      });
    }
    await prisma.auditLog.create({
      data: { userId: req.session.user.id, action: 'DISCOUNT_RULES_COPIED', entityType: 'Company', entityId: companyId, newValue: { fromCompanyId: sourceCompanyId, count: sourceRules.length }, ipAddress: req.ip },
    });

    res.redirect(`/admin/aterforsaljare/${companyId}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
