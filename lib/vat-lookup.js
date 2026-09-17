/**
 * vat-lookup.js  (SERVEUR uniquement)
 * ─────────────────────────────────────────────────────────────────────────────
 * Consultation des sources OFFICIELLES du n° de TVA intracommunautaire.
 * Exécuté côté serveur : les sources n'exposent pas d'en-têtes CORS
 * exploitables depuis le navigateur, et le proxy permet un délai d'attente
 * maîtrisé.
 *
 * Chaîne de consultation (par SIREN) :
 *  1. index DGFiP publié sur les GitHub Releases du dépôt
 *     (lib/dgfip-vat-remote.js) : seul le fichier concerné est téléchargé,
 *     jamais l'extraction complète ;
 *  2. extraction DGFiP locale indexée par SIREN (lib/dgfip-vat-index.js),
 *     développement et tests, ou secours si l'index publié est injoignable ;
 *  3. VIES (Commission européenne) : validation du numéro candidat, retentée
 *     en cas de saturation du serveur national (fréquente côté français).
 *
 * Si rien ne conclut, le résultat est UNAVAILABLE et l'appelant se contente
 * d'un préremplissage marqué CALCULATED_UNVERIFIED (cf. lib/vat-verification.mjs).
 * Chaque résultat détaille l'état de chaque source (`sources`) : c'est ce qui
 * permet de diagnostiquer une panne sans deviner.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { computeFrenchVatNumber, normalizeVatNumber } from './client-type.mjs';
import { lookupVatNumberInDgfipIndex } from './dgfip-vat-index.js';
import { lookupVatNumberInDgfipRemote } from './dgfip-vat-remote.js';
import {
  AUTOMATIC_VAT_SOURCES,
  VAT_LOOKUP_OUTCOMES,
  VAT_PROVIDER_NOT_CONFIGURED,
  VAT_SOURCE_STATES,
} from './vat-verification.mjs';
import { VIES_RESULTS, classifyViesResponse } from './vies-response.mjs';

// Racine de l'API REST de VIES. L'ancienne forme « …/rest-api/ms » reste
// acceptée.
const VIES_API_ROOT = (
  process.env.TVA_VIES_API_URL || 'https://ec.europa.eu/taxation_customs/vies/rest-api'
)
  .replace(/\/ms\/?$/, '')
  .replace(/\/$/, '');

const VIES_REQUEST_TIMEOUT_MS = 4000;
// Trois tentatives au total : la saturation du serveur français se dissipe
// souvent en une ou deux secondes.
const VIES_RETRY_DELAYS_MS = [800, 1600];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requestVies = async (countryCode, number) => {
  try {
    const response = await fetch(`${VIES_API_ROOT}/ms/${countryCode}/vat/${number}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(VIES_REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });

    return { status: response.status, body: await response.json().catch(() => null) };
  } catch {
    return { status: 0, body: null };
  }
};

/**
 * VIES : validation d'un numéro (français ou étranger).
 * @returns {{outcome: string, vatNumber?: string, result: string}}
 */
export const validateVatNumberWithVies = async (vatNumber) => {
  const normalized = normalizeVatNumber(vatNumber);
  const countryCode = normalized.slice(0, 2);
  const number = normalized.slice(2);

  if (!/^[A-Z]{2}$/.test(countryCode) || number.length < 2) {
    return { outcome: VAT_LOOKUP_OUTCOMES.INVALID_VIES, result: VIES_RESULTS.INVALID };
  }

  let result = VIES_RESULTS.TRANSIENT;

  for (let attempt = 0; attempt <= VIES_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt) await sleep(VIES_RETRY_DELAYS_MS[attempt - 1]);

    const { status, body } = await requestVies(countryCode, number);
    result = classifyViesResponse(status, body);

    if (result === VIES_RESULTS.VALID) {
      return { outcome: VAT_LOOKUP_OUTCOMES.VERIFIED, vatNumber: normalized, result };
    }

    // VIES ne référence que les numéros valides pour les opérations
    // intracommunautaires : une réponse négative ne prouve pas l'absence de
    // numéro national. Elle est consignée telle quelle, sans rien effacer.
    if (result === VIES_RESULTS.INVALID) {
      return { outcome: VAT_LOOKUP_OUTCOMES.INVALID_VIES, result };
    }
  }

  return { outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE, result };
};

// DGFiP : index publié (production), sinon extraction locale indexée
// (développement, tests, ou secours si l'index publié est injoignable).
const lookupVatNumberFromDgfip = async (siren) => {
  const remote = await lookupVatNumberInDgfipRemote(siren);
  if (
    remote.outcome === VAT_LOOKUP_OUTCOMES.VERIFIED ||
    remote.outcome === VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP
  ) {
    return { ...remote, provider: AUTOMATIC_VAT_SOURCES.INDEX_DGFIP };
  }

  const local = await lookupVatNumberInDgfipIndex(siren);
  if (
    local.outcome === VAT_LOOKUP_OUTCOMES.VERIFIED ||
    local.outcome === VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP
  ) {
    return { ...local, provider: AUTOMATIC_VAT_SOURCES.INDEX_DGFIP };
  }

  const nothingConfigured =
    remote.outcome === VAT_PROVIDER_NOT_CONFIGURED && local.outcome === VAT_PROVIDER_NOT_CONFIGURED;

  return {
    outcome: nothingConfigured ? VAT_PROVIDER_NOT_CONFIGURED : VAT_LOOKUP_OUTCOMES.UNAVAILABLE,
    provider: AUTOMATIC_VAT_SOURCES.INDEX_DGFIP,
  };
};

const toDgfipSourceState = (outcome) => {
  switch (outcome) {
    case VAT_LOOKUP_OUTCOMES.VERIFIED:
      return VAT_SOURCE_STATES.VERIFIED;
    case VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP:
      return VAT_SOURCE_STATES.NOT_FOUND;
    case VAT_PROVIDER_NOT_CONFIGURED:
      return VAT_SOURCE_STATES.NOT_CONFIGURED;
    default:
      return VAT_SOURCE_STATES.UNAVAILABLE;
  }
};

const toViesSourceState = (outcome) => {
  switch (outcome) {
    case VAT_LOOKUP_OUTCOMES.VERIFIED:
      return VAT_SOURCE_STATES.VERIFIED;
    case VAT_LOOKUP_OUTCOMES.INVALID_VIES:
      return VAT_SOURCE_STATES.INVALID;
    default:
      return VAT_SOURCE_STATES.UNAVAILABLE;
  }
};

/**
 * Consultation complète.
 *
 * @returns {{outcome: string, vatNumber: string, source: string|null,
 *            provider?: string, publishedAt?: string,
 *            sources: {dgfip: string, vies: string}}}
 */
export const lookupOfficialVatNumber = async ({ siren, vatNumber } = {}) => {
  const declaredNumber = normalizeVatNumber(vatNumber);

  // Numéro communiqué par le client (y compris étranger) : seule VIES peut le
  // valider — la correspondance DGFiP par SIREN ne s'y applique pas. S'il n'est
  // pas confirmé, il est CONSERVÉ en « non vérifié » (jamais effacé).
  if (declaredNumber) {
    const viesResult = await validateVatNumberWithVies(declaredNumber);
    const sources = { dgfip: VAT_SOURCE_STATES.SKIPPED, vies: toViesSourceState(viesResult.outcome) };

    return viesResult.outcome === VAT_LOOKUP_OUTCOMES.VERIFIED
      ? { outcome: viesResult.outcome, vatNumber: viesResult.vatNumber, source: 'vies', sources }
      : { outcome: viesResult.outcome, vatNumber: '', source: null, sources };
  }

  const dgfipResult = await lookupVatNumberFromDgfip(siren);
  const sources = { dgfip: toDgfipSourceState(dgfipResult.outcome), vies: VAT_SOURCE_STATES.SKIPPED };

  if (dgfipResult.outcome === VAT_LOOKUP_OUTCOMES.VERIFIED) {
    return {
      outcome: dgfipResult.outcome,
      vatNumber: dgfipResult.vatNumber,
      source: 'dgfip',
      provider: dgfipResult.provider || '',
      // Date de publication de l'extraction DGFiP utilisée (le cas échéant).
      publishedAt: dgfipResult.publishedAt || '',
      sources,
    };
  }

  // Index injoignable, ou SIREN absent de l'extraction : on tente de faire
  // valider le numéro candidat par VIES (une validation positive vaut
  // vérification).
  const candidate = computeFrenchVatNumber(siren);
  if (candidate) {
    const viesResult = await validateVatNumberWithVies(candidate);
    sources.vies = toViesSourceState(viesResult.outcome);

    if (viesResult.outcome === VAT_LOOKUP_OUTCOMES.VERIFIED) {
      return {
        outcome: viesResult.outcome,
        vatNumber: viesResult.vatNumber,
        source: 'vies',
        sources,
      };
    }
  }

  // Absence constatée dans l'extraction DGFiP : le statut la consigne sans
  // affirmer que l'entreprise n'a aucun numéro de TVA.
  if (dgfipResult.outcome === VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP) {
    return { outcome: VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP, vatNumber: '', source: null, sources };
  }

  return { outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE, vatNumber: '', source: null, sources };
};
