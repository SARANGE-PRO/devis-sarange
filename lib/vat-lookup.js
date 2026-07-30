/**
 * vat-lookup.js  (SERVEUR uniquement)
 * ─────────────────────────────────────────────────────────────────────────────
 * Consultation des sources OFFICIELLES du n° de TVA intracommunautaire.
 * Exécuté côté serveur : les sources n'exposent pas d'en-têtes CORS
 * exploitables depuis le navigateur, et le proxy permet un délai d'attente
 * maîtrisé.
 *
 * Chaîne de consultation (par SIREN) :
 *  1. index DGFiP publié sur Vercel Blob (lib/dgfip-vat-blob.js) : seul le
 *     fichier du préfixe concerné est téléchargé, jamais l'extraction
 *     complète ;
 *  2. extraction DGFiP locale indexée par SIREN (lib/dgfip-vat-index.js) —
 *     développement et tests uniquement ;
 *  3. VIES (Commission européenne) — validation du numéro candidat.
 *
 * Aucune URL n'est supposée : sans configuration, les étapes 1 et 2 sont
 * ignorées et le repli est VIES puis la confirmation manuelle. Si rien ne
 * conclut, le résultat est UNAVAILABLE et l'appelant se contente d'un
 * préremplissage marqué CALCULATED_UNVERIFIED (cf. lib/vat-verification.mjs).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  computeFrenchVatNumber,
  normalizeSiren,
  normalizeVatNumber,
} from './client-type.mjs';
import { lookupVatNumberInDgfipBlob } from './dgfip-vat-blob.js';
import { lookupVatNumberInDgfipIndex } from './dgfip-vat-index.js';
import {
  AUTOMATIC_VAT_SOURCES,
  VAT_LOOKUP_OUTCOMES,
  VAT_PROVIDER_NOT_CONFIGURED,
} from './vat-verification.mjs';

const REQUEST_TIMEOUT_MS = 6000;

const VIES_BASE_URL = (
  process.env.TVA_VIES_API_URL || 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms'
).replace(/\/$/, '');

const fetchJson = async (url, { headers = {} } = {}) => {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });

  return { status: response.status, body: await response.json().catch(() => null) };
};

/**
 * VIES : validation d'un numéro (français ou étranger).
 * @returns {{outcome: string, vatNumber?: string}}
 */
export const validateVatNumberWithVies = async (vatNumber) => {
  const normalized = normalizeVatNumber(vatNumber);
  const countryCode = normalized.slice(0, 2);
  const number = normalized.slice(2);

  if (!/^[A-Z]{2}$/.test(countryCode) || number.length < 2) {
    return { outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE };
  }

  try {
    const { status, body } = await fetchJson(`${VIES_BASE_URL}/${countryCode}/vat/${number}`);

    if (status === 200 && body?.isValid === true) {
      return { outcome: VAT_LOOKUP_OUTCOMES.VERIFIED, vatNumber: normalized };
    }

    // VIES ne référence que les numéros valides pour les opérations
    // intracommunautaires : une réponse négative ne prouve pas l'absence de
    // numéro national, elle ne conclut donc rien.
    return { outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE };
  } catch {
    return { outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE };
  }
};

// DGFiP : index publié sur Vercel Blob (production), sinon extraction locale
// indexée (développement et tests).
const lookupVatNumberFromDgfip = async (siren) => {
  const blobResult = await lookupVatNumberInDgfipBlob(siren);
  if (blobResult.outcome !== VAT_PROVIDER_NOT_CONFIGURED) {
    return { ...blobResult, provider: AUTOMATIC_VAT_SOURCES.INDEX_DGFIP };
  }

  const indexResult = await lookupVatNumberInDgfipIndex(siren);
  return { ...indexResult, provider: AUTOMATIC_VAT_SOURCES.INDEX_DGFIP };
};

/**
 * Consultation complète.
 *
 * @returns {{outcome: string, vatNumber: string, source: string|null}}
 */
export const lookupOfficialVatNumber = async ({ siren, vatNumber } = {}) => {
  const declaredNumber = normalizeVatNumber(vatNumber);

  // Numéro communiqué par le client (y compris étranger) : seule VIES peut le
  // valider — la correspondance DGFiP par SIREN ne s'y applique pas. S'il n'est
  // pas confirmé, il est CONSERVÉ en « non vérifié » (jamais effacé).
  if (declaredNumber) {
    const viesResult = await validateVatNumberWithVies(declaredNumber);

    return viesResult.outcome === VAT_LOOKUP_OUTCOMES.VERIFIED
      ? { outcome: viesResult.outcome, vatNumber: viesResult.vatNumber, source: 'vies' }
      : { outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE, vatNumber: '', source: null };
  }

  const dgfipResult = await lookupVatNumberFromDgfip(siren);
  if (dgfipResult.outcome === VAT_LOOKUP_OUTCOMES.VERIFIED) {
    return {
      outcome: dgfipResult.outcome,
      vatNumber: dgfipResult.vatNumber,
      source: 'dgfip',
      provider: dgfipResult.provider || '',
      // Date de publication de l'extraction DGFiP utilisée (le cas échéant).
      publishedAt: dgfipResult.publishedAt || '',
    };
  }

  // Ni API Entreprise ni extraction locale : on tente de faire valider le
  // numéro candidat par VIES (une validation positive vaut vérification).
  const candidate = computeFrenchVatNumber(siren);
  if (candidate) {
    const viesResult = await validateVatNumberWithVies(candidate);
    if (viesResult.outcome === VAT_LOOKUP_OUTCOMES.VERIFIED) {
      return { outcome: viesResult.outcome, vatNumber: viesResult.vatNumber, source: 'vies' };
    }
  }

  // Absence constatée dans l'extraction DGFiP : le statut la consigne sans
  // affirmer que l'entreprise n'a aucun numéro de TVA.
  if (dgfipResult.outcome === VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP) {
    return { outcome: VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP, vatNumber: '', source: null };
  }

  return { outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE, vatNumber: '', source: null };
};
