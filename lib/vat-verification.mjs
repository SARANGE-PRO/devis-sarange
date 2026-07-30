/**
 * vat-verification.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Statut de vérification du n° de TVA intracommunautaire du client.
 *
 * Règle cardinale : un numéro RECONSTITUÉ depuis le SIREN (algorithme de clé)
 * n'est JAMAIS un numéro vérifié. La formule ne sert qu'à préremplir un numéro
 * PROBABLE, avec le statut CALCULATED_UNVERIFIED. Seule une source officielle
 * (DGFiP, VIES) ou une confirmation manuelle explicite — utilisateur et date
 * enregistrés — vaut vérification. Aucun passage automatique en « vérifié ».
 *
 * Module pur (imports relatifs) : testable par le runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { computeFrenchVatNumber, getClientTaxIdentity, normalizeVatNumber } from './client-type.mjs';

export const TVA_VERIFICATION_STATUSES = Object.freeze({
  VERIFIED_DGFIP: 'VERIFIED_DGFIP',
  VERIFIED_VIES: 'VERIFIED_VIES',
  MANUALLY_CONFIRMED: 'MANUALLY_CONFIRMED',
  CALCULATED_UNVERIFIED: 'CALCULATED_UNVERIFIED',
  // « Aucun numéro français trouvé dans l'extraction DGFiP consultée. » Ce
  // statut ne signifie PAS que l'entreprise n'a aucun numéro de TVA : elle peut
  // disposer d'un numéro étranger, ou d'un numéro français récent absent de
  // l'extraction J+1. Il bloque la facture jusqu'à une validation VIES positive
  // ou une confirmation manuelle documentée.
  NOT_FOUND_DGFIP: 'NOT_FOUND_DGFIP',
  // Aucun numéro renseigné ET aucune recherche concluante effectuée.
  MISSING: 'MISSING',
});

// Statuts acceptables pour une facture en autoliquidation.
const VERIFIED_STATUSES = Object.freeze([
  TVA_VERIFICATION_STATUSES.VERIFIED_DGFIP,
  TVA_VERIFICATION_STATUSES.VERIFIED_VIES,
  TVA_VERIFICATION_STATUSES.MANUALLY_CONFIRMED,
]);

const ALL_STATUSES = Object.values(TVA_VERIFICATION_STATUSES);

export const CALCULATED_UNVERIFIED_ALERT =
  'Le numéro de TVA a été prérempli depuis le SIREN mais n’a pas encore été vérifié auprès d’une source officielle.';

export const NOT_FOUND_DGFIP_ALERT =
  'Aucun numéro français n’a été trouvé dans l’extraction DGFiP consultée. L’entreprise peut disposer d’un numéro étranger, ou d’un numéro français récent absent de l’extraction : faites-le valider par VIES ou confirmez le numéro communiqué par le client.';

/* ─── Origine de la vérification ─────────────────────────────────────────── */

// Sources proposées lors d'une CONFIRMATION MANUELLE (choix obligatoire).
export const MANUAL_VAT_SOURCES = Object.freeze([
  { id: 'DOCUMENT_CLIENT', label: 'Document du client' },
  { id: 'FACTURE_ANTERIEURE', label: 'Facture antérieure' },
  { id: 'ATTESTATION_FISCALE', label: 'Attestation fiscale' },
  { id: 'ANNUAIRE_ENTREPRISES', label: 'Consultation de l’Annuaire des Entreprises' },
  { id: 'AUTRE', label: 'Autre source' },
]);

const MANUAL_VAT_SOURCE_IDS = MANUAL_VAT_SOURCES.map((source) => source.id);

// Sources renseignées automatiquement par les consultations officielles.
export const AUTOMATIC_VAT_SOURCES = Object.freeze({
  INDEX_DGFIP: 'EXTRACTION_DGFIP',
  VIES: 'VIES',
});

export const isManualVatSource = (value) => MANUAL_VAT_SOURCE_IDS.includes(value);

export const getVatSourceLabel = (value) =>
  MANUAL_VAT_SOURCES.find((source) => source.id === value)?.label || value || '';

export const MANUAL_CONFIRMATION_WARNING =
  'Confirmez uniquement un numéro obtenu auprès du client ou d’une source fiable. Cette confirmation permettra la génération de factures soumises à autoliquidation.';

export const TVA_VERIFICATION_LABELS = Object.freeze({
  VERIFIED_DGFIP: 'Vérifié (DGFiP)',
  VERIFIED_VIES: 'Vérifié (VIES)',
  MANUALLY_CONFIRMED: 'Confirmé manuellement',
  CALCULATED_UNVERIFIED: 'Non vérifié',
  NOT_FOUND_DGFIP: 'Introuvable dans l’extraction DGFiP',
  MISSING: 'Absent',
});

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

export const normalizeTvaVerificationStatus = (value) =>
  ALL_STATUSES.includes(value) ? value : TVA_VERIFICATION_STATUSES.MISSING;

export const isTvaVerified = (status) =>
  VERIFIED_STATUSES.includes(normalizeTvaVerificationStatus(status));

export const getTvaVerificationLabel = (status) =>
  TVA_VERIFICATION_LABELS[normalizeTvaVerificationStatus(status)];

/**
 * État de vérification EFFECTIF du numéro enregistré sur la fiche client.
 *
 *  - aucun numéro (ni saisi, ni reconstituable) → MISSING ;
 *  - numéro seulement reconstitué depuis le SIREN → CALCULATED_UNVERIFIED ;
 *  - un statut vérifié n'est retenu que s'il porte EXACTEMENT le numéro
 *    enregistré : modifier le numéro après vérification fait retomber le
 *    statut à CALCULATED_UNVERIFIED (impossible de « vérifier puis remplacer »).
 */
export const resolveClientVatState = (clientData = {}) => {
  const identity = getClientTaxIdentity(clientData);
  const missingState = {
    vatNumber: '',
    status: TVA_VERIFICATION_STATUSES.MISSING,
    isVerified: false,
    isDerived: false,
    verifiedAt: '',
    verifiedBy: '',
  };

  if (!identity.vatNumber) return missingState;

  // Numéro absent de la fiche : seule la formule l'a produit.
  if (identity.isVatNumberDerived) {
    // Une recherche DGFiP a déjà conclu à l'absence de numéro français dans
    // l'extraction : la formule ne doit PAS ressusciter un numéro. Le statut
    // est conservé tel quel (il n'affirme pas l'absence définitive de numéro).
    if (clientData?.tvaVerificationStatus === TVA_VERIFICATION_STATUSES.NOT_FOUND_DGFIP) {
      return { ...missingState, status: TVA_VERIFICATION_STATUSES.NOT_FOUND_DGFIP };
    }

    return {
      vatNumber: identity.vatNumber,
      status: TVA_VERIFICATION_STATUSES.CALCULATED_UNVERIFIED,
      isVerified: false,
      isDerived: true,
      verifiedAt: '',
      verifiedBy: '',
    };
  }

  const storedStatus = normalizeTvaVerificationStatus(clientData?.tvaVerificationStatus);
  const verifiedNumber = normalizeVatNumber(clientData?.tvaVerifiedNumber);
  const appliesToCurrentNumber = Boolean(verifiedNumber) && verifiedNumber === identity.vatNumber;
  const status =
    isTvaVerified(storedStatus) && appliesToCurrentNumber
      ? storedStatus
      : TVA_VERIFICATION_STATUSES.CALCULATED_UNVERIFIED;

  return {
    vatNumber: identity.vatNumber,
    status,
    isVerified: isTvaVerified(status),
    isDerived: false,
    verifiedAt: appliesToCurrentNumber ? normalizeText(clientData?.tvaVerifiedAt) : '',
    verifiedBy: appliesToCurrentNumber ? normalizeText(clientData?.tvaVerifiedBy) : '',
    source: appliesToCurrentNumber ? normalizeText(clientData?.tvaVerificationSource) : '',
    comment: appliesToCurrentNumber ? normalizeText(clientData?.tvaVerificationComment) : '',
    attachment: appliesToCurrentNumber ? normalizeText(clientData?.tvaVerificationAttachment) : '',
    sourceDate: appliesToCurrentNumber ? normalizeText(clientData?.tvaVerificationSourceDate) : '',
  };
};

/* ─── Résultats de consultation des sources officielles ──────────────────── */

export const VAT_LOOKUP_OUTCOMES = Object.freeze({
  // Numéro confirmé par une source officielle.
  VERIFIED: 'verified',
  // La DGFiP répond, mais l'extraction consultée ne contient aucun numéro
  // français pour ce SIREN (≠ « l'entreprise n'a aucun numéro de TVA »).
  NOT_FOUND_DGFIP: 'not-found-dgfip',
  // Source injoignable ou non concluante : on ne conclut rien.
  UNAVAILABLE: 'unavailable',
});

// Résultat d'un fournisseur non configuré : la chaîne passe au suivant sans
// rien conclure (ce n'est pas une issue de consultation).
export const VAT_PROVIDER_NOT_CONFIGURED = 'not-configured';

const SOURCE_STATUSES = Object.freeze({
  dgfip: TVA_VERIFICATION_STATUSES.VERIFIED_DGFIP,
  vies: TVA_VERIFICATION_STATUSES.VERIFIED_VIES,
});

/**
 * Traduit le résultat d'une consultation officielle en champs à enregistrer
 * sur la fiche client.
 *
 *  - VERIFIED    → numéro de la source + statut vérifié correspondant ;
 *  - NOT_FOUND   → aucun numéro retenu : le numéro calculé n'est PAS valide ;
 *  - UNAVAILABLE → préremplissage par la formule, statut CALCULATED_UNVERIFIED.
 */
export const buildVatPatchFromLookup = ({
  outcome,
  vatNumber,
  source,
  provider,
  publishedAt,
  siren,
  checkedAt,
  declaredNumber,
} = {}) => {
  const emptyVerification = {
    tvaVerifiedNumber: '',
    tvaVerifiedAt: '',
    tvaVerifiedBy: '',
    tvaVerificationSource: '',
    tvaVerificationComment: '',
    tvaVerificationAttachment: '',
    tvaVerificationSourceDate: '',
  };

  if (outcome === VAT_LOOKUP_OUTCOMES.VERIFIED) {
    const confirmedNumber = normalizeVatNumber(vatNumber);
    const status = SOURCE_STATUSES[source];

    if (confirmedNumber && status) {
      return {
        tvaIntra: confirmedNumber,
        tvaVerificationStatus: status,
        tvaVerifiedNumber: confirmedNumber,
        tvaVerifiedAt: normalizeText(checkedAt),
        tvaVerifiedBy: '',
        tvaVerificationSource:
          normalizeText(provider) ||
          (source === 'vies' ? AUTOMATIC_VAT_SOURCES.VIES : AUTOMATIC_VAT_SOURCES.INDEX_DGFIP),
        tvaVerificationComment: '',
        tvaVerificationAttachment: '',
        // Date de publication de l'extraction officielle utilisée.
        tvaVerificationSourceDate: normalizeText(publishedAt),
      };
    }
  }

  // Absence dans l'extraction DGFiP : le numéro calculé n'est PAS retenu, et le
  // statut consigne précisément ce qui a été constaté.
  if (outcome === VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP) {
    return {
      tvaIntra: '',
      tvaVerificationStatus: TVA_VERIFICATION_STATUSES.NOT_FOUND_DGFIP,
      ...emptyVerification,
    };
  }

  // Source injoignable ou non concluante : on conserve le numéro communiqué par
  // le client (jamais remplacé par celui de la formule) ; à défaut, la formule
  // prérremplit un numéro probable. Dans les deux cas : non vérifié.
  return {
    tvaIntra: normalizeVatNumber(declaredNumber) || computeFrenchVatNumber(siren),
    tvaVerificationStatus: TVA_VERIFICATION_STATUSES.CALCULATED_UNVERIFIED,
    ...emptyVerification,
  };
};

/**
 * Confirmation manuelle DOCUMENTÉE d'un numéro communiqué par le client (y
 * compris un numéro étranger). La source et une référence sont OBLIGATOIRES :
 * sans elles, aucune confirmation n'est produite — la confirmation ouvrant la
 * facturation en autoliquidation, elle doit rester traçable.
 */
export const buildManualVatConfirmation = ({
  vatNumber,
  confirmedBy,
  confirmedAt,
  source,
  comment,
  attachment,
} = {}) => {
  const confirmedNumber = normalizeVatNumber(vatNumber);
  const normalizedComment = normalizeText(comment);

  if (!confirmedNumber || !isManualVatSource(source) || !normalizedComment) {
    return null;
  }

  return {
    tvaIntra: confirmedNumber,
    tvaVerificationStatus: TVA_VERIFICATION_STATUSES.MANUALLY_CONFIRMED,
    tvaVerifiedNumber: confirmedNumber,
    tvaVerifiedAt: normalizeText(confirmedAt),
    tvaVerifiedBy: normalizeText(confirmedBy),
    tvaVerificationSource: source,
    tvaVerificationComment: normalizedComment,
    tvaVerificationAttachment: normalizeText(attachment),
    tvaVerificationSourceDate: '',
  };
};
