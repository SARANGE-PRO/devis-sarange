/**
 * vat-lookup.js  (SERVEUR uniquement)
 * ─────────────────────────────────────────────────────────────────────────────
 * Consultation des sources OFFICIELLES du n° de TVA intracommunautaire.
 * Exécuté côté serveur : les sources n'exposent pas d'en-têtes CORS
 * exploitables depuis le navigateur, le jeton API Entreprise ne doit jamais
 * atteindre le client, et le proxy permet un délai d'attente maîtrisé.
 *
 * Chaîne de consultation (par SIREN) :
 *  1. API Entreprise — DGFiP, endpoint « numero_tva ». Utilisée UNIQUEMENT si
 *     les identifiants habilités sont réellement configurés ;
 *  2. extraction DGFiP locale indexée par SIREN (lib/dgfip-vat-index.js), si
 *     configurée et si son producteur déclaré est bien la DGFiP ;
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
import { lookupVatNumberInDgfipIndex } from './dgfip-vat-index.js';
import {
  AUTOMATIC_VAT_SOURCES,
  VAT_LOOKUP_OUTCOMES,
  VAT_PROVIDER_NOT_CONFIGURED,
} from './vat-verification.mjs';

const REQUEST_TIMEOUT_MS = 6000;
const FR_VAT_PATTERN = /^FR\d{11}$/;

/* ─── API Entreprise (DGFiP) ─────────────────────────────────────────────── */
// Endpoint officiel : GET /v3/dgfip/unites_legales/{siren}/numero_tva
// Jeton Bearer + paramètres d'usage obligatoires (context, object, recipient).
const API_ENTREPRISE_BASE_URL = (
  process.env.API_ENTREPRISE_BASE_URL || 'https://entreprise.api.gouv.fr/v3'
).replace(/\/$/, '');

const getApiEntrepriseConfig = () => ({
  token: process.env.API_ENTREPRISE_TOKEN || '',
  context: process.env.API_ENTREPRISE_CONTEXT || '',
  object: process.env.API_ENTREPRISE_OBJECT || '',
  recipient: process.env.API_ENTREPRISE_RECIPIENT || '',
});

export const isApiEntrepriseConfigured = () => {
  const { token, context, object, recipient } = getApiEntrepriseConfig();
  return Boolean(token && context && object && recipient);
};

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

// Le nom du champ portant le numéro peut évoluer : on retient la valeur ayant
// la forme d'un n° de TVA français, ce qui reste juste quel que soit le libellé.
const extractFrenchVatNumber = (payload) => {
  if (!payload || typeof payload !== 'object') return '';

  for (const value of Object.values(payload)) {
    if (typeof value === 'string') {
      const candidate = normalizeVatNumber(value);
      if (FR_VAT_PATTERN.test(candidate)) return candidate;
    } else if (value && typeof value === 'object') {
      const nested = extractFrenchVatNumber(value);
      if (nested) return nested;
    }
  }

  return '';
};

/**
 * API Entreprise (DGFiP) : n° de TVA d'une unité légale.
 * @returns {{outcome: string, vatNumber?: string}}
 */
export const lookupVatNumberFromApiEntreprise = async (siren) => {
  if (!isApiEntrepriseConfigured()) {
    return { outcome: VAT_PROVIDER_NOT_CONFIGURED };
  }

  const normalizedSiren = normalizeSiren(siren);
  if (normalizedSiren.length !== 9) {
    return { outcome: VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP };
  }

  const { token, context, object, recipient } = getApiEntrepriseConfig();

  try {
    const params = new URLSearchParams({ context, object, recipient });
    const { status, body } = await fetchJson(
      `${API_ENTREPRISE_BASE_URL}/dgfip/unites_legales/${normalizedSiren}/numero_tva?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (status === 200) {
      const vatNumber = extractFrenchVatNumber(body?.data ?? body);
      return vatNumber
        ? { outcome: VAT_LOOKUP_OUTCOMES.VERIFIED, vatNumber }
        : { outcome: VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP };
    }

    // 404 : la DGFiP ne connaît aucun numéro pour ce SIREN.
    if (status === 404) {
      return { outcome: VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP };
    }

    // 401/403 (habilitation), 429 (quota), 5xx (panne) : rien n'est conclu.
    return { outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE };
  } catch {
    return { outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE };
  }
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

// DGFiP : API Entreprise si habilitée, sinon extraction locale indexée.
const lookupVatNumberFromDgfip = async (siren) => {
  const apiResult = await lookupVatNumberFromApiEntreprise(siren);
  if (apiResult.outcome !== VAT_PROVIDER_NOT_CONFIGURED) {
    return { ...apiResult, provider: AUTOMATIC_VAT_SOURCES.API_ENTREPRISE };
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
