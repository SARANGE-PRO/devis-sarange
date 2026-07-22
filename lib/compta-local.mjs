/**
 * compta-local.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistance LOCALE de l'onglet Compta (export Sage 50).
 *
 * L'onglet est conçu pour le poste où Sage 50 est installé : la génération et
 * le téléchargement du CSV ne dépendent JAMAIS de Firestore. Les paramètres et
 * l'historique des exports (statuts, empreintes anti-doublon, CSV archivés)
 * vivent dans le localStorage du navigateur, sous des clés versionnées et
 * liées à l'utilisateur :
 *
 *   sarange.compta.settings.v1.{uid}
 *   sarange.compta.exports.v1.{uid}
 *
 * Le stockage est INJECTABLE (localStorage par défaut côté navigateur), ce qui
 * rend le module testable par le runner Node du projet. Aucun import '@/'.
 * La synchronisation Firestore, facultative, est gérée ailleurs
 * (lib/firebase/compta.js) et n'est qu'un miroir best-effort.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { SAGE_EXPORT_FORMAT_VERSION, normalizeComptaSettings } from './sage-export.mjs';

const STORAGE_VERSION = 'v1';

// Garde-fou quota localStorage : on conserve au plus N exports (les CSV sont
// archivés dans les enregistrements). Les plus anciens sont écartés.
export const COMPTA_EXPORTS_MAX_RECORDS = 150;

export const getComptaSettingsStorageKey = (uid) =>
  `sarange.compta.settings.${STORAGE_VERSION}.${uid || 'local'}`;

export const getComptaExportsStorageKey = (uid) =>
  `sarange.compta.exports.${STORAGE_VERSION}.${uid || 'local'}`;

const getDefaultStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readJson = (storage, key) => {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Donnée corrompue ou stockage inaccessible → on repart des défauts.
    return null;
  }
};

// L'écriture laisse remonter les erreurs (quota plein…) : l'appelant décide
// quoi en faire — jamais bloquer un téléchargement pour autant.
const writeJson = (storage, key, value) => {
  if (!storage) throw new Error('Stockage local indisponible.');
  storage.setItem(key, JSON.stringify(value));
};

/* ─── Paramètres Sage ────────────────────────────────────────────────────── */
export const loadLocalComptaSettings = (uid, storage = getDefaultStorage()) =>
  normalizeComptaSettings(readJson(storage, getComptaSettingsStorageKey(uid)) || {});

export const saveLocalComptaSettings = (uid, settings, storage = getDefaultStorage()) => {
  const normalized = normalizeComptaSettings(settings);
  writeJson(storage, getComptaSettingsStorageKey(uid), normalized);
  return normalized;
};

/* ─── Historique des exports ─────────────────────────────────────────────── */
export const loadLocalComptaExports = (uid, storage = getDefaultStorage()) => {
  const list = readJson(storage, getComptaExportsStorageKey(uid));
  if (!Array.isArray(list)) return [];
  return list.filter((record) => record && typeof record === 'object' && record.id);
};

const persistExports = (uid, records, storage) => {
  const bounded = records.slice(0, COMPTA_EXPORTS_MAX_RECORDS);
  writeJson(storage, getComptaExportsStorageKey(uid), bounded);
  return bounded;
};

/**
 * Construit l'enregistrement d'export complet à partir du modèle Sage.
 * Utilisé tel quel pour l'historique local ET pour le miroir Firestore
 * facultatif (mêmes données, même id).
 */
export const buildComptaExportRecord = ({
  quote,
  model,
  csvContent,
  filename,
  contentHash,
  version = 1,
  generatedBy = null,
  id = null,
  now = new Date(),
}) => {
  const nowIso = now.toISOString();
  return {
    id: id || `exp-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    quoteId: quote?.id || null,
    quoteTitle: quote?.title || null,
    quoteNumber: quote?.quoteNumber || null,
    clientName: model.document.clientName || null,
    externalId: model.document.externalId || null,
    referenceDevis: model.document.referenceDevis || null,
    pieceType: model.document.pieceType,
    clientCode: model.document.clientCode,
    status: 'generated',
    version,
    formatVersion: SAGE_EXPORT_FORMAT_VERSION,
    filename,
    contentHash,
    csvContent,
    lineCount: model.lines.length,
    // Désignation COMPLÈTE archivée ligne par ligne (la troncature
    // maxDesignationLength ne concerne que la valeur CSV envoyée à Sage).
    lines: model.lines.map((line) => ({
      order: line.order,
      nature: line.nature,
      sageArticle: line.sageArticle || null,
      designation: line.designation || null,
      designationFull: line.designationFull || null,
      quantity: line.quantity,
      unitPriceHT: line.unitPriceHT,
      lineHT: line.lineHT,
      tvaRate: line.tvaRate,
      regimeId: line.regimeId || null,
    })),
    totalHT: model.totals.totalHT,
    totalTva: model.totals.exportedTva,
    totalTTC: model.totals.exportedTTC,
    vatBreakdown: model.vatBreakdown.map((bucket) => ({
      regimeId: bucket.regimeId,
      regimeLabel: bucket.regimeLabel,
      rate: bucket.rate,
      totalHT: bucket.totalHT,
      tva: bucket.tva,
    })),
    generatedAtIso: nowIso,
    generatedBy: generatedBy
      ? { uid: generatedBy.uid || null, email: generatedBy.email || null }
      : null,
    importedAtIso: null,
    cancelledAtIso: null,
    replacedByExportId: null,
    errorMessage: null,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
};

/**
 * Ajoute un export à l'historique local. Si `replacesExportId` est fourni,
 * l'ancien export passe en « Remplacé » (l'historique des versions est
 * conservé, jamais écrasé).
 * @returns {{record: object, records: object[]}} l'enregistrement et la liste à jour
 */
export const createLocalComptaExport = ({
  uid,
  record,
  replacesExportId = null,
  storage = getDefaultStorage(),
  now = new Date(),
}) => {
  if (!record?.id) throw new Error("Enregistrement d'export invalide.");
  const nowIso = now.toISOString();

  const existing = loadLocalComptaExports(uid, storage).map((entry) =>
    entry.id === replacesExportId
      ? { ...entry, status: 'replaced', replacedByExportId: record.id, updatedAtIso: nowIso }
      : entry
  );

  const records = persistExports(uid, [record, ...existing], storage);
  return { record, records };
};

/**
 * Change le statut d'un export local (imported / cancelled).
 * @returns {{record: object, records: object[]}}
 */
export const updateLocalComptaExportStatus = ({
  uid,
  exportId,
  status,
  storage = getDefaultStorage(),
  now = new Date(),
}) => {
  if (!['imported', 'cancelled'].includes(status)) {
    throw new Error(`Statut d'export non géré : ${status}`);
  }

  const nowIso = now.toISOString();
  let updated = null;
  const next = loadLocalComptaExports(uid, storage).map((entry) => {
    if (entry.id !== exportId) return entry;
    updated = {
      ...entry,
      status,
      updatedAtIso: nowIso,
      ...(status === 'imported' ? { importedAtIso: nowIso } : {}),
      ...(status === 'cancelled' ? { cancelledAtIso: nowIso } : {}),
    };
    return updated;
  });

  if (!updated) throw new Error('Export introuvable.');
  const records = persistExports(uid, next, storage);
  return { record: updated, records };
};

/* ─── Export / import JSON de la configuration ───────────────────────────── */
export const COMPTA_CONFIG_FILE_TYPE = 'sarange-compta-config';
export const COMPTA_CONFIG_FILE_VERSION = 1;

/** Sérialise les paramètres Sage pour sauvegarde/restauration sur fichier. */
export const buildComptaConfigJson = (settings, now = new Date()) =>
  JSON.stringify(
    {
      type: COMPTA_CONFIG_FILE_TYPE,
      version: COMPTA_CONFIG_FILE_VERSION,
      exportedAt: now.toISOString(),
      settings: normalizeComptaSettings(settings),
    },
    null,
    2
  );

/**
 * Relit un fichier de configuration Compta. Rejette clairement tout fichier
 * qui n'en est pas un ; renvoie des paramètres normalisés prêts à enregistrer.
 */
export const parseComptaConfigJson = (text) => {
  let parsed;
  try {
    parsed = JSON.parse(String(text || ''));
  } catch {
    throw new Error('Fichier illisible : ce n’est pas un JSON valide.');
  }

  if (parsed?.type !== COMPTA_CONFIG_FILE_TYPE || !parsed?.settings || typeof parsed.settings !== 'object') {
    throw new Error('Ce fichier n’est pas une configuration Compta Sarange.');
  }

  return normalizeComptaSettings(parsed.settings);
};
