const express = require('express');
const { query, mapRow, mapRows } = require('../../lib/db');
const { findUserByEmail, createAuditLog } = require('../../services/users');
const config = require('../../config');
const { generateToken } = require('../../lib/tokens');
const { sendInvitationEmail } = require('../../lib/mailer');
const catalog = require('../../services/catalog');
const { calculateCountertopLine } = require('../../services/quote');
const { PriceRowNotFoundError } = require('../../services/pricing');

const router = express.Router();

async function findCompanyById(id) {
  const rows = await query('SELECT * FROM companies WHERE id = ?', [id]);
  return mapRow(rows[0]) || null;
}

router.get('/aterforsaljare', async (req, res, next) => {
  try {
    const companies = mapRows(await query('SELECT * FROM companies ORDER BY name ASC'));
    const [userCounts, discountRuleCounts] = await Promise.all([
      query('SELECT company_id, COUNT(*) AS n FROM users WHERE company_id IS NOT NULL GROUP BY company_id'),
      query('SELECT company_id, COUNT(*) AS n FROM discount_rules GROUP BY company_id'),
    ]);
    const userCountById = new Map(userCounts.map((r) => [r.company_id, r.n]));
    const discountCountById = new Map(discountRuleCounts.map((r) => [r.company_id, r.n]));
    for (const c of companies) {
      c._count = { users: userCountById.get(c.id) || 0, discountRules: discountCountById.get(c.id) || 0 };
    }
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
    const { name, orgNumber, street, postalCode, city, contactName, contactEmail, contactPhone } = req.body;
    if (!name || !name.trim() || !orgNumber || !orgNumber.trim()) {
      return res.status(400).render('admin/companies/new', { title: 'Ny återförsäljare', error: 'Namn och org.nr krävs.', values: req.body });
    }

    const result = await query(
      `INSERT INTO companies (name, org_number, street, postal_code, city, contact_name, contact_email, contact_phone, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [name.trim(), orgNumber.trim(), street || null, postalCode || null, city || null, contactName || null, contactEmail || null, contactPhone || null]
    );
    res.redirect(`/admin/aterforsaljare/${result.insertId}`);
  } catch (err) {
    next(err);
  }
});

async function loadCompanyDetailData(companyId) {
  const [company, users, discountRuleRows, materials, brands, otherCompanies, brandAccess] = await Promise.all([
    findCompanyById(companyId),
    mapRows(await query('SELECT * FROM users WHERE company_id = ? ORDER BY email ASC', [companyId])),
    query(
      `SELECT r.*, m.name AS m_name, b.name AS b_name
       FROM discount_rules r
       LEFT JOIN materials m ON m.id = r.material_id
       LEFT JOIN brands b ON b.id = r.brand_id
       WHERE r.company_id = ?
       ORDER BY r.id DESC`,
      [companyId]
    ),
    catalog.listMaterials(),
    catalog.listBrands(),
    mapRows(await query('SELECT * FROM companies WHERE id != ? ORDER BY name ASC', [companyId])),
    catalog.getBrandAccessForCompany(companyId),
  ]);
  const discountRules = discountRuleRows.map((row) => {
    const rule = mapRow(row);
    rule.material = row.m_name != null ? { name: row.m_name } : null;
    rule.brand = row.b_name != null ? { name: row.b_name } : null;
    return rule;
  });
  const brandVisibility = new Map(brandAccess.map((a) => [a.brandId, a.visible]));
  const brandsWithAccess = brands.map((b) => ({ ...b, visible: brandVisibility.has(b.id) ? brandVisibility.get(b.id) : true }));
  return { company, users, discountRules, materials, brands: brandsWithAccess, otherCompanies };
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
            materialId: decor.materialId,
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

    const { name, orgNumber, street, postalCode, city, contactName, contactEmail, contactPhone } = req.body;
    if (!name || !name.trim() || !orgNumber || !orgNumber.trim()) {
      return res.status(400).render('admin/companies/detail', {
        title: data.company.name, ...data, allDecors: [], preview: null, previewError: null, previewQuery: {},
        error: 'Namn och org.nr krävs.', inviteError: null, discountError: null,
      });
    }

    await query(
      `UPDATE companies SET name = ?, org_number = ?, street = ?, postal_code = ?, city = ?, contact_name = ?, contact_email = ?, contact_phone = ?, updated_at = NOW() WHERE id = ?`,
      [name.trim(), orgNumber.trim(), street || null, postalCode || null, city || null, contactName || null, contactEmail || null, contactPhone || null, id]
    );
    res.redirect(`/admin/aterforsaljare/${id}`);
  } catch (err) {
    next(err);
  }
});

router.post('/aterforsaljare/:id/vaxla-aktiv', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const company = await findCompanyById(id);
    if (!company) return res.status(404).render('error', { title: 'Hittades inte', message: 'Återförsäljaren kunde inte hittas.' });
    await query('UPDATE companies SET active = ?, updated_at = NOW() WHERE id = ?', [company.active ? 0 : 1, id]);
    res.redirect('/admin/aterforsaljare');
  } catch (err) {
    next(err);
  }
});

router.post('/aterforsaljare/:id/anvandare', async (req, res, next) => {
  try {
    const companyId = Number(req.params.id);
    const company = await findCompanyById(companyId);
    if (!company) return res.status(404).render('error', { title: 'Hittades inte', message: 'Återförsäljaren kunde inte hittas.' });

    const email = (req.body.email || '').toLowerCase().trim();
    const data = await loadCompanyDetailData(companyId);

    if (!email) {
      return res.status(400).render('admin/companies/detail', {
        title: company.name, ...data, allDecors: [], preview: null, previewError: null, previewQuery: {},
        error: null, inviteError: 'E-postadress krävs.', discountError: null,
      });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(400).render('admin/companies/detail', {
        title: company.name, ...data, allDecors: [], preview: null, previewError: null, previewQuery: {},
        error: null, inviteError: 'Det finns redan ett konto med den e-postadressen.', discountError: null,
      });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + config.invitationExpiryHours * 60 * 60 * 1000);
    await query(
      'INSERT INTO invitations (company_id, email, role, token, expires_at, invited_by_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [companyId, email, 'RESELLER', token, expiresAt, req.session.user.id]
    );

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
    const rows = mapRows(await query('SELECT * FROM users WHERE id = ? AND company_id = ?', [userId, companyId]));
    const user = rows[0];
    if (!user) return res.status(404).render('error', { title: 'Hittades inte', message: 'Användaren kunde inte hittas.' });
    await query('UPDATE users SET active = ?, updated_at = NOW() WHERE id = ?', [user.active ? 0 : 1, userId]);
    res.redirect(`/admin/aterforsaljare/${companyId}`);
  } catch (err) {
    next(err);
  }
});

router.post('/aterforsaljare/:id/rabatter', async (req, res, next) => {
  try {
    const companyId = Number(req.params.id);
    const company = await findCompanyById(companyId);
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

    await query(
      'INSERT INTO discount_rules (company_id, material_id, brand_id, discount_percent, valid_from, valid_to, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [companyId, materialId, brandId, discountPercent, req.body.validFrom ? new Date(req.body.validFrom) : null, req.body.validTo ? new Date(req.body.validTo) : null]
    );
    await createAuditLog({
      userId: req.session.user.id,
      action: 'DISCOUNT_RULE_CREATED',
      entityType: 'Company',
      entityId: companyId,
      newValue: { materialId, brandId, discountPercent },
      ipAddress: req.ip,
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
    const rows = mapRows(await query('SELECT * FROM discount_rules WHERE id = ? AND company_id = ?', [ruleId, companyId]));
    const rule = rows[0];
    if (!rule) return res.status(404).render('error', { title: 'Hittades inte', message: 'Rabattregeln kunde inte hittas.' });
    await query('DELETE FROM discount_rules WHERE id = ?', [ruleId]);
    await createAuditLog({
      userId: req.session.user.id,
      action: 'DISCOUNT_RULE_DELETED',
      entityType: 'Company',
      entityId: companyId,
      oldValue: { materialId: rule.materialId, brandId: rule.brandId, discountPercent: rule.discountPercent },
      ipAddress: req.ip,
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
    const company = await findCompanyById(companyId);
    if (!company) return res.status(404).render('error', { title: 'Hittades inte', message: 'Återförsäljaren kunde inte hittas.' });

    const sourceRules = mapRows(await query('SELECT * FROM discount_rules WHERE company_id = ?', [sourceCompanyId]));
    for (const rule of sourceRules) {
      await query(
        'INSERT INTO discount_rules (company_id, material_id, brand_id, discount_percent, valid_from, valid_to, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [companyId, rule.materialId, rule.brandId, rule.discountPercent, rule.validFrom, rule.validTo]
      );
    }
    await createAuditLog({
      userId: req.session.user.id,
      action: 'DISCOUNT_RULES_COPIED',
      entityType: 'Company',
      entityId: companyId,
      newValue: { fromCompanyId: sourceCompanyId, count: sourceRules.length },
      ipAddress: req.ip,
    });

    res.redirect(`/admin/aterforsaljare/${companyId}`);
  } catch (err) {
    next(err);
  }
});

router.post('/aterforsaljare/:id/varumarken/:brandId', async (req, res, next) => {
  try {
    const companyId = Number(req.params.id);
    const brandId = Number(req.params.brandId);
    const company = await findCompanyById(companyId);
    const brandRows = await query('SELECT * FROM brands WHERE id = ?', [brandId]);
    if (!company || brandRows.length === 0) {
      return res.status(404).render('error', { title: 'Hittades inte', message: 'Återförsäljaren eller varumärket kunde inte hittas.' });
    }

    const visible = req.body.visible === 'true' ? 1 : 0;
    await query(
      `INSERT INTO company_brand_access (company_id, brand_id, visible) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE visible = VALUES(visible)`,
      [companyId, brandId, visible]
    );

    res.redirect(`/admin/aterforsaljare/${companyId}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
