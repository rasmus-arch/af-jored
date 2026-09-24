const express = require('express');
const prisma = require('../../lib/prisma');
const catalog = require('../../services/catalog');
const { calculateCountertopLine, calculateProductLine } = require('../../services/quote');
const { PriceRowNotFoundError } = require('../../services/pricing');

const router = express.Router();

const STATUS_OPTIONS = [
  { value: 'AKTIV', label: 'Aktiv' },
  { value: 'UTGAENDE', label: 'Utgående' },
  { value: 'UTGATT', label: 'Utgått' },
];

router.get('/sortiment', async (req, res, next) => {
  try {
    const { materialId, thicknessMm, categoryId, status, q, productType, brandId } = req.query;
    const companyId = req.session.user.companyId;

    const [materials, categories, thicknessValues, decors, brands, products] = await Promise.all([
      catalog.listMaterials(),
      catalog.listCategories(),
      catalog.listDistinctThicknessValues(),
      catalog.listDecors({
        materialId: materialId ? Number(materialId) : undefined,
        thicknessMm,
        categoryId: categoryId ? Number(categoryId) : undefined,
        status: status || undefined,
        search: q ? q.trim() : undefined,
      }),
      catalog.listVisibleBrandsForCompany(companyId),
      catalog.listProducts({
        type: productType || undefined,
        brandId: brandId ? Number(brandId) : undefined,
        companyId,
      }),
    ]);

    res.render('reseller/sortiment/list', {
      title: 'Sortiment',
      materials,
      categories,
      thicknessValues,
      statusOptions: STATUS_OPTIONS,
      decors,
      brands,
      products,
      filters: { materialId, thicknessMm, categoryId, status, q, productType, brandId },
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

    await prisma.productView.create({
      data: { decorId: decor.id, companyId: req.session.user.companyId, userId: req.session.user.id },
    });

    const [priceList, settings, discountRules, netPriceOverrides] = await Promise.all([
      catalog.getCurrentPriceList(),
      catalog.getSettings(),
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
                materialId: decor.materialId,
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

router.get('/sortiment/produkt/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const companyId = req.session.user.companyId;
    const product = await catalog.getProductById(id);
    if (!product || !product.active) {
      return res.status(404).render('error', { title: 'Hittades inte', message: 'Produkten kunde inte hittas.' });
    }

    const access = await catalog.getBrandAccessForCompany(companyId);
    const hiddenBrandIds = new Set(access.filter((a) => !a.visible).map((a) => a.brandId));
    if (hiddenBrandIds.has(product.brandId)) {
      return res.status(404).render('error', { title: 'Hittades inte', message: 'Produkten kunde inte hittas.' });
    }

    const [priceList, settings, discountRules] = await Promise.all([
      catalog.getCurrentPriceList(),
      catalog.getSettings(),
      catalog.getDiscountRulesForCompany(companyId),
    ]);

    let line = null;
    let error = null;
    if (!priceList) {
      error = 'Ingen gällande prislista hittades.';
    } else {
      const priceRow = await catalog.getProductPrice({ priceListId: priceList.id, productId: product.id });
      if (!priceRow) {
        error = 'Inget pris är ännu inlagt för den här produkten.';
      } else {
        line = calculateProductLine({
          unitPrice: priceRow.price,
          quantity: 1,
          discountRules,
          brandId: product.brandId,
          vatPercent: settings.vatPercentage,
        });
      }
    }

    res.render('reseller/sortiment/productItem', {
      title: `${product.name} (${product.brand.name})`,
      product,
      line,
      error,
      vatPercent: settings.vatPercentage,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
