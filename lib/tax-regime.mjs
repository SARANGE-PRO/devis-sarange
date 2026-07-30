/**
 * tax-regime.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Régime de TVA du devis. Deux régimes seulement :
 *
 *  - STANDARD             : TVA facturée (20 / 10 / 5,5 %) ;
 *  - AUTOLIQUIDATION_BTP  : sous-traitance de travaux immobiliers, TVA due par
 *                           le preneur (art. 283, 2 nonies du CGI).
 *
 * Le régime est DÉDUIT des données existantes — aucun champ supplémentaire
 * n'est demandé à l'utilisateur. Le taux 0 % du sélecteur reste le raccourci
 * d'interface de la sous-traitance, mais les documents emploient le terme
 * juridique « Autoliquidation ».
 *
 * Module pur (imports relatifs) : testable par le runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getClientTaxIdentity, isProfessionalClient } from './client-type.mjs';
import { CONTRACT_TYPES, detectContractType } from './line-nature.mjs';
import {
  CALCULATED_UNVERIFIED_ALERT,
  NOT_FOUND_DGFIP_ALERT,
  TVA_VERIFICATION_STATUSES,
  resolveClientVatState,
} from './vat-verification.mjs';

export const TAX_REGIMES = Object.freeze({
  STANDARD: 'STANDARD',
  AUTOLIQUIDATION_BTP: 'AUTOLIQUIDATION_BTP',
});

export const normalizeTaxRegime = (value) =>
  value === TAX_REGIMES.AUTOLIQUIDATION_BTP
    ? TAX_REGIMES.AUTOLIQUIDATION_BTP
    : TAX_REGIMES.STANDARD;

export const isAutoliquidation = (value) =>
  normalizeTaxRegime(value) === TAX_REGIMES.AUTOLIQUIDATION_BTP;

// Mention légale obligatoire sur le devis et la facture.
export const AUTOLIQUIDATION_MENTION =
  'Autoliquidation – TVA due par le preneur conformément à l’article 283, 2 nonies du Code général des impôts.';

// Valeur de la ligne « TVA » dans la synthèse : ni montant, ni « 0 % ».
export const AUTOLIQUIDATION_VAT_VALUE = 'Autoliquidation';

// Libellé du total : le net à payer est égal au total HT.
export const AUTOLIQUIDATION_TOTAL_LABEL = 'NET À PAYER';

export const AUTOLIQUIDATION_SCOPE_ERROR =
  "L’autoliquidation BTP est réservée aux travaux immobiliers réalisés en sous-traitance pour un client professionnel. Une fourniture seule ne peut pas utiliser ce régime.";

export const AUTOLIQUIDATION_IDENTITY_ERROR =
  "Les informations fiscales du donneur d’ordre sont incomplètes. Vérifiez ou renseignez son SIRET et son numéro de TVA intracommunautaire.";

// Exigence propre à la FACTURE en autoliquidation : un numéro seulement
// reconstitué depuis le SIREN ne suffit pas.
export const AUTOLIQUIDATION_VAT_VERIFICATION_ERROR =
  "Le numéro de TVA intracommunautaire du donneur d’ordre doit être vérifié auprès d’une source officielle (DGFiP ou VIES) ou confirmé manuellement avant d’établir une facture en autoliquidation.";

// Raccourci d'interface : le taux 0 % du sélecteur de TVA.
export const isZeroVatSelected = (tvaRate) => Number(tvaRate) === 0;

/**
 * Régime du devis (par variante) : autoliquidation BTP dès que les trois
 * conditions sont réunies — client professionnel, taux 0 % sélectionné et au
 * moins une ligne posée. Sinon régime standard.
 */
export const resolveTaxRegime = ({
  clientType,
  tvaRate,
  cartItems = [],
  contractType,
} = {}) => {
  const effectiveContractType = contractType || detectContractType(cartItems);
  const withPose = effectiveContractType === CONTRACT_TYPES.AVEC_POSE;

  return isZeroVatSelected(tvaRate) && isProfessionalClient(clientType) && withPose
    ? TAX_REGIMES.AUTOLIQUIDATION_BTP
    : TAX_REGIMES.STANDARD;
};

/**
 * Contrôles liés au régime fiscal.
 *
 * Bloquants (finalisation, envoi, signature — jamais l'enregistrement d'un
 * brouillon) :
 *  - un taux 0 % hors périmètre de la sous-traitance BTP est refusé ;
 *  - un devis en autoliquidation exige le SIRET et un n° de TVA du donneur
 *    d'ordre (à défaut de saisie, le n° est reconstitué depuis le SIREN) ;
 *  - avec `requireVerifiedVatNumber` (FACTURE en autoliquidation), le n° doit
 *    en outre être vérifié DGFiP/VIES ou confirmé manuellement.
 *
 * Avertissement non bloquant : numéro seulement reconstitué depuis le SIREN.
 */
export const getTaxRegimeValidation = ({
  clientType,
  tvaRate,
  cartItems = [],
  contractType,
  clientData,
  requireVerifiedVatNumber = false,
} = {}) => {
  const taxRegime = resolveTaxRegime({ clientType, tvaRate, cartItems, contractType });
  const errors = [];
  const warnings = [];
  let vatState = null;

  if (isZeroVatSelected(tvaRate) && taxRegime !== TAX_REGIMES.AUTOLIQUIDATION_BTP) {
    errors.push(AUTOLIQUIDATION_SCOPE_ERROR);
  }

  if (taxRegime === TAX_REGIMES.AUTOLIQUIDATION_BTP) {
    const identity = getClientTaxIdentity(clientData);
    vatState = resolveClientVatState(clientData);

    if (!identity.siret || !vatState.vatNumber) {
      errors.push(AUTOLIQUIDATION_IDENTITY_ERROR);

      // La DGFiP a explicitement répondu « aucun numéro français dans
      // l'extraction consultée » : on le précise, sans en conclure que
      // l'entreprise n'a aucun numéro de TVA.
      if (vatState.status === TVA_VERIFICATION_STATUSES.NOT_FOUND_DGFIP) {
        warnings.push(NOT_FOUND_DGFIP_ALERT);
      }
    } else if (!vatState.isVerified) {
      // Numéro présent mais non vérifié : alerte sur le devis, blocage sur la
      // facture. Jamais de requalification automatique en « vérifié ».
      if (requireVerifiedVatNumber) {
        errors.push(AUTOLIQUIDATION_VAT_VERIFICATION_ERROR);
      } else {
        warnings.push(CALCULATED_UNVERIFIED_ALERT);
      }
    }
  }

  return {
    taxRegime,
    vatState,
    isValid: errors.length === 0,
    errors,
    warnings,
  };
};
