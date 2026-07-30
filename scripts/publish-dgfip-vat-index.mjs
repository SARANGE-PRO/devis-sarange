#!/usr/bin/env node
/**
 * publish-dgfip-vat-index.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Publie l'index DGFiP des numéros de TVA sur Vercel Blob, découpé par préfixe
 * de SIREN. Destiné à GitHub Actions (quotidien + manuel).
 *
 *   npm run publish-dgfip-vat-index
 *   npm run publish-dgfip-vat-index -- --dry-run   (aucun envoi)
 *
 * Réutilise l'orchestrateur existant (lib/dgfip-vat-index-builder.mjs) : mêmes
 * contrôles de producteur DGFiP, même comparaison d'empreinte évitant un
 * téléchargement inutile, mêmes refus d'un fichier corrompu.
 *
 * Séquence d'envoi :
 *   1. les 1000 fichiers de préfixe de la NOUVELLE version ;
 *   2. les sondes de validation sur les fichiers réellement envoyés ;
 *   3. le manifeste current.json EN DERNIER (bascule atomique) ;
 *   4. l'élagage des versions au-delà des deux plus récentes.
 *
 * En cas d'échec à n'importe quelle étape, current.json n'est pas republié :
 * la version précédente reste active. Le script sort alors en code non nul.
 *
 * Le jeton BLOB_READ_WRITE_TOKEN provient exclusivement des secrets GitHub :
 * il n'est jamais écrit dans le dépôt ni journalisé.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { gzipSync } from 'node:zlib';

import { del, list, put } from '@vercel/blob';

import {
  UPDATE_OUTCOMES,
  isSuccessfulUpdate,
  updateDgfipVatIndex,
} from '../lib/dgfip-vat-index-builder.mjs';
import {
  MANIFEST_PATH,
  buildManifest,
  buildShards,
  buildVersionId,
  getShardPath,
  getVersionFromPath,
  getVersionsToPrune,
  normalizeManifest,
} from '../lib/dgfip-vat-shards.mjs';

const DEFAULT_DATASET_ID = '6a2b4e2393218f1e63d7389b';
const DATASET_ID = process.env.TVA_DGFIP_DATASET_ID || DEFAULT_DATASET_ID;
const BLOB_BASE_URL = (process.env.DGFIP_BLOB_BASE_URL || '').replace(/\/$/, '');
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';
const KEEP_VERSIONS = Math.max(2, Number.parseInt(process.env.DGFIP_KEEP_VERSIONS || '2', 10) || 2);
const DRY_RUN = process.argv.includes('--dry-run');

const DATA_GOUV_API = 'https://www.data.gouv.fr/api/1/datasets';
const METADATA_TIMEOUT_MS = 60000;
const DOWNLOAD_TIMEOUT_MS = 900000;
const UPLOAD_CONCURRENCY = 8;

// Sondes de validation, exécutées sur les fichiers réellement envoyés.
const PROBE_SIREN = '820001014';
const PROBE_EXPECTED_VAT = 'FR22820001014';
const UNKNOWN_SIREN = '999999999';

/* ─── Source officielle ──────────────────────────────────────────────────── */

const fetchDataset = async () => {
  const response = await fetch(`${DATA_GOUV_API}/${encodeURIComponent(DATASET_ID)}/`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`data.gouv.fr a répondu ${response.status}`);
  return response.json();
};

const fetchResource = async (resource) => {
  const response = await fetch(resource.url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`Téléchargement impossible (HTTP ${response.status})`);
  return { content: await response.text(), etag: response.headers.get('etag') || '' };
};

/* ─── Magasin Vercel Blob ────────────────────────────────────────────────── */

// Manifeste actuel : sert à comparer l'empreinte (et donc à éviter un
// téléchargement inutile) et à connaître la version active.
const readCurrentIndex = async () => {
  if (!BLOB_BASE_URL) return null;

  try {
    const response = await fetch(`${BLOB_BASE_URL}/${MANIFEST_PATH}`, {
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
      cache: 'no-store',
    });

    if (!response.ok) return null;
    const manifest = normalizeManifest(await response.json());
    return manifest ? { metadata: manifest } : null;
  } catch {
    return null;
  }
};

const uploadJson = async (pathname, payload, { compress = true } = {}) => {
  const body = compress
    ? gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'))
    : JSON.stringify(payload);

  await put(pathname, body, {
    token: TOKEN,
    access: 'public',
    // Chemins DÉTERMINISTES : l'application les compose depuis le manifeste.
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: compress ? 'application/gzip' : 'application/json',
    // Les fichiers de préfixe sont immuables (chemin versionné) ; le manifeste
    // doit rester frais pour que la bascule soit vue rapidement.
    cacheControlMaxAge: compress ? 31536000 : 60,
  });
};

// Envoi par lots : limite la charge mémoire et le nombre d'appels simultanés.
const uploadShards = async (version, shards) => {
  const prefixes = [...shards.keys()];
  let uploaded = 0;

  for (let index = 0; index < prefixes.length; index += UPLOAD_CONCURRENCY) {
    const batch = prefixes.slice(index, index + UPLOAD_CONCURRENCY);

    await Promise.all(
      batch.map((prefix) => uploadJson(getShardPath(version, prefix), shards.get(prefix)))
    );

    uploaded += batch.length;
    if (uploaded % 200 === 0 || uploaded === prefixes.length) {
      console.log(`  ${uploaded}/${prefixes.length} fichiers de préfixe envoyés`);
    }
  }
};

/**
 * Sondes exécutées sur les fichiers RÉELLEMENT publiés (et non sur les données
 * en mémoire) : elles valident l'envoi avant la bascule.
 */
const runProbes = async (version) => {
  const { gunzipSync } = await import('node:zlib');

  const readShard = async (prefix) => {
    const response = await fetch(`${BLOB_BASE_URL}/${getShardPath(version, prefix)}`, {
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
      cache: 'no-store',
    });

    if (response.status === 404) return {};
    if (!response.ok) throw new Error(`sonde HTTP ${response.status}`);

    return JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8'));
  };

  const knownShard = await readShard(PROBE_SIREN.slice(0, 3));
  if (knownShard[PROBE_SIREN] !== PROBE_EXPECTED_VAT) {
    throw new Error(
      `sonde ${PROBE_SIREN} : attendu ${PROBE_EXPECTED_VAT}, obtenu ${knownShard[PROBE_SIREN] || 'aucun'}`
    );
  }

  const unknownShard = await readShard(UNKNOWN_SIREN.slice(0, 3));
  if (unknownShard[UNKNOWN_SIREN]) {
    throw new Error(`sonde négative ${UNKNOWN_SIREN} : un numéro a été trouvé à tort`);
  }

  console.log(`  sonde ${PROBE_SIREN} -> ${PROBE_EXPECTED_VAT} : OK`);
  console.log(`  sonde négative ${UNKNOWN_SIREN} -> NOT_FOUND_DGFIP : OK`);
};

// Élagage : on conserve au minimum les deux versions les plus récentes.
const pruneOldVersions = async (activeVersion) => {
  const versions = new Set();
  const blobsByVersion = new Map();
  let cursor;

  do {
    const page = await list({ token: TOKEN, prefix: `dgfip-vat/`, cursor, limit: 1000 });

    page.blobs.forEach((blob) => {
      const version = getVersionFromPath(blob.pathname);
      if (!version) return;

      versions.add(version);
      if (!blobsByVersion.has(version)) blobsByVersion.set(version, []);
      blobsByVersion.get(version).push(blob.url);
    });

    cursor = page.cursor;
  } while (cursor);

  const toPrune = getVersionsToPrune([...versions], activeVersion, KEEP_VERSIONS);

  for (const version of toPrune) {
    const urls = blobsByVersion.get(version) || [];
    for (let index = 0; index < urls.length; index += UPLOAD_CONCURRENCY) {
      await del(urls.slice(index, index + UPLOAD_CONCURRENCY), { token: TOKEN });
    }
    console.log(`  version ${version} supprimée (${urls.length} fichiers)`);
  }

  console.log(
    `  versions conservées : ${[...versions].filter((v) => !toPrune.includes(v)).sort().reverse().join(', ')}`
  );
};

/* ─── Orchestration ──────────────────────────────────────────────────────── */

let publishedVersion = '';

const writeIndexAtomically = async (nextIndex) => {
  const generatedAt = new Date().toISOString();
  const version = buildVersionId(generatedAt);
  publishedVersion = version;

  console.log(`Découpage de ${nextIndex.entryCount} entrées par préfixe de SIREN…`);
  const shards = buildShards(nextIndex.entries);
  console.log(`  ${shards.size} fichiers de préfixe à publier (version ${version})`);

  const manifest = buildManifest({
    version,
    publishedAt: nextIndex.publishedAt,
    entryCount: nextIndex.entryCount,
    fingerprint: nextIndex.fingerprint,
    generatedAt,
    producer: nextIndex.producer,
    datasetUrl: nextIndex.datasetUrl,
    shardCount: shards.size,
  });

  if (DRY_RUN) {
    console.log('[--dry-run] aucun envoi. Manifeste qui serait publié :');
    console.log(JSON.stringify(manifest, null, 2));
    const probeShard = shards.get(PROBE_SIREN.slice(0, 3)) || {};
    console.log(
      `[--dry-run] sonde locale ${PROBE_SIREN} -> ${probeShard[PROBE_SIREN] || 'ABSENT'}`
    );
    return;
  }

  console.log('Envoi des fichiers de préfixe…');
  await uploadShards(version, shards);

  console.log('Sondes de validation sur les fichiers publiés…');
  await runProbes(version);

  // EN DERNIER : la bascule ne devient effective qu'ici.
  console.log('Publication du manifeste (bascule atomique)…');
  await uploadJson(MANIFEST_PATH, manifest, { compress: false });
};

const main = async () => {
  if (!DRY_RUN && (!TOKEN || !BLOB_BASE_URL)) {
    console.error(
      'Configuration incomplète : BLOB_READ_WRITE_TOKEN (secret) et DGFIP_BLOB_BASE_URL sont requis.'
    );
    return 1;
  }

  const result = await updateDgfipVatIndex({
    fetchDataset,
    fetchResource,
    readCurrentIndex,
    writeIndexAtomically,
  });

  const exitCode = isSuccessfulUpdate(result.outcome) ? 0 : 1;

  switch (result.outcome) {
    case UPDATE_OUTCOMES.UPDATED:
      console.log(
        `Index publié : ${result.entryCount} entrées (extraction du ${result.publishedAt || 'date inconnue'}).`
      );
      break;
    case UPDATE_OUTCOMES.UNCHANGED:
      console.log(
        `Extraction DGFiP inchangée : aucune publication (${result.entryCount} entrées actives).`
      );
      break;
    case UPDATE_OUTCOMES.REJECTED_PRODUCER:
      console.error(`Publication refusée : ${result.message}`);
      break;
    case UPDATE_OUTCOMES.INVALID_INDEX:
      console.error(
        `Index refusé (${result.reason}) : la version précédente reste active${result.message ? ` — ${result.message}` : ''}.`
      );
      break;
    default:
      console.error(
        `Publication impossible (${result.outcome}) : ${result.message || 'version précédente conservée'}.`
      );
      break;
  }

  if (result.totalRows !== undefined) {
    console.log(
      [
        `Lignes lues : ${result.totalRows}`,
        `acceptées : ${result.acceptedRows}`,
        `rejetées : ${result.rejectedRows}`,
        `motif principal : ${result.mainRejectionReason || 'aucun'}`,
        `code de sortie : ${exitCode}`,
      ].join(' | ')
    );
  }

  // L'élagage n'a lieu qu'après une bascule réussie.
  if (result.outcome === UPDATE_OUTCOMES.UPDATED && !DRY_RUN) {
    console.log('Élagage des anciennes versions…');
    try {
      await pruneOldVersions(publishedVersion);
    } catch (error) {
      // Un élagage incomplet ne remet pas en cause la publication.
      console.warn(`Élagage partiel : ${error?.message || error}`);
    }
  }

  return exitCode;
};

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error('Publication interrompue :', error?.message || error);
    process.exitCode = 1;
  });
