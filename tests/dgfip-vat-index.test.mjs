import assert from 'node:assert/strict';
import {
  DGFIP_INDEX_STALE_ALERT,
  REJECTION_REASONS,
  UPDATE_OUTCOMES,
  buildIndexEntries,
  getDgfipIndexStaleAlert,
  getResourceFingerprint,
  isDgfipIndexStale,
  isDgfipProducer,
  isSuccessfulUpdate,
  selectLatestResource,
  updateDgfipVatIndex,
} from '../lib/dgfip-vat-index-builder.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

const runAsync = async (name, fn) => {
  try {
    await fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

// Extraction réaliste : 20 lignes exploitables et 1 ligne illisible (≈ 5 %),
// sous le seuil de corruption.
const VALID_ROWS = Array.from({ length: 20 }, (_, index) => {
  const siren = String(820001000 + index);
  return `${siren};FR22${siren};ENTREPRISE ${index}`;
});
const CSV = [
  'siren;numero_tva_intra;denomination',
  ...VALID_ROWS,
  '123;FRINVALIDE;LIGNE ILLISIBLE',
].join('\n');

const DGFIP_DATASET = {
  title: 'Numéros de TVA intracommunautaire français',
  page: 'https://www.data.gouv.fr/fr/datasets/numeros-de-tva-intracommunautaire/',
  organization: { name: 'Direction générale des Finances publiques', acronym: 'DGFiP' },
  resources: [
    {
      format: 'csv',
      url: 'https://example.test/tva-2026-06.csv',
      last_modified: '2026-06-01T00:00:00+00:00',
      checksum: { type: 'sha1', value: 'ancienne-empreinte' },
    },
    {
      format: 'csv',
      url: 'https://example.test/tva-2026-07.csv',
      last_modified: '2026-07-25T00:00:00+00:00',
      checksum: { type: 'sha1', value: 'empreinte-juillet' },
    },
    { format: 'pdf', url: 'https://example.test/notice.pdf', last_modified: '2026-07-28T00:00:00+00:00' },
  ],
};

// Fabrique un jeu de dépendances injectées, avec compteurs d'appels.
const createDeps = (overrides = {}) => {
  const calls = { downloads: 0, writes: 0 };
  let written = null;

  return {
    calls,
    getWritten: () => written,
    deps: {
      fetchDataset: async () => DGFIP_DATASET,
      fetchResource: async () => {
        calls.downloads += 1;
        return { content: CSV, etag: 'etag-juillet' };
      },
      readCurrentIndex: async () => null,
      writeIndexAtomically: async (index) => {
        calls.writes += 1;
        written = index;
      },
      now: () => new Date('2026-07-30T08:00:00.000Z'),
      ...overrides,
    },
  };
};

run('reconnaît la DGFiP comme producteur, refuse les autres', () => {
  assert.equal(isDgfipProducer(DGFIP_DATASET), true);
  assert.equal(isDgfipProducer({ organization: { name: 'DGFiP' } }), true);
  assert.equal(isDgfipProducer({ organization: { name: 'Ville de Melun' } }), false);
  assert.equal(isDgfipProducer({}), false);
});

run('reconnaît la DGFiP déclarée dans contact_points (structure réelle)', () => {
  // Jeu officiel : organisation « Ministères économiques et financiers »,
  // DGFiP déclarée comme éditeur dans contact_points.
  const realShape = {
    organization: { name: 'Ministères économiques et financiers', acronym: 'MEF' },
    contact_points: [
      { name: '', role: 'creator', organization: { acronym: 'MEF' } },
      { name: 'DGFIP', role: 'publisher', organization: { acronym: 'MEF' } },
    ],
  };
  assert.equal(isDgfipProducer(realShape), true);

  // Même organisation SANS déclaration DGFiP : refusé.
  assert.equal(
    isDgfipProducer({
      organization: { name: 'Ministères économiques et financiers', acronym: 'MEF' },
      contact_points: [{ name: '', role: 'creator', organization: { acronym: 'MEF' } }],
    }),
    false
  );

  // DGFiP citée sans rôle de producteur/éditeur : refusé.
  assert.equal(
    isDgfipProducer({
      organization: { name: 'Ministères économiques et financiers' },
      contact_points: [{ name: 'DGFIP', role: 'contact' }],
    }),
    false
  );
});

run('lit l’extraction officielle : colonne vat_no sans préfixe ni SIREN', () => {
  // Format réel : « vat_no;validity_date;issued_date », numéro sans « FR ».
  const report = buildIndexEntries(
    [
      'vat_no;validity_date;issued_date',
      '22820001014;2020-07-01;2020-07-01',
      '36888249281;2021-03-16;2020-07-23',
      'PAS-UN-NUMERO;2020-07-01;2020-07-01',
    ].join('\n'),
    'csv'
  );

  assert.equal(report.acceptedRows, 2);
  assert.equal(report.rejectedRows, 1);
  // Préfixe pays rétabli, SIREN déduit des 9 derniers chiffres.
  assert.equal(report.entries['820001014'], 'FR22820001014');
  assert.equal(report.entries['888249281'], 'FR36888249281');
});

run('sélectionne la ressource CSV/JSON la plus récente', () => {
  const resource = selectLatestResource(DGFIP_DATASET);
  assert.equal(resource.url, 'https://example.test/tva-2026-07.csv');
  assert.equal(getResourceFingerprint(resource), 'empreinte-juillet');
  // Aucune ressource exploitable → null.
  assert.equal(selectLatestResource({ resources: [{ format: 'pdf', url: 'x' }] }), null);
});

run('construit un index par SIREN et compte les lignes rejetées', () => {
  const report = buildIndexEntries(CSV, 'csv');

  assert.equal(report.entries['820001014'], 'FR22820001014');
  assert.equal(report.totalRows, 21);
  assert.equal(report.acceptedRows, 20);
  assert.equal(report.rejectedRows, 1);
  // « FRINVALIDE » ne respecte pas le format attendu d'un n° de TVA.
  assert.equal(report.mainRejectionReason, REJECTION_REASONS.INVALID_VAT);

  // Format JSON accepté également.
  const json = JSON.stringify([{ siren: '820001014', tva_intra: 'FR22820001014' }]);
  assert.deepEqual(buildIndexEntries(json, 'json').entries, { 820001014: 'FR22820001014' });

  // Contenu inexploitable → index vide (jamais d'exception).
  assert.deepEqual(buildIndexEntries('', 'csv').entries, {});
  assert.deepEqual(buildIndexEntries('{pas du json', 'json').entries, {});
});

run('un numéro de TVA au mauvais format est rejeté, pas accepté', () => {
  const report = buildIndexEntries(
    ['siren;numero_tva_intra', '820001014;PAS-UN-NUMERO'].join('\n'),
    'csv'
  );

  assert.equal(report.acceptedRows, 0);
  assert.equal(report.rejectedRows, 1);
  assert.equal(report.mainRejectionReason, REJECTION_REASONS.INVALID_VAT);
});

run('un SIREN au mauvais format est rejeté même si le numéro est valide', () => {
  const report = buildIndexEntries(
    ['siren;numero_tva_intra', '12;FR22820001014'].join('\n'),
    'csv'
  );

  assert.equal(report.acceptedRows, 0);
  assert.equal(report.rejectedRows, 1);
  assert.equal(report.mainRejectionReason, REJECTION_REASONS.INVALID_SIREN);
});

await runAsync('mise à jour réussie : index remplacé et métadonnées complètes', async () => {
  const { deps, calls, getWritten } = createDeps();
  const result = await updateDgfipVatIndex(deps);

  assert.equal(result.outcome, UPDATE_OUTCOMES.UPDATED);
  assert.equal(isSuccessfulUpdate(result.outcome), true, 'code de sortie attendu : 0');
  assert.equal(result.entryCount, 20);
  assert.equal(result.totalRows, 21);
  assert.equal(result.acceptedRows, 20);
  assert.equal(result.rejectedRows, 1);
  assert.equal(calls.downloads, 1);
  assert.equal(calls.writes, 1);

  const written = getWritten();
  assert.equal(written.entries['820001014'], 'FR22820001014');
  assert.match(written.producer, /Finances publiques/);
  assert.equal(written.datasetTitle, 'Numéros de TVA intracommunautaire français');
  assert.equal(written.resourceUrl, 'https://example.test/tva-2026-07.csv');
  assert.equal(written.publishedAt, '2026-07-25T00:00:00+00:00');
  assert.equal(written.downloadedAt, '2026-07-30T08:00:00.000Z');
  assert.equal(written.fingerprint, 'empreinte-juillet');
  assert.equal(written.entryCount, 20);
});

await runAsync('index construit depuis le jeu réel : producteur DGFiP inscrit', async () => {
  // Organisation porteuse = MEF, producteur déclaré = DGFIP (contact_points).
  const { deps, getWritten } = createDeps({
    fetchDataset: async () => ({
      ...DGFIP_DATASET,
      organization: { name: 'Ministères économiques et financiers', acronym: 'MEF' },
      contact_points: [{ name: 'DGFIP', role: 'publisher' }],
    }),
  });

  const result = await updateDgfipVatIndex(deps);
  const written = getWritten();

  assert.equal(result.outcome, UPDATE_OUTCOMES.UPDATED);
  // C'est la DGFiP qui est inscrite comme producteur — le lecteur revérifie
  // ce champ avant d'exploiter l'index.
  assert.equal(written.producer, 'DGFIP');
  assert.equal(written.publisherOrganization, 'Ministères économiques et financiers');
});

await runAsync('ressource inchangée : aucun téléchargement, et ce n’est pas un échec', async () => {
  const { deps, calls } = createDeps({
    readCurrentIndex: async () => ({
      metadata: { fingerprint: 'empreinte-juillet', entryCount: 20 },
    }),
  });

  const result = await updateDgfipVatIndex(deps);

  assert.equal(result.outcome, UPDATE_OUTCOMES.UNCHANGED);
  assert.equal(isSuccessfulUpdate(result.outcome), true, 'code de sortie attendu : 0');
  assert.equal(result.entryCount, 20);
  assert.equal(calls.downloads, 0, 'la ressource ne doit pas être retéléchargée');
  assert.equal(calls.writes, 0, "l'index ne doit pas être réécrit");
});

await runAsync('producteur incorrect : mise à jour refusée', async () => {
  const { deps, calls } = createDeps({
    fetchDataset: async () => ({
      ...DGFIP_DATASET,
      organization: { name: 'Éditeur non officiel' },
    }),
  });

  const result = await updateDgfipVatIndex(deps);

  assert.equal(result.outcome, UPDATE_OUTCOMES.REJECTED_PRODUCER);
  assert.equal(calls.downloads, 0);
  assert.equal(calls.writes, 0);
});

await runAsync('téléchargement interrompu : ancien index conservé', async () => {
  const { deps, calls } = createDeps({
    fetchResource: async () => {
      throw new Error('connexion interrompue');
    },
  });

  const result = await updateDgfipVatIndex(deps);

  assert.equal(result.outcome, UPDATE_OUTCOMES.DOWNLOAD_FAILED);
  assert.equal(result.message, 'connexion interrompue');
  assert.equal(isSuccessfulUpdate(result.outcome), false, 'code de sortie attendu : 1');
  assert.equal(calls.writes, 0, "l'index existant ne doit pas être remplacé");
});

await runAsync('nouvel index vide : ancien index conservé', async () => {
  const { deps, calls } = createDeps({
    // Ressource téléchargée mais inexploitable : 0 entrée.
    fetchResource: async () => ({ content: 'contenu;sans;correspondance', etag: '' }),
  });

  const result = await updateDgfipVatIndex(deps);

  assert.equal(result.outcome, UPDATE_OUTCOMES.INVALID_INDEX);
  assert.equal(result.reason, REJECTION_REASONS.EMPTY);
  assert.equal(isSuccessfulUpdate(result.outcome), false, 'code de sortie attendu : 1');
  assert.equal(result.acceptedRows, 0);
  assert.equal(calls.writes, 0, "aucun remplacement tant que l'index n'est pas valide");
});

await runAsync('fichier fortement corrompu : trop de lignes illisibles', async () => {
  // 10 lignes exploitables sur 30 : bien au-delà du seuil toléré.
  const corrupted = [
    'siren;numero_tva_intra',
    ...Array.from({ length: 10 }, (_, index) => {
      const siren = String(820001000 + index);
      return `${siren};FR22${siren}`;
    }),
    ...Array.from({ length: 20 }, (_, index) => `???;LIGNE CORROMPUE ${index}`),
  ].join('\n');

  const { deps, calls } = createDeps({
    fetchResource: async () => ({ content: corrupted, etag: '' }),
  });

  const result = await updateDgfipVatIndex(deps);

  assert.equal(result.outcome, UPDATE_OUTCOMES.INVALID_INDEX);
  assert.equal(result.reason, REJECTION_REASONS.UNREADABLE_ROWS);
  assert.equal(result.totalRows, 30);
  assert.equal(result.acceptedRows, 10);
  assert.equal(result.rejectedRows, 20);
  assert.equal(result.mainRejectionReason, REJECTION_REASONS.INVALID_VAT);
  assert.equal(calls.writes, 0, "l'ancien index doit être conservé");
});

await runAsync('baisse anormale du nombre d’entrées : nouvel index refusé', async () => {
  const { deps, calls } = createDeps({
    // L'index précédent comptait 5 000 entrées ; le nouveau n'en a que 20.
    readCurrentIndex: async () => ({
      metadata: { fingerprint: 'empreinte-juin', entryCount: 5000 },
    }),
  });

  const result = await updateDgfipVatIndex(deps);

  assert.equal(result.outcome, UPDATE_OUTCOMES.INVALID_INDEX);
  assert.equal(result.reason, REJECTION_REASONS.ENTRY_COUNT_DROP);
  assert.equal(result.previousEntryCount, 5000);
  assert.equal(result.acceptedRows, 20);
  assert.equal(calls.writes, 0, "l'ancien index doit être conservé");
});

await runAsync('écriture impossible : ancien index conservé, échec signalé', async () => {
  const { deps } = createDeps({
    writeIndexAtomically: async () => {
      throw new Error('disque plein');
    },
  });

  const result = await updateDgfipVatIndex(deps);

  assert.equal(result.outcome, UPDATE_OUTCOMES.INVALID_INDEX);
  assert.equal(result.reason, REJECTION_REASONS.WRITE_FAILED);
  assert.equal(isSuccessfulUpdate(result.outcome), false);
});

await runAsync('échec des métadonnées : aucune interruption, aucun remplacement', async () => {
  const { deps, calls } = createDeps({
    fetchDataset: async () => {
      throw new Error('data.gouv.fr injoignable');
    },
  });

  const result = await updateDgfipVatIndex(deps);

  assert.equal(result.outcome, UPDATE_OUTCOMES.METADATA_FAILED);
  assert.equal(calls.writes, 0);
});

run('alerte lorsque l’index date de plus de sept jours', () => {
  const now = new Date('2026-07-30T08:00:00.000Z');

  assert.equal(isDgfipIndexStale('2026-07-28T08:00:00.000Z', now), false);
  assert.equal(isDgfipIndexStale('2026-07-23T08:00:00.000Z', now), false, '7 jours pile : encore valable');
  assert.equal(isDgfipIndexStale('2026-07-20T08:00:00.000Z', now), true);
  // Date absente ou illisible : traitée comme obsolète.
  assert.equal(isDgfipIndexStale('', now), true);

  assert.equal(getDgfipIndexStaleAlert({ refreshedAt: '2026-07-28T08:00:00.000Z' }, now), '');
  assert.equal(
    getDgfipIndexStaleAlert({ refreshedAt: '2026-07-01T08:00:00.000Z' }, now),
    DGFIP_INDEX_STALE_ALERT
  );
  assert.ok(DGFIP_INDEX_STALE_ALERT.includes('plus de sept jours'));
});

console.log('Tous les tests de l’index DGFiP ont reussi.');
