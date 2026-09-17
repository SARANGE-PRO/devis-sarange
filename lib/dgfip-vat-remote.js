/**
 * dgfip-vat-remote.js  (SERVEUR uniquement)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lecture de l'index DGFiP publié sur les GitHub Releases du dépôt, depuis les
 * fonctions Vercel.
 *
 * Une vérification lit le manifeste puis UN SEUL fichier (~300 Ko compressé) :
 * l'extraction complète n'est jamais téléchargée dans une fonction. Manifeste
 * et fichiers sont mis en cache en mémoire.
 *
 * L'index ne contient que des données publiques (jeu DGFiP). La lecture se
 * fait par URL publique, sans jeton : l'URL par défaut est celle des releases
 * du dépôt, surchargeable par DGFIP_INDEX_BASE_URL (« off » pour désactiver,
 * développement et tests).
 *
 * Résilience : chaque téléchargement est retenté une fois ; un manifeste déjà
 * en cache reste utilisé si son rafraîchissement échoue. Si rien n'est lisible,
 * la consultation retourne UNAVAILABLE et les replis habituels s'appliquent
 * (index local, VIES, puis confirmation manuelle documentée).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { gunzipSync } from 'node:zlib';

import { normalizeSiren, normalizeVatNumber } from './client-type.mjs';
import {
  DEFAULT_INDEX_REPOSITORY,
  findShardIndex,
  getManifestPath,
  getReleaseDownloadBaseUrl,
  getShardPath,
  normalizeManifest,
} from './dgfip-vat-shards.mjs';
import { VAT_LOOKUP_OUTCOMES, VAT_PROVIDER_NOT_CONFIGURED } from './vat-verification.mjs';

const resolveBaseUrl = () => {
  const configured = (process.env.DGFIP_INDEX_BASE_URL || '').trim();
  if (configured.toLowerCase() === 'off') return '';
  if (configured) return configured.replace(/\/$/, '');

  return getReleaseDownloadBaseUrl(
    (process.env.DGFIP_INDEX_REPOSITORY || '').trim() || DEFAULT_INDEX_REPOSITORY
  );
};

const BASE_URL = resolveBaseUrl();

const REQUEST_TIMEOUT_MS = 4000;
const RETRY_DELAY_MS = 600;
const MANIFEST_TTL_MS = 10 * 60 * 1000;
// Après un échec de rafraîchissement, on réessaie au plus toutes les minutes
// tout en continuant d'utiliser le manifeste connu.
const MANIFEST_RETRY_AFTER_FAILURE_MS = 60 * 1000;
// Plafond du cache : ~1,5 Mo décompressé par fichier.
const MAX_CACHED_SHARDS = 8;

let manifestCache = null;
const shardCache = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const isDgfipRemoteConfigured = () => Boolean(BASE_URL);
export const getDgfipRemoteBaseUrl = () => BASE_URL;

/** Téléchargement d'un fichier, retenté une fois (réseau, 5xx, 404 transitoire). */
const fetchAsset = async (pathname) => {
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt) await sleep(RETRY_DELAY_MS);

    try {
      const response = await fetch(`${BASE_URL}/${pathname}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: 'no-store',
        redirect: 'follow',
        headers: { 'User-Agent': 'devis-sarange (verification TVA)' },
      });

      if (response.ok) return response;

      lastError = new Error(`HTTP ${response.status}`);
      lastError.status = response.status;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

const parseJsonBuffer = (buffer) => {
  // Les fichiers sont publiés compressés ; on reconnaît l'en-tête gzip plutôt
  // que de supposer un Content-Type.
  const isGzip = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  return JSON.parse((isGzip ? gunzipSync(buffer) : buffer).toString('utf8'));
};

/** Manifeste de la version active, mis en cache quelques minutes. */
export const getDgfipRemoteManifest = async () => {
  if (!BASE_URL) return null;

  const now = Date.now();
  if (manifestCache && now < manifestCache.expiresAt) {
    return manifestCache.value;
  }

  try {
    const response = await fetchAsset(getManifestPath());
    const manifest = normalizeManifest(parseJsonBuffer(Buffer.from(await response.arrayBuffer())));

    if (!manifest) throw new Error('manifeste inexploitable');

    manifestCache = { value: manifest, expiresAt: now + MANIFEST_TTL_MS };
    return manifest;
  } catch (error) {
    // Manifeste connu : on continue de le servir, et on réessaiera plus tard.
    if (manifestCache?.value) {
      console.warn(
        '[dgfip-vat-remote] Rafraîchissement du manifeste impossible, version connue conservée:',
        error?.message
      );
      manifestCache = { ...manifestCache, expiresAt: now + MANIFEST_RETRY_AFTER_FAILURE_MS };
      return manifestCache.value;
    }

    throw error;
  }
};

const getShard = async (version, index) => {
  const cacheKey = `${version}/${index}`;
  if (shardCache.has(cacheKey)) return shardCache.get(cacheKey);

  const response = await fetchAsset(getShardPath(version, index));
  const shard = parseJsonBuffer(Buffer.from(await response.arrayBuffer()));

  // Cache borné : on évacue l'entrée la plus ancienne.
  if (shardCache.size >= MAX_CACHED_SHARDS) {
    shardCache.delete(shardCache.keys().next().value);
  }
  shardCache.set(cacheKey, shard);

  return shard;
};

/**
 * Recherche du n° de TVA d'un SIREN dans l'index publié.
 * @returns {{outcome: string, vatNumber?: string, publishedAt?: string, error?: string}}
 */
export const lookupVatNumberInDgfipRemote = async (siren) => {
  if (!BASE_URL) return { outcome: VAT_PROVIDER_NOT_CONFIGURED };

  const normalizedSiren = normalizeSiren(siren);
  if (normalizedSiren.length !== 9) return { outcome: VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP };

  try {
    const manifest = await getDgfipRemoteManifest();
    if (!manifest) return { outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE };

    // Au-delà de la dernière borne : aucune entreprise de l'extraction.
    const index = findShardIndex(normalizedSiren, manifest.bounds);
    if (index === -1) return { outcome: VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP };

    const shard = await getShard(manifest.version, index);
    const vatNumber = normalizeVatNumber(shard[normalizedSiren]);

    return vatNumber
      ? {
          outcome: VAT_LOOKUP_OUTCOMES.VERIFIED,
          vatNumber,
          // Date de publication de l'extraction utilisée.
          publishedAt: manifest.publishedAt,
        }
      : { outcome: VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP };
  } catch (error) {
    console.error('[dgfip-vat-remote] Consultation impossible:', error?.message);
    return { outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE, error: error?.message || '' };
  }
};

/** État de l'index publié, pour la supervision. */
export const getDgfipRemoteStatus = async () => {
  if (!BASE_URL) return { configured: false, baseUrl: '', manifest: null };

  try {
    return { configured: true, baseUrl: BASE_URL, manifest: await getDgfipRemoteManifest() };
  } catch (error) {
    return { configured: true, baseUrl: BASE_URL, manifest: null, error: error?.message || '' };
  }
};
