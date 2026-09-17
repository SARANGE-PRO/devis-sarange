/**
 * dgfip-vat-shards.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Découpage de l'index DGFiP en fichiers d'effectif équilibré, et nommage des
 * GitHub Releases qui les hébergent.
 *
 * HÉBERGEMENT : les GitHub Releases du dépôt (public). Aucun quota
 * d'opérations, aucun jeton à gérer côté application : la lecture se fait par
 * URL publique, l'écriture par le jeton que GitHub Actions fournit de lui-même.
 * (Vercel Blob a été abandonné : le plan Hobby n'inclut que 2 000 opérations
 * par mois et bloque le magasin trente jours en cas de dépassement.)
 *
 *   release « dgfip-vat »            → current.json      manifeste (pointeur)
 *   release « dgfip-vat-{version} »  → 000.json.gz … 099.json.gz
 *
 * DÉCOUPAGE PAR PLAGES DE SIREN, et non par préfixe : les SIREN étant attribués
 * séquentiellement, un préfixe peut porter 200 000 entreprises et un autre
 * aucune. Les SIREN triés sont répartis en 100 fichiers d'effectif quasi égal
 * (~48 000 entrées, ~300 Ko compressés). Le manifeste porte la borne haute de
 * chaque fichier : le lecteur trouve le bon fichier par dichotomie et ne
 * télécharge jamais l'extraction complète.
 *
 * BASCULE ATOMIQUE : la release versionnée est entièrement publiée (et sondée)
 * avant que le manifeste ne pointe dessus. Tant qu'il pointe l'ancienne
 * version, l'application lit des données cohérentes.
 *
 * Module pur, sans import : testable par le runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const SHARD_COUNT = 100;

// Dépôt hébergeant l'index (surchargeable par DGFIP_INDEX_REPOSITORY).
export const DEFAULT_INDEX_REPOSITORY = 'SARANGE-PRO/devis-sarange';

export const POINTER_TAG = 'dgfip-vat';
export const VERSION_TAG_PREFIX = 'dgfip-vat-';
export const MANIFEST_ASSET = 'current.json';
// Étapes du remplacement du manifeste (les fichiers d'une release sont
// immuables : on téléverse sous un nom provisoire, puis on renomme).
export const PENDING_MANIFEST_ASSET = 'current.json.next';
export const PREVIOUS_MANIFEST_ASSET = 'previous.json';

const SIREN_PATTERN = /^\d{9}$/;
const VERSION_PATTERN = /^\d{8}T\d{6}Z$/;

/** URL publique de téléchargement des fichiers d'une release GitHub. */
export const getReleaseDownloadBaseUrl = (repository = DEFAULT_INDEX_REPOSITORY) =>
  `https://github.com/${repository}/releases/download`;

/** SIREN normalisé (9 chiffres), ou '' s'il est inexploitable. */
export const normalizeSirenKey = (siren) => {
  const digits = typeof siren === 'string' ? siren.replace(/\D/g, '') : '';
  return SIREN_PATTERN.test(digits) ? digits : '';
};

export const getShardName = (index) => `${String(index).padStart(3, '0')}.json.gz`;

export const getVersionTag = (version) => `${VERSION_TAG_PREFIX}${version}`;

/** Version portée par un tag de release, ou '' si ce n'est pas une version. */
export const getVersionFromTag = (tag) => {
  const value = String(tag || '');
  if (!value.startsWith(VERSION_TAG_PREFIX)) return '';

  const version = value.slice(VERSION_TAG_PREFIX.length);
  return VERSION_PATTERN.test(version) ? version : '';
};

// Chemins relatifs à l'URL de base (« {tag}/{fichier} »).
export const getManifestPath = () => `${POINTER_TAG}/${MANIFEST_ASSET}`;
export const getShardPath = (version, index) => `${getVersionTag(version)}/${getShardName(index)}`;

/**
 * Identifiant de version : horodatage compact, utilisable comme segment de
 * chemin et trié naturellement par ordre chronologique.
 */
export const buildVersionId = (generatedAt) => {
  const date = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  const iso = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  return iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
};

/**
 * Répartit les correspondances SIREN → numéro en fichiers d'effectif équilibré.
 *
 * @returns {{shards: object[], bounds: string[]}} `shards[i]` = correspondances
 *   du fichier i ; `bounds[i]` = plus grand SIREN du fichier i (bornes
 *   croissantes, publiées dans le manifeste).
 */
export const buildShards = (entries, shardCount = SHARD_COUNT) => {
  const sirens = Object.keys(entries || {})
    .filter((siren) => SIREN_PATTERN.test(siren))
    .sort();

  if (!sirens.length) return { shards: [], bounds: [] };

  const total = sirens.length;
  const count = Math.max(1, Math.min(Number(shardCount) || SHARD_COUNT, total));
  const shards = [];
  const bounds = [];

  for (let index = 0; index < count; index += 1) {
    const start = Math.floor((index * total) / count);
    const end = Math.floor(((index + 1) * total) / count);
    if (end <= start) continue;

    const shard = {};
    for (let position = start; position < end; position += 1) {
      const siren = sirens[position];
      shard[siren] = entries[siren];
    }

    shards.push(shard);
    bounds.push(sirens[end - 1]);
  }

  return { shards, bounds };
};

/**
 * Fichier contenant (éventuellement) un SIREN : premier fichier dont la borne
 * haute est ≥ au SIREN. -1 si le SIREN est inexploitable ou au-delà de la
 * dernière borne (aucune entreprise de l'extraction ne peut s'y trouver).
 */
export const findShardIndex = (siren, bounds) => {
  const key = normalizeSirenKey(siren);
  if (!key || !Array.isArray(bounds) || !bounds.length) return -1;

  let low = 0;
  let high = bounds.length - 1;
  if (key > bounds[high]) return -1;

  while (low < high) {
    const middle = (low + high) >> 1;
    if (key <= bounds[middle]) high = middle;
    else low = middle + 1;
  }

  return low;
};

/** Manifeste de la version publiée (dgfip-vat/current.json). */
export const buildManifest = ({
  version,
  publishedAt,
  entryCount,
  fingerprint,
  generatedAt,
  producer,
  datasetUrl,
  bounds,
} = {}) => {
  const safeBounds = Array.isArray(bounds) ? bounds.map((bound) => String(bound)) : [];

  return {
    version: String(version || ''),
    // Date de publication de l'extraction DGFiP (documente VERIFIED_DGFIP).
    publishedAt: String(publishedAt || ''),
    entryCount: Number(entryCount || 0),
    fingerprint: String(fingerprint || ''),
    generatedAt: String(generatedAt || ''),
    producer: String(producer || ''),
    datasetUrl: String(datasetUrl || ''),
    shardCount: safeBounds.length,
    bounds: safeBounds,
  };
};

/**
 * Manifeste lu depuis le magasin : null s'il est inexploitable (l'application
 * retombe alors sur ses replis plutôt que de lire des fichiers incohérents).
 */
export const normalizeManifest = (raw) => {
  if (!raw || typeof raw !== 'object') return null;

  const manifest = buildManifest(raw);
  const boundsValid =
    manifest.bounds.length > 0 &&
    manifest.bounds.every((bound) => SIREN_PATTERN.test(bound)) &&
    manifest.bounds.every((bound, index) => index === 0 || bound > manifest.bounds[index - 1]);

  return VERSION_PATTERN.test(manifest.version) && manifest.entryCount > 0 && boundsValid
    ? manifest
    : null;
};

/**
 * Versions à supprimer après une bascule réussie.
 *
 * On conserve la version active et les `keep` versions les plus récentes qui
 * ne lui sont pas postérieures (jamais moins de deux). Une version PLUS RÉCENTE
 * que l'active ne peut être qu'une publication interrompue avant la bascule
 * (les publications sont sérialisées) : elle est supprimée.
 */
export const getVersionsToPrune = (versions, activeVersion, keep = 2) => {
  const safeKeep = Math.max(2, Number(keep) || 2);
  const unique = [...new Set((versions || []).filter(Boolean))].sort().reverse();
  const candidates = activeVersion ? unique.filter((version) => version <= activeVersion) : unique;

  const retained = new Set([activeVersion, ...candidates.slice(0, safeKeep)].filter(Boolean));

  return unique.filter((version) => !retained.has(version));
};
