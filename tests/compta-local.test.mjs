import assert from 'node:assert/strict';

import {
  COMPTA_EXPORTS_MAX_RECORDS,
  buildComptaConfigJson,
  buildComptaExportRecord,
  createLocalComptaExport,
  getComptaExportsStorageKey,
  getComptaSettingsStorageKey,
  loadLocalComptaExports,
  loadLocalComptaSettings,
  parseComptaConfigJson,
  saveLocalComptaSettings,
  updateLocalComptaExportStatus,
} from '../lib/compta-local.mjs';

/* ─── Stockage simulé (l'app injecte window.localStorage) ─────────────────── */
const createFakeStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    _map: map,
  };
};

const buildFakeModel = () => ({
  document: {
    quoteId: 'q1',
    externalId: 'DV-262021715',
    pieceType: 'COMMANDE',
    clientCode: 'ZZZIMPORT',
    clientLabel: 'CLIENT À COMPLÉTER',
    clientName: 'Jean Dupont',
    referenceDevis: 'Chantier Dupont',
    dateLabel: '21/07/2026',
  },
  lines: [
    {
      order: 1,
      nature: 'fourniture',
      sageArticle: 'IMP100',
      designation: 'Fenêtre PVC (tronquée)…',
      designationFull: 'Fenêtre PVC (version complète, jamais tronquée pour l’historique)',
      quantity: 2,
      unitPriceHT: 728.11,
      lineHT: 1456.22,
      tvaRate: 10,
      regimeId: 'tva-10',
    },
  ],
  totals: { totalHT: 1456.22, exportedTva: 145.62, exportedTTC: 1601.84, exportedHT: 1456.22 },
  vatBreakdown: [
    { regimeId: 'tva-10', regimeLabel: 'TVA 10 %', rate: 10, totalHT: 1456.22, tva: 145.62 },
  ],
});

/* ─── Clés locales versionnées et liées à l'utilisateur ───────────────────── */
{
  assert.equal(getComptaSettingsStorageKey('abc123'), 'sarange.compta.settings.v1.abc123');
  assert.equal(getComptaExportsStorageKey('abc123'), 'sarange.compta.exports.v1.abc123');
  assert.equal(getComptaSettingsStorageKey(null), 'sarange.compta.settings.v1.local', 'repli sans uid');
  assert.equal(getComptaExportsStorageKey(''), 'sarange.compta.exports.v1.local');
}

/* ─── Paramètres : défauts, aller-retour, données corrompues ──────────────── */
{
  const storage = createFakeStorage();
  const defaults = loadLocalComptaSettings('u1', storage);
  assert.equal(defaults.placeholderClientCode, 'ZZZIMPORT', 'défauts utilisables sans réglage local');
  assert.equal(defaults.firestoreSync, false, 'mode local uniquement par défaut');

  const saved = saveLocalComptaSettings(
    'u1',
    { placeholderClientCode: 'ZZDIVERS', firestoreSync: true, columnSeparator: '|' },
    storage
  );
  assert.equal(saved.placeholderClientCode, 'ZZDIVERS');
  assert.equal(saved.firestoreSync, true, 'synchronisation activable explicitement');
  assert.equal(saved.columnSeparator, ';', 'valeur invalide normalisée');

  const reloaded = loadLocalComptaSettings('u1', storage);
  assert.deepEqual(reloaded, saved, 'aller-retour localStorage fidèle');

  const other = loadLocalComptaSettings('u2', storage);
  assert.equal(other.placeholderClientCode, 'ZZZIMPORT', 'cloisonnement par uid');

  storage.setItem(getComptaSettingsStorageKey('u1'), '{corrompu');
  const recovered = loadLocalComptaSettings('u1', storage);
  assert.equal(recovered.placeholderClientCode, 'ZZZIMPORT', 'JSON corrompu → défauts');
}

/* ─── Enregistrement d'export : désignation complète archivée ─────────────── */
{
  const record = buildComptaExportRecord({
    quote: { id: 'q1', title: 'Devis Dupont', quoteNumber: 'DV-262021715' },
    model: buildFakeModel(),
    csvContent: 'E;COMMANDE;...',
    filename: 'sage_dv-262021715_v1.csv',
    contentHash: 'abcd-15',
    version: 1,
    generatedBy: { uid: 'u1', email: 'contact@sarange.fr' },
    id: 'exp-test-1',
    now: new Date('2026-07-22T10:00:00.000Z'),
  });

  assert.equal(record.id, 'exp-test-1');
  assert.equal(record.status, 'generated');
  assert.equal(record.externalId, 'DV-262021715');
  assert.equal(record.csvContent, 'E;COMMANDE;...', 'CSV archivé pour retéléchargement fidèle');
  assert.equal(
    record.lines[0].designationFull,
    'Fenêtre PVC (version complète, jamais tronquée pour l’historique)',
    'désignation complète conservée dans l’historique'
  );
  assert.equal(record.generatedAtIso, '2026-07-22T10:00:00.000Z');
  assert.equal(record.generatedBy.email, 'contact@sarange.fr');
}

/* ─── Historique : ajout, remplacement versionné, statuts ─────────────────── */
{
  const storage = createFakeStorage();
  const model = buildFakeModel();
  const baseInput = {
    quote: { id: 'q1', title: 'Devis Dupont', quoteNumber: 'DV-262021715' },
    model,
    csvContent: 'contenu-v1',
    filename: 'v1.csv',
    contentHash: 'hash-1',
  };

  const first = buildComptaExportRecord({ ...baseInput, version: 1, id: 'exp-1' });
  createLocalComptaExport({ uid: 'u1', record: first, storage });
  assert.equal(loadLocalComptaExports('u1', storage).length, 1);

  // Régénération : nouvelle version, l'ancienne passe en « Remplacé ».
  const second = buildComptaExportRecord({
    ...baseInput,
    csvContent: 'contenu-v2',
    filename: 'v2.csv',
    contentHash: 'hash-2',
    version: 2,
    id: 'exp-2',
  });
  const { records } = createLocalComptaExport({
    uid: 'u1',
    record: second,
    replacesExportId: 'exp-1',
    storage,
  });

  assert.equal(records.length, 2);
  assert.equal(records[0].id, 'exp-2', 'le plus récent en tête');
  assert.equal(records[1].status, 'replaced', 'ancienne version conservée en Remplacé');
  assert.equal(records[1].replacedByExportId, 'exp-2');
  assert.equal(records[1].csvContent, 'contenu-v1', 'CSV de l’ancienne version toujours archivé');

  // Statut Importé, puis Annulé — conservés localement après « rechargement ».
  const imported = updateLocalComptaExportStatus({
    uid: 'u1',
    exportId: 'exp-2',
    status: 'imported',
    storage,
    now: new Date('2026-07-23T08:00:00.000Z'),
  });
  assert.equal(imported.record.status, 'imported');
  assert.equal(imported.record.importedAtIso, '2026-07-23T08:00:00.000Z');

  const reloaded = loadLocalComptaExports('u1', storage);
  assert.equal(reloaded[0].status, 'imported', 'statut persisté (survit au rechargement)');

  const cancelled = updateLocalComptaExportStatus({
    uid: 'u1',
    exportId: 'exp-2',
    status: 'cancelled',
    storage,
  });
  assert.equal(cancelled.record.status, 'cancelled');
  assert.ok(cancelled.record.cancelledAtIso, 'date d’annulation posée');

  assert.throws(
    () => updateLocalComptaExportStatus({ uid: 'u1', exportId: 'inconnu', status: 'imported', storage }),
    /introuvable/,
    'export inconnu → erreur claire'
  );
  assert.throws(
    () => updateLocalComptaExportStatus({ uid: 'u1', exportId: 'exp-2', status: 'draft', storage }),
    /non géré/,
    'statut non géré → erreur claire'
  );
}

/* ─── Garde-fou quota : l'historique est borné ────────────────────────────── */
{
  const storage = createFakeStorage();
  const model = buildFakeModel();
  for (let index = 0; index < COMPTA_EXPORTS_MAX_RECORDS + 5; index += 1) {
    const record = buildComptaExportRecord({
      quote: { id: 'q1' },
      model,
      csvContent: `contenu-${index}`,
      filename: `v${index}.csv`,
      contentHash: `hash-${index}`,
      version: index + 1,
      id: `exp-${index}`,
    });
    createLocalComptaExport({ uid: 'u1', record, storage });
  }
  const records = loadLocalComptaExports('u1', storage);
  assert.equal(records.length, COMPTA_EXPORTS_MAX_RECORDS, 'liste bornée');
  assert.equal(records[0].id, `exp-${COMPTA_EXPORTS_MAX_RECORDS + 4}`, 'les plus récents conservés');
}

/* ─── Export / import JSON de la configuration ────────────────────────────── */
{
  const json = buildComptaConfigJson(
    { placeholderClientCode: 'ZZDIVERS', firestoreSync: true },
    new Date('2026-07-22T10:00:00.000Z')
  );
  const parsed = JSON.parse(json);
  assert.equal(parsed.type, 'sarange-compta-config');
  assert.equal(parsed.exportedAt, '2026-07-22T10:00:00.000Z');

  const restored = parseComptaConfigJson(json);
  assert.equal(restored.placeholderClientCode, 'ZZDIVERS', 'aller-retour fidèle');
  assert.equal(restored.firestoreSync, true);
  assert.equal(restored.pieceType, 'COMMANDE', 'champs absents → défauts');

  assert.throws(() => parseComptaConfigJson('{pas du json'), /JSON valide/, 'JSON invalide rejeté');
  assert.throws(
    () => parseComptaConfigJson('{"type":"autre-chose","settings":{}}'),
    /configuration Compta/,
    'fichier étranger rejeté'
  );
  assert.throws(() => parseComptaConfigJson('{"type":"sarange-compta-config"}'), /configuration Compta/);
}

console.log('compta-local.test.mjs : OK');
