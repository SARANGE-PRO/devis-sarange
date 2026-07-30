/**
 * dgfip-vat-shards.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Découpage de l'index DGFiP en 1000 fichiers, un par préfixe des TROIS
 * premiers chiffres du SIREN. Une vérification ne télécharge ainsi qu'un seul
 * fichier (~40 Ko compressé) au lieu des 128 Mo de l'extraction complète.
 *
 * Arborescence publiée :
 *   dgfip-vat/{version}/000.json.gz … 999.json.gz   correspondances SIREN → TVA
 *   dgfip-vat/current.json                          manifeste de la version active
 *
 * Le manifeste est publié EN DERNIER : tant qu'il pointe l'ancienne version,
 * l'application continue de lire des données cohérentes (bascule atomique).
 *
 * Module pur, sans import : testable par le runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const SHARD_PREFIX_LENGTH = 3;
export const SHARD_COUNT = 1000;
export const BLOB_ROOT = 'dgfip-vat';
export const MANIFEST_PATH = `${BLOB_ROOT}/current.json`;

const SIREN_PATTERN = /^\d{9}$/;

/** Préfixe de découpage d'un SIREN (« 820001014 » → « 820 »). */
export const getSirenPrefix = (siren) => {
  const digits = typeof siren === 'string' ? siren.replace(/\D/g, '') : '';
  return SIREN_PATTERN.test(digits) ? digits.slice(0, SHARD_PREFIX_LENGTH) : '';
};

export const getShardPath = (version, prefix) =>
  `${BLOB_ROOT}/${version}/${prefix}.json.gz`;

/**
 * Identifiant de version : horodatage compact, utilisable comme segment de
 * chemin et trié naturellement par ordre chronologique.
 */
export const buildVersionId = (generatedAt) => {
  const date = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  const iso = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  return iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
};

/** Version extraite d'un chemin de blob, ou '' si le chemin n'en porte pas. */
export const getVersionFromPath = (pathname) => {
  const match = /^dgfip-vat\/([^/]+)\/\d{3}\.json\.gz$/.exec(String(pathname || ''));
  return match ? match[1] : '';
};

/**
 * Regroupe les correspondances par préfixe.
 * @returns {Map<string, object>} préfixe → { siren: numéro }
 */
export const buildShards = (entries) => {
  const shards = new Map();

  for (const [siren, vatNumber] of Object.entries(entries || {})) {
    const prefix = getSirenPrefix(siren);
    if (!prefix) continue;

    let shard = shards.get(prefix);
    if (!shard) {
      shard = {};
      shards.set(prefix, shard);
    }
    shard[siren] = vatNumber;
  }

  return shards;
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
  shardCount,
} = {}) => ({
  version: String(version || ''),
  // Date de publication de l'extraction DGFiP (documente VERIFIED_DGFIP).
  publishedAt: String(publishedAt || ''),
  entryCount: Number(entryCount || 0),
  fingerprint: String(fingerprint || ''),
  generatedAt: String(generatedAt || ''),
  producer: String(producer || ''),
  datasetUrl: String(datasetUrl || ''),
  shardCount: Number(shardCount || 0),
});

export const normalizeManifest = (raw) => {
  if (!raw || typeof raw !== 'object') return null;

  const manifest = buildManifest(raw);
  return manifest.version && manifest.entryCount > 0 ? manifest : null;
};

/**
 * Versions à supprimer : on conserve les `keep` plus récentes (la version
 * active comprise), jamais moins de deux.
 */
export const getVersionsToPrune = (versions, activeVersion, keep = 2) => {
  const safeKeep = Math.max(2, Number(keep) || 2);
  const unique = [...new Set((versions || []).filter(Boolean))].sort().reverse();

  // La version active est toujours conservée, où qu'elle se trouve.
  const retained = new Set([activeVersion, ...unique.slice(0, safeKeep)].filter(Boolean));

  return unique.filter((version) => !retained.has(version));
};
