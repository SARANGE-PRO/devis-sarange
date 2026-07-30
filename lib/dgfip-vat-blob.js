/**
 * dgfip-vat-blob.js  (SERVEUR uniquement)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lecture de l'index DGFiP publié sur Vercel Blob, depuis les fonctions Vercel.
 *
 * Une vérification lit le manifeste puis UN SEUL fichier de préfixe (~40 Ko
 * compressé) : l'extraction complète n'est jamais téléchargée dans une
 * fonction. Manifeste et fichiers de préfixe sont mis en cache en mémoire.
 *
 * Le magasin ne contient que des données publiques (jeu DGFiP) — aucune donnée
 * interne ni client. La lecture se fait par URL publique, sans jeton : le jeton
 * d'écriture n'existe que dans GitHub Actions.
 *
 * Si le magasin est injoignable ou non configuré, la consultation retourne
 * UNAVAILABLE et les replis habituels s'appliquent (VIES, puis confirmation
 * manuelle documentée).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { gunzipSync } from 'node:zlib';

import { normalizeSiren, normalizeVatNumber } from './client-type.mjs';
import {
  MANIFEST_PATH,
  getShardPath,
  getSirenPrefix,
  normalizeManifest,
} from './dgfip-vat-shards.mjs';
import { VAT_LOOKUP_OUTCOMES, VAT_PROVIDER_NOT_CONFIGURED } from './vat-verification.mjs';

// URL publique du magasin (ex. https://xxxx.public.blob.vercel-storage.com).
const BLOB_BASE_URL = (process.env.DGFIP_BLOB_BASE_URL || '').replace(/\/$/, '');

const REQUEST_TIMEOUT_MS = 5000;
const MANIFEST_TTL_MS = 10 * 60 * 1000;
// Plafond du cache de préfixes : ~40 Ko compressés par fichier, quelques Mo au
// total dans une fonction serverless.
const MAX_CACHED_SHARDS = 32;

let manifestCache = null;
const shardCache = new Map();

export const isDgfipBlobConfigured = () => Boolean(BLOB_BASE_URL);

const fetchBlob = async (pathname) => {
  const response = await fetch(`${BLOB_BASE_URL}/${pathname}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response;
};

/** Manifeste de la version active, mis en cache quelques minutes. */
export const getDgfipBlobManifest = async () => {
  if (!BLOB_BASE_URL) return null;

  if (manifestCache && Date.now() - manifestCache.loadedAt < MANIFEST_TTL_MS) {
    return manifestCache.value;
  }

  const response = await fetchBlob(MANIFEST_PATH);
  const manifest = normalizeManifest(await response.json());

  manifestCache = { loadedAt: Date.now(), value: manifest };
  return manifest;
};

const getShard = async (version, prefix) => {
  const cacheKey = `${version}/${prefix}`;
  if (shardCache.has(cacheKey)) return shardCache.get(cacheKey);

  let shard;
  try {
    const response = await fetchBlob(getShardPath(version, prefix));
    const compressed = Buffer.from(await response.arrayBuffer());
    shard = JSON.parse(gunzipSync(compressed).toString('utf8'));
  } catch (error) {
    // Un préfixe sans aucune entreprise n'existe pas dans le magasin : absence
    // légitime, à distinguer d'une panne.
    if (error?.status === 404) {
      shard = {};
    } else {
      throw error;
    }
  }

  // Cache borné : on évacue l'entrée la plus ancienne.
  if (shardCache.size >= MAX_CACHED_SHARDS) {
    shardCache.delete(shardCache.keys().next().value);
  }
  shardCache.set(cacheKey, shard);

  return shard;
};

/**
 * Recherche du n° de TVA d'un SIREN dans l'index publié sur Vercel Blob.
 * @returns {{outcome: string, vatNumber?: string, publishedAt?: string}}
 */
export const lookupVatNumberInDgfipBlob = async (siren) => {
  if (!BLOB_BASE_URL) return { outcome: VAT_PROVIDER_NOT_CONFIGURED };

  const normalizedSiren = normalizeSiren(siren);
  const prefix = getSirenPrefix(normalizedSiren);
  if (!prefix) return { outcome: VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP };

  try {
    const manifest = await getDgfipBlobManifest();
    if (!manifest) return { outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE };

    const shard = await getShard(manifest.version, prefix);
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
    console.error('[dgfip-vat-blob] Consultation impossible:', error?.message);
    return { outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE };
  }
};

/** État de l'index publié, pour la supervision. */
export const getDgfipBlobStatus = async () => {
  if (!BLOB_BASE_URL) return { configured: false, manifest: null };

  try {
    return { configured: true, manifest: await getDgfipBlobManifest() };
  } catch (error) {
    return { configured: true, manifest: null, error: error?.message || '' };
  }
};
