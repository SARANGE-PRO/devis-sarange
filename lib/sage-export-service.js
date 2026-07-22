/**
 * sage-export-service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Liaison entre le moteur PUR d'export Sage (lib/sage-export.mjs) et le vrai
 * moteur de calcul de l'application. C'est ici — et uniquement ici — que les
 * dépendances métier sont branchées, pour que les montants exportés vers Sage
 * soient EXACTEMENT ceux du devis affiché et du PDF (commission redistribuée,
 * remises nettes, pose par unité, TVA par ligne).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { generateDesignation } from '@/lib/designation-generator';
import {
  applyCommissionToCartItems,
  calculateItemPrice,
  getItemPricingSummary,
  getPoseLabel,
} from '@/lib/products';
import { getActiveVariant, getQuoteVariants, isVariantsMode } from '@/lib/quote-cloud';
import { computeQuoteTotals, getItemTvaRate } from '@/lib/quote-totals.mjs';
import { buildSageExportModel } from '@/lib/sage-export.mjs';

const SAGE_EXPORT_DEPS = {
  applyCommissionToCartItems,
  calculateItemPrice,
  getItemPricingSummary,
  computeQuoteTotals,
  getItemTvaRate,
  generateDesignation,
  getPoseLabel,
};

/**
 * Variante d'un devis à exporter vers Sage :
 *  1. la variante RETENUE par le client à la signature si elle existe,
 *  2. sinon la variante active du back-office (identique aux champs racine
 *     pour un devis mono-option).
 */
export const getSageExportVariant = (quote) => {
  const payload = quote?.payload || {};
  const variants = getQuoteVariants(payload);
  const active = getActiveVariant(payload);

  if (!isVariantsMode(payload)) {
    return { variant: active, variantName: '', selection: 'mono' };
  }

  const selectedVariantId = quote?.signatureWorkflow?.selectedVariantId;
  if (selectedVariantId) {
    const signedVariant = variants.find((variant) => variant.id === selectedVariantId);
    if (signedVariant) {
      return {
        variant: signedVariant,
        variantName: signedVariant.name || '',
        selection: 'signed',
      };
    }
  }

  return { variant: active, variantName: active?.name || '', selection: 'active' };
};

/**
 * Construit le modèle d'export Sage complet d'un devis cloud (`users/{uid}/quotes`).
 *
 * @param {object} quote     devis sérialisé (id, quoteNumber, payload…)
 * @param {object} settings  paramètres Compta (bruts ou normalisés)
 * @param {Date}   exportDate date de génération (par défaut : maintenant)
 */
export const buildSageExportModelForQuote = (quote, settings, exportDate = new Date()) => {
  const { variant, variantName, selection } = getSageExportVariant(quote);

  const extraIssues = [];
  if (selection === 'signed') {
    extraIssues.push({
      level: 'warning',
      code: 'variant-signed',
      message: `Variante retenue à la signature exportée${variantName ? ` : « ${variantName} »` : ''}.`,
    });
  } else if (selection === 'active') {
    extraIssues.push({
      level: 'warning',
      code: 'variant-active',
      message: `Devis multi-variantes non signé : la variante active${variantName ? ` « ${variantName} »` : ''} est exportée.`,
    });
  }

  return buildSageExportModel(
    {
      quoteId: quote?.id || null,
      quoteNumber: quote?.quoteNumber || quote?.signatureWorkflow?.quoteNumber || '',
      referenceDevis: quote?.referenceDevis || quote?.payload?.reference || '',
      clientName: quote?.clientName || '',
      issueDate: quote?.quoteIssuedAt || quote?.createdAt || quote?.updatedAt || exportDate,
      cartItems: variant?.cartItems || [],
      tvaRate: variant?.tvaRate,
      commissionPercent: variant?.quoteSettings?.commissionPercent || 0,
      settings,
      exportDate,
      extraIssues,
    },
    SAGE_EXPORT_DEPS
  );
};
