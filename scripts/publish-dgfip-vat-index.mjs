#!/usr/bin/env node
/**
 * publish-dgfip-vat-index.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Publie l'index DGFiP des numéros de TVA sur les GitHub Releases du dépôt,
 * découpé en fichiers d'effectif équilibré. Destiné à GitHub Actions
 * (hebdomadaire + manuel) ; exécutable aussi en local avec un jeton :
 *
 *   GITHUB_TOKEN="$(gh auth token)" npm run publish-dgfip-vat-index
 *   npm run publish-dgfip-vat-index -- --dry-run   (aucun envoi, aucun jeton)
 *   npm run publish-dgfip-vat-index -- --force     (republie même si l'extraction
 *                                                  est inchangée)
 *
 * Réutilise l'orchestrateur existant (lib/dgfip-vat-index-builder.mjs) : mêmes
 * contrôles de producteur DGFiP, même comparaison d'empreinte évitant un
 * téléchargement inutile, mêmes refus d'un fichier corrompu.
 *
 * Séquence :
 *   1. release versionnée « dgfip-vat-{version} » créée en BROUILLON, fichiers
 *      téléversés (cadence limitée : l'API GitHub refuse plus de 80 créations
 *      par minute) ;
 *   2. release publiée (son tag est créé à cet instant), sondes de validation
 *      sur les fichiers RÉELLEMENT servis ;
 *   3. manifeste current.json remplacé dans la release « dgfip-vat » : c'est
 *      la bascule, l'application lit la nouvelle version dès son prochain
 *      rafraîchissement ;
 *   4. élagage des versions au-delà des deux plus récentes.
 *
 * En cas d'échec avant la bascule, la release versionnée est supprimée et
 * l'ancienne version reste active. Le script sort alors en code non nul.
 *
 * Aucun secret à gérer : GitHub Actions fournit GITHUB_TOKEN de lui-même.
 * Aucun quota d'opérations : contrairement à Vercel Blob (plan Hobby : 2 000
 * opérations par mois, magasin bloqué trente jours au-delà), les releases
 * n'imposent pas de plafond de ce type.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { gunzipSync, gzipSync } from 'node:zlib';

import {
  UPDATE_OUTCOMES,
  isSuccessfulUpdate,
  updateDgfipVatIndex,
} from '../lib/dgfip-vat-index-builder.mjs';
import {
  DEFAULT_INDEX_REPOSITORY,
  MANIFEST_ASSET,
  PENDING_MANIFEST_ASSET,
  POINTER_TAG,
  PREVIOUS_MANIFEST_ASSET,
  buildManifest,
  buildShards,
  buildVersionId,
  findShardIndex,
  getManifestPath,
  getReleaseDownloadBaseUrl,
  getShardName,
  getShardPath,
  getVersionFromTag,
  getVersionTag,
  getVersionsToPrune,
  normalizeManifest,
} from '../lib/dgfip-vat-shards.mjs';

const DEFAULT_DATASET_ID = '6a2b4e2393218f1e63d7389b';
const DATASET_ID = process.env.TVA_DGFIP_DATASET_ID || DEFAULT_DATASET_ID;
const REPOSITORY = (
  process.env.DGFIP_INDEX_REPOSITORY ||
  process.env.GITHUB_REPOSITORY ||
  DEFAULT_INDEX_REPOSITORY
).trim();
const TOKEN = process.env.GITHUB_TOKEN || '';
// Commit auquel les tags des releases sont rattachés. Le contenu du dépôt à
// cet instant n'a aucune incidence sur l'index : seuls les fichiers comptent.
const TARGET_COMMITISH = process.env.DGFIP_INDEX_TARGET || process.env.GITHUB_SHA || 'main';
const KEEP_VERSIONS = Math.max(2, Number.parseInt(process.env.DGFIP_KEEP_VERSIONS || '2', 10) || 2);
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

const DOWNLOAD_BASE_URL = getReleaseDownloadBaseUrl(REPOSITORY);
const API_URL = 'https://api.github.com';
const UPLOADS_URL = 'https://uploads.github.com';
const DATA_GOUV_API = 'https://www.data.gouv.fr/api/1/datasets';
const USER_AGENT = 'devis-sarange-dgfip-index';
const METADATA_TIMEOUT_MS = 60000;
const DOWNLOAD_TIMEOUT_MS = 900000;
const API_TIMEOUT_MS = 120000;
// Limites secondaires de l'API GitHub : au plus 80 requêtes de création par
// minute. Quatre envois simultanés, chaque lot espacé de 3,5 s → ~70/min.
const UPLOAD_CONCURRENCY = 4;
const UPLOAD_BATCH_INTERVAL_MS = 3500;

// Sondes de validation, exécutées sur les fichiers réellement servis.
const PROBE_SIREN = '820001014';
const PROBE_EXPECTED_VAT = 'FR22820001014';
const UNKNOWN_SIREN = '999999999';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatDate = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'date inconnue';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'Europe/Paris' }).format(
    date
  );
};

const parseJsonBuffer = (buffer) => {
  const isGzip = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  return JSON.parse((isGzip ? gunzipSync(buffer) : buffer).toString('utf8'));
};

/* ─── Source officielle ──────────────────────────────────────────────────── */

const fetchDataset = async () => {
  const response = await fetch(`${DATA_GOUV_API}/${encodeURIComponent(DATASET_ID)}/`, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`data.gouv.fr a répondu ${response.status}`);
  return response.json();
};

const fetchResource = async (resource) => {
  const response = await fetch(resource.url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`Téléchargement impossible (HTTP ${response.status})`);
  return { content: await response.text(), etag: response.headers.get('etag') || '' };
};

/* ─── Lecture publique (comme l'application) ─────────────────────────────── */

const fetchPublic = async (pathname, { attempts = 6, delayMs = 5000 } = {}) => {
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt) await sleep(delayMs);

    try {
      const response = await fetch(`${DOWNLOAD_BASE_URL}/${pathname}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
        cache: 'no-store',
        redirect: 'follow',
      });

      if (response.ok) return Buffer.from(await response.arrayBuffer());

      lastError = new Error(`HTTP ${response.status}`);
      lastError.status = response.status;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

// Manifeste actuel : sert à comparer l'empreinte (et donc à éviter un
// téléchargement inutile) et à connaître la version active.
const readCurrentIndex = async () => {
  try {
    const manifest = normalizeManifest(
      parseJsonBuffer(await fetchPublic(getManifestPath(), { attempts: 2, delayMs: 2000 }))
    );
    return manifest ? { metadata: manifest } : null;
  } catch {
    return null;
  }
};

/* ─── API GitHub ─────────────────────────────────────────────────────────── */

const githubHeaders = (extra = {}) => ({
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': USER_AGENT,
  ...extra,
});

const readRetryAfterMs = (response) => {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (retryAfter > 0) return retryAfter * 1000;

  const reset = Number(response.headers.get('x-ratelimit-reset'));
  if (response.headers.get('x-ratelimit-remaining') === '0' && reset > 0) {
    return Math.max(1000, reset * 1000 - Date.now());
  }

  return 0;
};

/** Appel à l'API GitHub, retenté sur limite de débit, erreur 5xx ou réseau. */
const githubRequest = async (
  method,
  url,
  { body, headers = {}, expectedStatuses = [200, 201, 204], attempts = 4 } = {}
) => {
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response;

    try {
      response = await fetch(url, {
        method,
        headers: githubHeaders(headers),
        body,
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;
      await sleep(2000 * (attempt + 1));
      continue;
    }

    if (expectedStatuses.includes(response.status)) {
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }

    const text = await response.text().catch(() => '');
    const shortUrl = url.replace(API_URL, '').replace(UPLOADS_URL, '');
    lastError = new Error(
      `GitHub ${method} ${shortUrl} → HTTP ${response.status}${text ? ` ${text.slice(0, 200)}` : ''}`
    );
    lastError.status = response.status;

    const retryAfterMs = readRetryAfterMs(response);
    const rateLimited =
      response.status === 429 ||
      (response.status === 403 && (retryAfterMs > 0 || /rate limit/i.test(text)));

    if (rateLimited || response.status >= 500) {
      await sleep(retryAfterMs || 5000 * (attempt + 1));
      continue;
    }

    throw lastError;
  }

  throw lastError;
};

const api = (method, path, options) =>
  githubRequest(method, `${API_URL}/repos/${REPOSITORY}${path}`, options);

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const getReleaseByTag = async (tag) => {
  try {
    return await api('GET', `/releases/tags/${encodeURIComponent(tag)}`);
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
};

const createRelease = (payload) =>
  api('POST', '/releases', {
    body: JSON.stringify(payload),
    headers: JSON_HEADERS,
    expectedStatuses: [201],
  });

const updateRelease = (releaseId, payload) =>
  api('PATCH', `/releases/${releaseId}`, { body: JSON.stringify(payload), headers: JSON_HEADERS });

const deleteRelease = (releaseId) =>
  api('DELETE', `/releases/${releaseId}`, { expectedStatuses: [204] });

const deleteTag = async (tag) => {
  try {
    await api('DELETE', `/git/refs/tags/${encodeURIComponent(tag)}`, { expectedStatuses: [204] });
  } catch (error) {
    // Tag inexistant (release restée en brouillon) : rien à supprimer.
    if (error?.status !== 404 && error?.status !== 422) throw error;
  }
};

const listAssets = async (releaseId) =>
  (await api('GET', `/releases/${releaseId}/assets?per_page=100`)) || [];

const renameAsset = (assetId, name) =>
  api('PATCH', `/releases/assets/${assetId}`, {
    body: JSON.stringify({ name }),
    headers: JSON_HEADERS,
  });

const deleteAsset = (assetId) =>
  api('DELETE', `/releases/assets/${assetId}`, { expectedStatuses: [204] });

const uploadAsset = async (releaseId, name, buffer, contentType) => {
  try {
    return await githubRequest(
      'POST',
      `${UPLOADS_URL}/repos/${REPOSITORY}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
      { body: buffer, headers: { 'Content-Type': contentType }, expectedStatuses: [201] }
    );
  } catch (error) {
    // Fichier déjà présent : un premier envoi a abouti malgré une réponse en
    // erreur. Le fichier est complet (GitHub ne crée pas de fichier partiel).
    if (error?.status === 422 && /already_exists/i.test(error.message)) {
      const existing = (await listAssets(releaseId)).find((asset) => asset.name === name);
      if (existing) return existing;
    }
    throw error;
  }
};

/* ─── Publication ────────────────────────────────────────────────────────── */

const buildReleaseBody = (manifest) =>
  [
    'Index des numéros de TVA intracommunautaire français, construit depuis le',
    'jeu de données officiel de la DGFiP (data.gouv.fr). Données publiques.',
    '',
    'Fichiers lus par l’application devis-sarange pour vérifier le numéro de TVA',
    'des clients professionnels. Ne pas modifier ni supprimer à la main : la',
    'publication et l’élagage sont automatisés.',
    '',
    `- Extraction publiée le : ${manifest.publishedAt || 'inconnue'}`,
    `- Entrées : ${manifest.entryCount}`,
    `- Fichiers : ${manifest.shardCount}`,
    `- Empreinte : ${manifest.fingerprint || 'aucune'}`,
    `- Jeu de données : ${manifest.datasetUrl || 'non renseigné'}`,
  ].join('\n');

const POINTER_BODY = [
  'Manifeste de la version ACTIVE de l’index DGFiP des numéros de TVA',
  '(current.json). Cette release est permanente : seul son fichier est',
  'remplacé à chaque publication. Ne pas supprimer.',
].join('\n');

// Envoi par lots, à cadence limitée.
const uploadShards = async (releaseId, shards) => {
  let uploaded = 0;

  for (let start = 0; start < shards.length; start += UPLOAD_CONCURRENCY) {
    const batchStartedAt = Date.now();
    const batch = shards
      .slice(start, start + UPLOAD_CONCURRENCY)
      .map((shard, offset) => ({ index: start + offset, shard }));

    await Promise.all(
      batch.map(({ index, shard }) =>
        uploadAsset(
          releaseId,
          getShardName(index),
          gzipSync(Buffer.from(JSON.stringify(shard), 'utf8'), { level: 9 }),
          'application/gzip'
        )
      )
    );

    uploaded += batch.length;
    if (uploaded % 20 === 0 || uploaded === shards.length) {
      console.log(`  ${uploaded}/${shards.length} fichiers envoyés`);
    }

    if (start + UPLOAD_CONCURRENCY < shards.length) {
      const elapsed = Date.now() - batchStartedAt;
      if (elapsed < UPLOAD_BATCH_INTERVAL_MS) await sleep(UPLOAD_BATCH_INTERVAL_MS - elapsed);
    }
  }
};

/**
 * Sondes exécutées sur les fichiers RÉELLEMENT publiés (et non sur les données
 * en mémoire) : elles valident l'envoi avant la bascule.
 */
const runProbes = async (version, bounds) => {
  const readShard = async (index) => parseJsonBuffer(await fetchPublic(getShardPath(version, index)));

  const knownIndex = findShardIndex(PROBE_SIREN, bounds);
  if (knownIndex === -1) throw new Error(`sonde ${PROBE_SIREN} : aucun fichier ne couvre ce SIREN`);

  const knownShard = await readShard(knownIndex);
  if (knownShard[PROBE_SIREN] !== PROBE_EXPECTED_VAT) {
    throw new Error(
      `sonde ${PROBE_SIREN} : attendu ${PROBE_EXPECTED_VAT}, obtenu ${knownShard[PROBE_SIREN] || 'aucun'}`
    );
  }

  const unknownIndex = findShardIndex(UNKNOWN_SIREN, bounds);
  if (unknownIndex !== -1) {
    const unknownShard = await readShard(unknownIndex);
    if (unknownShard[UNKNOWN_SIREN]) {
      throw new Error(`sonde négative ${UNKNOWN_SIREN} : un numéro a été trouvé à tort`);
    }
  }

  console.log(`  sonde ${PROBE_SIREN} -> ${PROBE_EXPECTED_VAT} : OK`);
  console.log(`  sonde négative ${UNKNOWN_SIREN} -> NOT_FOUND_DGFIP : OK`);
};

/**
 * Bascule : remplace current.json dans la release pointeur. Les fichiers d'une
 * release étant immuables, le nouveau manifeste est téléversé sous un nom
 * provisoire puis renommé ; l'ancien est conservé sous previous.json. La
 * fenêtre sans current.json se limite à un renommage (l'application retente
 * une lecture en échec avant de conclure).
 */
const switchManifest = async (manifest) => {
  let pointer = await getReleaseByTag(POINTER_TAG);

  if (!pointer) {
    console.log(`  création de la release « ${POINTER_TAG} » (pointeur permanent)…`);
    pointer = await createRelease({
      tag_name: POINTER_TAG,
      target_commitish: TARGET_COMMITISH,
      name: 'Index DGFiP des numéros de TVA (version active)',
      body: POINTER_BODY,
      draft: false,
      prerelease: false,
      make_latest: 'false',
    });
  }

  const assets = await listAssets(pointer.id);
  const byName = new Map(assets.map((asset) => [asset.name, asset]));

  // Reste d'une bascule interrompue.
  if (byName.has(PENDING_MANIFEST_ASSET)) await deleteAsset(byName.get(PENDING_MANIFEST_ASSET).id);

  const pending = await uploadAsset(
    pointer.id,
    PENDING_MANIFEST_ASSET,
    Buffer.from(JSON.stringify(manifest), 'utf8'),
    'application/json'
  );

  if (byName.has(PREVIOUS_MANIFEST_ASSET)) await deleteAsset(byName.get(PREVIOUS_MANIFEST_ASSET).id);

  const current = byName.get(MANIFEST_ASSET);
  if (current) await renameAsset(current.id, PREVIOUS_MANIFEST_ASSET);

  try {
    await renameAsset(pending.id, MANIFEST_ASSET);
  } catch (error) {
    // Retour à l'ancien manifeste : l'ancienne version reste active.
    if (current) await renameAsset(current.id, MANIFEST_ASSET).catch(() => {});
    throw error;
  }
};

// Vérifie que le manifeste servi publiquement porte bien la nouvelle version.
const confirmSwitch = async (version) => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt) await sleep(5000);

    try {
      const manifest = normalizeManifest(
        parseJsonBuffer(await fetchPublic(getManifestPath(), { attempts: 1 }))
      );
      if (manifest?.version === version) {
        console.log(`  manifeste public : version ${version} active`);
        return;
      }
    } catch {
      // Propagation en cours : on réessaie.
    }
  }

  console.warn(
    '  le manifeste public ne reflète pas encore la nouvelle version (propagation en cours).'
  );
};

// Élagage : on conserve la version active et les plus récentes (deux minimum).
const pruneOldVersions = async (activeVersion) => {
  const releases = (await api('GET', '/releases?per_page=100')) || [];
  const byVersion = new Map();

  releases.forEach((release) => {
    const version = getVersionFromTag(release.tag_name);
    if (version) byVersion.set(version, release);
  });

  const toPrune = getVersionsToPrune([...byVersion.keys()], activeVersion, KEEP_VERSIONS);

  for (const version of toPrune) {
    const release = byVersion.get(version);
    await deleteRelease(release.id);
    await deleteTag(release.tag_name);
    console.log(`  version ${version} supprimée`);
  }

  console.log(
    `  versions conservées : ${[...byVersion.keys()]
      .filter((version) => !toPrune.includes(version))
      .sort()
      .reverse()
      .join(', ')}`
  );
};

/* ─── Orchestration ──────────────────────────────────────────────────────── */

let publishedVersion = '';

const writeIndexAtomically = async (nextIndex) => {
  const generatedAt = new Date().toISOString();
  const version = buildVersionId(generatedAt);

  console.log(`Découpage de ${nextIndex.entryCount} entrées en fichiers équilibrés…`);
  const { shards, bounds } = buildShards(nextIndex.entries);
  console.log(`  ${shards.length} fichiers à publier (version ${version})`);

  const manifest = buildManifest({
    version,
    publishedAt: nextIndex.publishedAt,
    entryCount: nextIndex.entryCount,
    fingerprint: nextIndex.fingerprint,
    generatedAt,
    producer: nextIndex.producer,
    datasetUrl: nextIndex.datasetUrl,
    bounds,
  });

  if (DRY_RUN) {
    console.log('[--dry-run] aucun envoi. Manifeste qui serait publié (bornes omises) :');
    console.log(JSON.stringify({ ...manifest, bounds: `${manifest.bounds.length} bornes` }, null, 2));
    const probeIndex = findShardIndex(PROBE_SIREN, bounds);
    const probeShard = probeIndex === -1 ? {} : shards[probeIndex];
    console.log(
      `[--dry-run] sonde locale ${PROBE_SIREN} -> ${probeShard[PROBE_SIREN] || 'ABSENT'} (fichier ${probeIndex})`
    );
    return;
  }

  const tag = getVersionTag(version);
  console.log(`Création de la release ${tag} (brouillon)…`);
  const release = await createRelease({
    tag_name: tag,
    target_commitish: TARGET_COMMITISH,
    name: `Index DGFiP des numéros de TVA (extraction du ${formatDate(nextIndex.publishedAt)})`,
    body: buildReleaseBody(manifest),
    draft: true,
    prerelease: false,
    make_latest: 'false',
  });

  try {
    console.log('Envoi des fichiers…');
    await uploadShards(release.id, shards);

    console.log('Publication de la release versionnée…');
    await updateRelease(release.id, { draft: false, make_latest: 'false' });

    console.log('Sondes de validation sur les fichiers publiés…');
    await runProbes(version, bounds);
  } catch (error) {
    // Avant la bascule : la version incomplète est retirée, l'ancienne reste
    // active.
    console.error(`Publication interrompue : suppression de la release ${tag}…`);
    await deleteRelease(release.id).catch(() => {});
    await deleteTag(tag).catch(() => {});
    throw error;
  }

  console.log('Remplacement du manifeste (bascule)…');
  await switchManifest(manifest);
  await confirmSwitch(version);

  publishedVersion = version;
};

const main = async () => {
  if (!DRY_RUN && !TOKEN) {
    console.error(
      'Configuration incomplète : GITHUB_TOKEN est requis (fourni par GitHub Actions ; en local : GITHUB_TOKEN="$(gh auth token)").'
    );
    return 1;
  }

  console.log(`Dépôt : ${REPOSITORY} (${DOWNLOAD_BASE_URL})`);

  const result = await updateDgfipVatIndex({
    fetchDataset,
    fetchResource,
    // --force : on ignore l'empreinte de la version active pour republier.
    readCurrentIndex: FORCE ? async () => null : readCurrentIndex,
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
  if (result.outcome === UPDATE_OUTCOMES.UPDATED && !DRY_RUN && publishedVersion) {
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
