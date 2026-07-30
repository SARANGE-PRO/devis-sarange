/**
 * dgfip-vat-index-builder.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Construction de l'index local des numéros de TVA à partir du jeu de données
 * officiel de la DGFiP publié sur data.gouv.fr.
 *
 * Toute la logique est ici, avec des dépendances INJECTÉES (réseau, disque,
 * horloge) : le script scripts/update-dgfip-vat-index.mjs se contente de les
 * brancher, et les tests couvrent chaque scénario sans réseau.
 *
 * Garanties :
 *  - le producteur déclaré du jeu de données doit être la DGFiP ;
 *  - la ressource n'est retéléchargée que si son empreinte (checksum, ETag ou
 *    date de publication) diffère de celle du dernier index construit ;
 *  - l'index n'est remplacé que s'il est ENTIÈREMENT valide ; sinon le dernier
 *    index valide est conservé ;
 *  - aucune erreur n'est propagée : la mise à jour échoue sans jamais
 *    interrompre l'application.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const DGFIP_PRODUCER_PATTERN = /dgfip|direction g[ée]n[ée]rale des finances publiques/i;
const SUPPORTED_FORMATS = ['csv', 'json'];
const SIREN_PATTERN = /^\d{9}$/;
const FR_VAT_PATTERN = /^FR[0-9A-Z]{2}\d{9}$/;
const STALE_AFTER_DAYS = 7;

export const DGFIP_INDEX_STALE_ALERT =
  'L’index DGFiP des numéros de TVA n’a pas été actualisé depuis plus de sept jours. Les vérifications peuvent utiliser des données anciennes.';

export const UPDATE_OUTCOMES = Object.freeze({
  UPDATED: 'updated',
  UNCHANGED: 'unchanged',
  REJECTED_PRODUCER: 'rejected-producer',
  NO_RESOURCE: 'no-resource',
  DOWNLOAD_FAILED: 'download-failed',
  INVALID_INDEX: 'invalid-index',
  METADATA_FAILED: 'metadata-failed',
});

// Seul un index actualisé ou une ressource inchangée valent succès : tout le
// reste doit être détecté par la supervision (code de sortie non nul).
export const isSuccessfulUpdate = (outcome) =>
  outcome === UPDATE_OUTCOMES.UPDATED || outcome === UPDATE_OUTCOMES.UNCHANGED;

// Motifs de refus d'un index construit.
export const REJECTION_REASONS = Object.freeze({
  EMPTY: 'index-vide',
  UNREADABLE_ROWS: 'lignes-illisibles',
  ENTRY_COUNT_DROP: 'baisse-anormale-du-nombre-entrees',
  MISSING_COLUMNS: 'colonnes-introuvables',
  INVALID_SIREN: 'siren-format-invalide',
  INVALID_VAT: 'tva-format-invalide',
  WRITE_FAILED: 'ecriture-impossible',
});

// Au-delà de 10 % de lignes illisibles, le fichier est considéré corrompu.
const DEFAULT_MAX_REJECTED_RATIO = 0.1;
// En dessous de 90 % des entrées précédentes, la baisse est jugée anormale.
const DEFAULT_MIN_RETAINED_RATIO = 0.9;

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/* ─── Vérifications ──────────────────────────────────────────────────────── */

// Rôles data.gouv.fr valant « producteur » ou « éditeur » du jeu de données.
const PRODUCER_ROLES = ['creator', 'publisher', 'producer', 'editor'];

/**
 * Le producteur / éditeur déclaré est-il bien la DGFiP ?
 *
 * Sur data.gouv.fr, le jeu officiel est porté par l'organisation « Ministères
 * économiques et financiers » et déclare la DGFiP dans `contact_points`
 * (rôle « publisher »). Les deux emplacements sont donc contrôlés.
 */
export const getDgfipProducerLabel = (dataset) => {
  const directCandidates = [
    dataset?.organization?.name,
    dataset?.organization?.acronym,
    dataset?.owner?.name,
    dataset?.publisher,
    dataset?.producer,
  ];

  const directMatch = directCandidates
    .map((candidate) => text(candidate))
    .find((candidate) => DGFIP_PRODUCER_PATTERN.test(candidate));

  if (directMatch) return directMatch;

  const contactPoints = Array.isArray(dataset?.contact_points) ? dataset.contact_points : [];
  const contactMatch = contactPoints.find(
    (contact) =>
      PRODUCER_ROLES.includes(text(contact?.role).toLowerCase()) &&
      DGFIP_PRODUCER_PATTERN.test(text(contact?.name))
  );

  return contactMatch ? text(contactMatch.name) : '';
};

export const isDgfipProducer = (dataset) => Boolean(getDgfipProducerLabel(dataset));

/** Ressource CSV/JSON la plus récente du jeu de données. */
export const selectLatestResource = (dataset) => {
  const resources = Array.isArray(dataset?.resources) ? dataset.resources : [];

  const usable = resources
    .filter((resource) => SUPPORTED_FORMATS.includes(text(resource?.format).toLowerCase()))
    .filter((resource) => text(resource?.url));

  if (!usable.length) return null;

  const publishedTime = (resource) => {
    const raw = text(resource?.last_modified) || text(resource?.created_at);
    const parsed = raw ? Date.parse(raw) : Number.NaN;
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  return usable.reduce((latest, resource) =>
    publishedTime(resource) > publishedTime(latest) ? resource : latest
  );
};

/** Empreinte de la ressource : checksum, à défaut ETag, à défaut date. */
export const getResourceFingerprint = (resource) =>
  text(resource?.checksum?.value) ||
  text(resource?.etag) ||
  text(resource?.last_modified) ||
  text(resource?.created_at);

/* ─── Analyse du fichier ─────────────────────────────────────────────────── */

const detectSeparator = (headerLine) => {
  const candidates = [';', ',', '\t', '|'];
  return candidates.reduce((best, candidate) =>
    headerLine.split(candidate).length > headerLine.split(best).length ? candidate : best
  );
};

const findColumnIndex = (headers, rows, { namePattern, isValidValue }) => {
  const byName = headers.findIndex((header) => namePattern.test(header));
  if (byName !== -1) return byName;

  // Repli : la colonne dont les valeurs ont la bonne forme.
  const sample = rows.slice(0, 20);
  for (let index = 0; index < headers.length; index += 1) {
    const matches = sample.filter((row) => isValidValue(text(row[index])));
    if (matches.length && matches.length >= Math.ceil(sample.length / 2)) return index;
  }

  return -1;
};

/**
 * Normalise un n° de TVA de l'extraction. Le fichier officiel publie le numéro
 * SANS le préfixe pays (« 36888249281 ») : on le rétablit avant contrôle.
 */
const normalizeExtractedVatNumber = (raw) => {
  const cleaned = text(raw).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!cleaned) return '';

  const withCountryCode = cleaned.startsWith('FR') ? cleaned : `FR${cleaned}`;
  return FR_VAT_PATTERN.test(withCountryCode) ? withCountryCode : '';
};

// Le SIREN correspond aux 9 derniers chiffres du numéro (FR + clé + SIREN).
const getSirenFromVatNumber = (vatNumber) => vatNumber.slice(4);

// Compte rendu de lecture : lignes totales, acceptées, rejetées et motifs.
const createReport = () => ({ entries: {}, totalRows: 0, acceptedRows: 0, rejectedRows: 0, reasons: {} });

const rejectRow = (report, reason, count = 1) => {
  report.rejectedRows += count;
  report.reasons[reason] = (report.reasons[reason] || 0) + count;
};

const finalizeReport = (report) => {
  const [mainRejectionReason = ''] =
    Object.entries(report.reasons).sort(([, left], [, right]) => right - left)[0] || [];

  return {
    entries: report.entries,
    totalRows: report.totalRows,
    acceptedRows: report.acceptedRows,
    rejectedRows: report.rejectedRows,
    rejectionReasons: report.reasons,
    mainRejectionReason,
  };
};

const parseCsvEntries = (content) => {
  const report = createReport();
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return report;

  const separator = detectSeparator(lines[0]);
  const headers = lines[0]
    .split(separator)
    .map((header) => text(header).replace(/^"|"$/g, '').toLowerCase());
  const rows = lines
    .slice(1)
    .map((line) => line.split(separator).map((cell) => text(cell).replace(/^"|"$/g, '')));

  report.totalRows = rows.length;

  const sirenIndex = findColumnIndex(headers, rows, {
    namePattern: /siren/,
    isValidValue: (value) => SIREN_PATTERN.test(value.replace(/\D/g, '')),
  });
  const vatIndex = findColumnIndex(headers, rows, {
    namePattern: /tva|vat/,
    isValidValue: (value) => Boolean(normalizeExtractedVatNumber(value)),
  });

  // Le n° de TVA est indispensable ; le SIREN, lui, peut en être déduit
  // (l'extraction officielle ne publie que la colonne du numéro).
  if (vatIndex === -1) {
    rejectRow(report, REJECTION_REASONS.MISSING_COLUMNS, rows.length);
    return report;
  }

  rows.forEach((row) => {
    const vatNumber = normalizeExtractedVatNumber(row[vatIndex]);

    if (!vatNumber) {
      rejectRow(report, REJECTION_REASONS.INVALID_VAT);
      return;
    }

    const siren =
      sirenIndex === -1
        ? getSirenFromVatNumber(vatNumber)
        : text(row[sirenIndex]).replace(/\D/g, '');

    if (!SIREN_PATTERN.test(siren)) {
      rejectRow(report, REJECTION_REASONS.INVALID_SIREN);
      return;
    }

    report.entries[siren] = vatNumber;
    report.acceptedRows += 1;
  });

  return report;
};

const parseJsonEntries = (content) => {
  const report = createReport();
  const parsed = JSON.parse(content);
  const rows = Array.isArray(parsed) ? parsed : parsed?.data || parsed?.results || [];

  if (!Array.isArray(rows)) return report;

  report.totalRows = rows.length;

  rows.forEach((row) => {
    if (!row || typeof row !== 'object') {
      rejectRow(report, REJECTION_REASONS.MISSING_COLUMNS);
      return;
    }

    let siren = '';
    let vatNumber = '';

    for (const [key, value] of Object.entries(row)) {
      if (typeof value !== 'string' && typeof value !== 'number') continue;
      const raw = String(value);
      const normalizedKey = key.toLowerCase();

      if (!siren && /siren/.test(normalizedKey) && SIREN_PATTERN.test(raw.replace(/\D/g, ''))) {
        siren = raw.replace(/\D/g, '');
      }
      if (!vatNumber && /tva|vat/.test(normalizedKey)) {
        vatNumber = normalizeExtractedVatNumber(raw);
      }
    }

    if (!vatNumber) {
      rejectRow(report, REJECTION_REASONS.INVALID_VAT);
      return;
    }

    // SIREN déduit du numéro lorsque l'extraction ne le publie pas.
    if (!siren) siren = getSirenFromVatNumber(vatNumber);

    if (!SIREN_PATTERN.test(siren)) {
      rejectRow(report, REJECTION_REASONS.INVALID_SIREN);
      return;
    }

    report.entries[siren] = vatNumber;
    report.acceptedRows += 1;
  });

  return report;
};

/**
 * Lecture du fichier téléchargé.
 * @returns {{entries: object, totalRows: number, acceptedRows: number,
 *            rejectedRows: number, rejectionReasons: object,
 *            mainRejectionReason: string}}
 */
export const buildIndexEntries = (content, format) => {
  const body = typeof content === 'string' ? content : '';
  if (!body.trim()) return finalizeReport(createReport());

  try {
    return finalizeReport(
      text(format).toLowerCase() === 'json' ? parseJsonEntries(body) : parseCsvEntries(body)
    );
  } catch {
    return finalizeReport(createReport());
  }
};

/**
 * Refus d'un index manifestement corrompu : vide, trop de lignes illisibles,
 * ou effondrement du nombre d'entrées par rapport à l'index précédent.
 * @returns {string} motif de refus, ou '' si l'index est acceptable
 */
export const getIndexRejectionReason = (
  report,
  {
    previousEntryCount = 0,
    minEntries = 1,
    maxRejectedRatio = DEFAULT_MAX_REJECTED_RATIO,
    minRetainedRatio = DEFAULT_MIN_RETAINED_RATIO,
  } = {}
) => {
  if (!report || report.acceptedRows < Math.max(1, minEntries)) {
    return REJECTION_REASONS.EMPTY;
  }

  const rejectedRatio = report.totalRows > 0 ? report.rejectedRows / report.totalRows : 0;
  if (rejectedRatio > maxRejectedRatio) {
    return REJECTION_REASONS.UNREADABLE_ROWS;
  }

  if (previousEntryCount > 0 && report.acceptedRows < previousEntryCount * minRetainedRatio) {
    return REJECTION_REASONS.ENTRY_COUNT_DROP;
  }

  return '';
};

/* ─── Fraîcheur de l'index ───────────────────────────────────────────────── */

export const getDgfipIndexAge = (refreshedAt, now = new Date()) => {
  const parsed = refreshedAt ? Date.parse(refreshedAt) : Number.NaN;
  if (Number.isNaN(parsed)) return null;

  const reference = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return Math.floor((reference.getTime() - parsed) / (24 * 60 * 60 * 1000));
};

export const isDgfipIndexStale = (refreshedAt, now = new Date()) => {
  const ageInDays = getDgfipIndexAge(refreshedAt, now);
  return ageInDays === null || ageInDays > STALE_AFTER_DAYS;
};

export const getDgfipIndexStaleAlert = (metadata, now = new Date()) =>
  isDgfipIndexStale(metadata?.refreshedAt, now) ? DGFIP_INDEX_STALE_ALERT : '';

/* ─── Supervision ────────────────────────────────────────────────────────── */

// Volume plancher : l'extraction officielle compte ~4,8 millions de numéros.
// En dessous de ce seuil, l'index est considéré anormalement faible.
export const DEFAULT_MIN_HEALTHY_ENTRIES = 1000000;

export const HEALTH_ISSUES = Object.freeze({
  MISSING: 'index-absent',
  STALE: 'index-obsolete',
  LOW_ENTRY_COUNT: 'volume-anormalement-faible',
});

const HEALTH_MESSAGES = Object.freeze({
  [HEALTH_ISSUES.MISSING]:
    'L’index DGFiP des numéros de TVA est absent ou illisible : les vérifications ne peuvent pas s’appuyer sur la source officielle.',
  [HEALTH_ISSUES.STALE]: DGFIP_INDEX_STALE_ALERT,
  [HEALTH_ISSUES.LOW_ENTRY_COUNT]:
    'L’index DGFiP contient un nombre d’entrées anormalement faible : son contenu est suspect.',
});

export const getDgfipIndexHealthMessage = (issue) => HEALTH_MESSAGES[issue] || '';

/**
 * État de santé de l'index pour la supervision.
 * @returns {{isHealthy: boolean, issues: string[], alerts: string[], entryCount: number, ageInDays: number|null}}
 */
export const getDgfipIndexHealth = (
  metadata,
  { now = new Date(), minEntries = DEFAULT_MIN_HEALTHY_ENTRIES } = {}
) => {
  const issues = [];

  if (!metadata) {
    issues.push(HEALTH_ISSUES.MISSING);
  } else {
    if (isDgfipIndexStale(metadata.refreshedAt, now)) issues.push(HEALTH_ISSUES.STALE);
    if (Number(metadata.entryCount || 0) < minEntries) issues.push(HEALTH_ISSUES.LOW_ENTRY_COUNT);
  }

  return {
    isHealthy: issues.length === 0,
    issues,
    alerts: issues.map((issue) => getDgfipIndexHealthMessage(issue)),
    entryCount: Number(metadata?.entryCount || 0),
    ageInDays: metadata ? getDgfipIndexAge(metadata.refreshedAt, now) : null,
  };
};

/* ─── Orchestration ──────────────────────────────────────────────────────── */

/**
 * Met à jour l'index local. Ne lève jamais : retourne toujours un compte rendu.
 *
 * @param {object} deps
 * @param {() => Promise<object>} deps.fetchDataset       métadonnées data.gouv.fr
 * @param {(resource) => Promise<{content: string, etag?: string}>} deps.fetchResource
 * @param {() => Promise<object|null>} deps.readCurrentIndex
 * @param {(index) => Promise<void>} deps.writeIndexAtomically
 * @param {() => Date} [deps.now]
 * @param {number} [deps.minEntries] seuil minimal de validité de l'index
 */
export const updateDgfipVatIndex = async ({
  fetchDataset,
  fetchResource,
  readCurrentIndex,
  writeIndexAtomically,
  now = () => new Date(),
  minEntries = 1,
  maxRejectedRatio = DEFAULT_MAX_REJECTED_RATIO,
  minRetainedRatio = DEFAULT_MIN_RETAINED_RATIO,
} = {}) => {
  let dataset = null;

  try {
    dataset = await fetchDataset();
  } catch (error) {
    return { outcome: UPDATE_OUTCOMES.METADATA_FAILED, message: error?.message || '' };
  }

  if (!isDgfipProducer(dataset)) {
    return {
      outcome: UPDATE_OUTCOMES.REJECTED_PRODUCER,
      message:
        "Producteur du jeu de données non reconnu : l'index n'a pas été mis à jour.",
    };
  }

  const resource = selectLatestResource(dataset);
  if (!resource) {
    return {
      outcome: UPDATE_OUTCOMES.NO_RESOURCE,
      message: 'Aucune ressource CSV ou JSON exploitable dans le jeu de données.',
    };
  }

  const currentIndex = await readCurrentIndex().catch(() => null);
  const previousEntryCount = Number(currentIndex?.metadata?.entryCount || 0);
  const fingerprint = getResourceFingerprint(resource);

  // Ressource inchangée : aucun téléchargement, et ce n'est PAS un échec.
  if (fingerprint && fingerprint === text(currentIndex?.metadata?.fingerprint)) {
    return {
      outcome: UPDATE_OUTCOMES.UNCHANGED,
      fingerprint,
      entryCount: previousEntryCount,
    };
  }

  let downloaded = null;
  try {
    downloaded = await fetchResource(resource);
  } catch (error) {
    // Téléchargement interrompu : le dernier index valide est conservé.
    return { outcome: UPDATE_OUTCOMES.DOWNLOAD_FAILED, message: error?.message || '' };
  }

  const report = buildIndexEntries(downloaded?.content, resource.format);
  const entries = report.entries;
  const entryCount = report.acceptedRows;
  const readStats = {
    totalRows: report.totalRows,
    acceptedRows: report.acceptedRows,
    rejectedRows: report.rejectedRows,
    mainRejectionReason: report.mainRejectionReason,
    entryCount,
    previousEntryCount,
  };

  // Fichier manifestement corrompu : on NE remplace PAS l'ancien index.
  const rejectionReason = getIndexRejectionReason(report, {
    previousEntryCount,
    minEntries,
    maxRejectedRatio,
    minRetainedRatio,
  });

  if (rejectionReason) {
    return { outcome: UPDATE_OUTCOMES.INVALID_INDEX, reason: rejectionReason, ...readStats };
  }

  const downloadedAt = now().toISOString();
  const nextIndex = {
    // Producteur/éditeur DGFiP tel que déclaré dans le jeu de données : c'est
    // CETTE valeur que le lecteur revérifie avant d'exploiter l'index.
    producer: getDgfipProducerLabel(dataset),
    // Organisation porteuse sur data.gouv.fr (ministères économiques et
    // financiers pour le jeu officiel), conservée à titre documentaire.
    publisherOrganization: text(dataset?.organization?.name),
    datasetTitle: text(dataset?.title),
    datasetUrl: text(dataset?.page) || text(dataset?.uri),
    resourceUrl: text(resource?.url),
    publishedAt: text(resource?.last_modified) || text(resource?.created_at),
    downloadedAt,
    refreshedAt: downloadedAt,
    fingerprint: fingerprint || text(downloaded?.etag),
    entryCount,
    entries,
  };

  try {
    // Remplacement ATOMIQUE, uniquement maintenant que l'index est complet.
    await writeIndexAtomically(nextIndex);
  } catch (error) {
    return {
      outcome: UPDATE_OUTCOMES.INVALID_INDEX,
      reason: REJECTION_REASONS.WRITE_FAILED,
      message: error?.message || '',
      ...readStats,
    };
  }

  return {
    outcome: UPDATE_OUTCOMES.UPDATED,
    fingerprint: nextIndex.fingerprint,
    publishedAt: nextIndex.publishedAt,
    ...readStats,
  };
};
