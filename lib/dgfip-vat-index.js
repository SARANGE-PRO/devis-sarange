/**
 * dgfip-vat-index.js  (SERVEUR uniquement)
 * ─────────────────────────────────────────────────────────────────────────────
 * Copie LOCALE indexée par SIREN du jeu de données officiel de la DGFiP
 * « Numéros de TVA intracommunautaire français » (publié sur data.gouv.fr).
 *
 * Le fichier complet n'est jamais téléchargé à chaque vérification : on lit un
 * index préparé hors ligne et actualisé périodiquement. Deux garde-fous :
 *
 *  - l'index n'est utilisé que si son chemin est explicitement configuré
 *    (TVA_DGFIP_INDEX_PATH) — aucune URL supposée n'est codée en dur ;
 *  - ses métadonnées doivent déclarer la DGFiP comme PRODUCTEUR du jeu de
 *    données, sinon l'index est refusé.
 *
 * Format attendu (JSON) :
 * {
 *   "producer": "DGFiP",
 *   "datasetTitle": "Numéros de TVA intracommunautaire français",
 *   "datasetUrl": "https://www.data.gouv.fr/fr/datasets/...",
 *   "refreshedAt": "2026-07-30",
 *   "entries": { "820001014": "FR22820001014" }
 * }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { normalizeSiren, normalizeVatNumber } from './client-type.mjs';
import { getDgfipIndexStaleAlert } from './dgfip-vat-index-builder.mjs';
import { VAT_LOOKUP_OUTCOMES, VAT_PROVIDER_NOT_CONFIGURED } from './vat-verification.mjs';

// Chemin TOUJOURS absolu : un chemin relatif est résolu depuis la racine du
// projet (Next.js exécute le serveur depuis celle-ci), jamais depuis le
// répertoire courant du processus appelant.
const CONFIGURED_INDEX_PATH =
  process.env.TVA_DGFIP_INDEX_PATH || 'data/dgfip-vat-index.json';
const INDEX_PATH = isAbsolute(CONFIGURED_INDEX_PATH)
  ? CONFIGURED_INDEX_PATH
  : resolve(process.cwd(), CONFIGURED_INDEX_PATH);
// Producteur attendu du jeu de données (vérification explicite).
const DGFIP_PRODUCER_PATTERN = /dgfip|direction g[ée]n[ée]rale des finances publiques/i;
const CACHE_TTL_MS = 60 * 60 * 1000;

let indexCache = null;

export const isDgfipIndexConfigured = () => Boolean(INDEX_PATH);

const loadDgfipIndex = async () => {
  if (indexCache && Date.now() - indexCache.loadedAt < CACHE_TTL_MS) {
    return indexCache.value;
  }

  const parsed = JSON.parse(await readFile(INDEX_PATH, 'utf8'));

  if (!DGFIP_PRODUCER_PATTERN.test(String(parsed?.producer || ''))) {
    throw new Error(
      "Index de TVA refusé : le producteur déclaré n'est pas la DGFiP."
    );
  }

  if (!parsed?.entries || typeof parsed.entries !== 'object') {
    throw new Error("Index de TVA refusé : aucune correspondance SIREN exploitable.");
  }

  const value = {
    entries: parsed.entries,
    metadata: {
      producer: String(parsed.producer),
      publisherOrganization: String(parsed.publisherOrganization || ''),
      datasetTitle: String(parsed.datasetTitle || ''),
      datasetUrl: String(parsed.datasetUrl || ''),
      // Date de PUBLICATION de l'extraction (≠ date de téléchargement) :
      // c'est elle qui documente une vérification VERIFIED_DGFIP.
      publishedAt: String(parsed.publishedAt || ''),
      downloadedAt: String(parsed.downloadedAt || ''),
      refreshedAt: String(parsed.refreshedAt || ''),
      fingerprint: String(parsed.fingerprint || ''),
      entryCount: Number(parsed.entryCount || 0),
    },
  };

  indexCache = { loadedAt: Date.now(), value };
  return value;
};

export const getDgfipIndexMetadata = async () => {
  if (!INDEX_PATH) return null;

  try {
    return (await loadDgfipIndex()).metadata;
  } catch {
    return null;
  }
};

/**
 * État de l'index pour l'administrateur : métadonnées + alerte d'obsolescence
 * au-delà de sept jours sans actualisation.
 */
export const getDgfipIndexStatus = async () => {
  const metadata = await getDgfipIndexMetadata();

  return {
    configured: Boolean(INDEX_PATH),
    metadata,
    staleAlert: metadata ? getDgfipIndexStaleAlert(metadata) : '',
  };
};

/**
 * Recherche du n° de TVA d'un SIREN dans l'extraction DGFiP locale.
 * @returns {{outcome: string, vatNumber?: string}}
 */
export const lookupVatNumberInDgfipIndex = async (siren) => {
  if (!INDEX_PATH) return { outcome: VAT_PROVIDER_NOT_CONFIGURED };

  const normalizedSiren = normalizeSiren(siren);
  if (normalizedSiren.length !== 9) {
    return { outcome: VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP };
  }

  try {
    const { entries, metadata } = await loadDgfipIndex();
    const found = normalizeVatNumber(entries[normalizedSiren]);

    return found
      ? {
          outcome: VAT_LOOKUP_OUTCOMES.VERIFIED,
          vatNumber: found,
          // La vérification est documentée par la date de publication de
          // l'extraction utilisée.
          publishedAt: metadata.publishedAt || metadata.refreshedAt,
        }
      : { outcome: VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP };
  } catch (error) {
    // Index simplement pas encore construit : silencieux (le repli VIES joue).
    if (error?.code !== 'ENOENT') {
      console.error('[dgfip-vat-index] Index inutilisable:', error?.message);
    }
    return { outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE };
  }
};
