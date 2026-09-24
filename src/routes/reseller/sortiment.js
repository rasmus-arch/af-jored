const express = require('express');
const prisma = require('../../lib/prisma');
const catalog = require('../../services/catalog');
const { calculateCountertopLine } = require('../../services/quote');
const { PriceRowNotFoundError } = require('../../services/pricing');

const router = express.Router();

const STATUS_OPTIONS = [
  { value: 'AKTIV', label: 'Aktiv' },
  { value: 'UTGAENDE', label: 'Utgående' },
  { value: 'UTGATT', label: 'Utgått' },
];

router.get('/sortiment', async (req, res, next) => {
  try {
    const { materialId, brandId, thicknessMm, categoryId, status, q } = req.query;

    const [materials, brands, categories, thicknessValues, decors] = await Promise.all([
      catalog.listMaterials(),
      catalog.listBrands(),
      catalog.listCategories(),
      catalog.listDistinctThicknessValues(),
      catalog.listDecors({
        materialId: materialId ? Number(materialId) : undefined,
        brandId: brandId ? Number(brandId) : undefined,
        thicknessMm,
        categoryId: categoryId ? Number(categoryId) : undefined,
        status: status || undefined,
        search: q ? q.trim() : undefined,
      }),
    ]);

    res.render('reseller/sortiment/list', {
      title: 'Sortiment',
      materials,
      brands,
      categories,
      thicknessValues,
      statusOptions: STATUS_OPTIONS,
      decors,
      filters: { materialId, brandId, thicknessMm, categoryId, status, q },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/sortiment/:articleCode', async (req, res, next) => {
  try {
    const decor = await catalog.getDecorByArticleCode(req.params.articleCode);
    if (!decor) {
      return res.status(404).render('error', { title: 'Hittades inte', message: 'Dekoren kunde inte hittas.' });
    }

    const [priceList, settings, company, discountRules, netPriceOverrides] = await Promise.all([
      catalog.getCurrentPriceList(),
      catalog.getSettings(),
      prisma.company.findUnique({ where: { id: req.session.user.companyId } }),
      catalog.getDiscountRulesForCompany(req.session.user.companyId),
      catalog.getNetPriceOverridesForCompany(req.session.user.companyId),
    ]);

    const thicknessRows = [];
    for (const dt of decor.decorThicknesses) {
      const edgeProfiles = await catalog.getCompatibleEdgeProfiles({
        materialId: decor.materialId,
        thicknessId: dt.thickness.id,
      });

      let rows = [];
      let error = null;
      if (!priceList) {
        error = 'Ingen gällande prislista hittades.';
      } else {
        const priceRows = await catalog.getCountertopPriceRows({
          priceListId: priceList.id,
          materialId: decor.materialId,
          thicknessId: dt.thickness.id,
        });
        if (priceRows.length === 0) {
          error = 'Inga priser är ännu inlagda för den här tjockleken.';
        } else {
          rows = priceRows.map((row) => {
            try {
              const line = calculateCountertopLine({
                priceRows,
                netPriceOverrides,
                discountRules,
                baseDiscountPercent: company.baseDiscountPercent,
                materialId: decor.materialId,
                brandId: decor.brandId,
                decorId: decor.id,
                thicknessId: dt.thickness.id,
                depthMm: row.depthFromMm,
                lengthMm: 1000,
                vatPercent: settings.vatPercentage,
              });
              return { depthFromMm: row.depthFromMm, depthToMm: row.depthToMm, ...line };
            } catch (err) {
              if (err instanceof PriceRowNotFoundError) return null;
              throw err;
            }
          }).filter(Boolean);
        }
      }

      thicknessRows.push({ thickness: dt.thickness, edgeProfiles, rows, error });
    }

    res.render('reseller/sortiment/product', {
      title: `${decor.name} (${decor.articleCode})`,
      decor,
      thicknessRows,
      vatPercent: settings.vatPercentage,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
