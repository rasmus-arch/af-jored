const express = require('express');
const { query, mapRow } = require('../../lib/db');
const catalog = require('../../services/catalog');
const { calculateCountertopLine } = require('../../services/quote');
const { calculateLinePrice, PriceRowNotFoundError } = require('../../services/pricing');
const { roundMoney, sumMoney } = require('../../lib/money');

const router = express.Router();

router.get('/kalkylator', async (req, res, next) => {
  try {
    const decors = await catalog.listDecors({});
    const priceList = await catalog.getCurrentPriceList();
    const settings = await catalog.getSettings();
    const company = mapRow((await query('SELECT * FROM companies WHERE id = ?', [req.session.user.companyId]))[0]);
    const discountRules = await catalog.getDiscountRulesForCompany(company.id);
    const netPriceOverrides = await catalog.getNetPriceOverridesForCompany(company.id);

    const errors = [];
    let selectedDecor = null;
    let edgeProfiles = [];
    let addOns = [];
    let result = null;

    const decorId = req.query.decorId ? Number(req.query.decorId) : null;
    const thicknessId = req.query.thicknessId ? Number(req.query.thicknessId) : null;
    const depthMm = req.query.depthMm ? Number(req.query.depthMm) : null;
    const lengthMm = req.query.lengthMm ? Number(req.query.lengthMm) : null;
    const edgeProfileId = req.query.edgeProfileId ? Number(req.query.edgeProfileId) : null;
    const addOnIds = [].concat(req.query.addOnIds || []).map(Number).filter((n) => !Number.isNaN(n));

    if (decorId) {
      selectedDecor = await catalog.getDecorById(decorId);
      if (!selectedDecor) {
        errors.push('Vald dekor kunde inte hittas.');
      } else {
        addOns = await catalog.getAvailableAddOns({ materialId: selectedDecor.materialId });
        if (thicknessId) {
          edgeProfiles = await catalog.getCompatibleEdgeProfiles({
            materialId: selectedDecor.materialId,
            thicknessId,
          });
        }

        if (thicknessId && depthMm && lengthMm) {
          if (!priceList) {
            errors.push('Ingen gällande prislista hittades.');
          } else if (selectedDecor.maxLengthMm && lengthMm > selectedDecor.maxLengthMm) {
            errors.push(`Vald längd (${lengthMm} mm) överstiger dekorens maxlängd (${selectedDecor.maxLengthMm} mm).`);
          } else {
            try {
              const priceRows = await catalog.getCountertopPriceRows({
                priceListId: priceList.id,
                materialId: selectedDecor.materialId,
                thicknessId,
              });

              const line = calculateCountertopLine({
                priceRows,
                netPriceOverrides,
                discountRules,
                materialId: selectedDecor.materialId,
                decorId: selectedDecor.id,
                thicknessId,
                depthMm,
                lengthMm,
                vatPercent: settings.vatPercentage,
              });

              let edgeLine = null;
              if (edgeProfileId) {
                const edgeProfile = edgeProfiles.find((p) => p.id === edgeProfileId);
                const priceRow = await catalog.getEdgeProfilePrice({ priceListId: priceList.id, edgeProfileId, thicknessId });
                if (edgeProfile && priceRow) {
                  const amount = edgeProfile.priceUnit === 'LOPMETER'
                    ? calculateLinePrice(priceRow.price, lengthMm).rounded
                    : roundMoney(priceRow.price);
                  edgeLine = { edgeProfile, amount };
                }
              }

              const addOnLines = [];
              for (const addOnId of addOnIds) {
                const addOn = addOns.find((a) => a.id === addOnId);
                if (!addOn) continue;
                const priceRow = await catalog.getAddOnPrice({ priceListId: priceList.id, addOnId, thicknessId });
                if (!priceRow) continue;
                const amount = addOn.priceUnit === 'LOPMETER'
                  ? calculateLinePrice(priceRow.price, lengthMm).rounded
                  : roundMoney(priceRow.price);
                addOnLines.push({ addOn, amount });
              }

              const totalRecommended = roundMoney(
                sumMoney([line.recommendedPrice, edgeLine ? edgeLine.amount : null, ...addOnLines.map((a) => a.amount)])
              );
              const totalPurchase = roundMoney(
                sumMoney([line.purchasePrice, edgeLine ? edgeLine.amount : null, ...addOnLines.map((a) => a.amount)])
              );

              result = { line, edgeLine, addOnLines, totalRecommended, totalPurchase };
            } catch (err) {
              if (err instanceof PriceRowNotFoundError) {
                errors.push(err.message);
              } else {
                throw err;
              }
            }
          }
        }
      }
    }

    res.render('reseller/kalkylator', {
      title: 'Priskalkylator',
      decors,
      selectedDecor,
      edgeProfiles,
      addOns,
      result,
      errors,
      query: { decorId, thicknessId, depthMm, lengthMm, edgeProfileId, addOnIds },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
