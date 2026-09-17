import assert from 'node:assert/strict';
import {
  MANIFEST_ASSET,
  POINTER_TAG,
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
  normalizeSirenKey,
} from '../lib/dgfip-vat-shards.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('SIREN normalisé : neuf chiffres, sinon rien', () => {
  assert.equal(normalizeSirenKey('820 001 014'), '820001014');
  assert.equal(normalizeSirenKey('001234567'), '001234567');
  // SIREN invalide : aucune clé (aucun fichier ne sera consulté).
  assert.equal(normalizeSirenKey('12345'), '');
  assert.equal(normalizeSirenKey(''), '');
  assert.equal(normalizeSirenKey(null), '');
});

run('releases et chemins déterministes', () => {
  assert.equal(getVersionTag('20260917T081500Z'), 'dgfip-vat-20260917T081500Z');
  assert.equal(getVersionFromTag('dgfip-vat-20260917T081500Z'), '20260917T081500Z');
  // Le pointeur et les tags étrangers ne portent aucune version.
  assert.equal(getVersionFromTag(POINTER_TAG), '');
  assert.equal(getVersionFromTag('v1.2.0'), '');
  assert.equal(getVersionFromTag('dgfip-vat-brouillon'), '');

  assert.equal(getShardName(7), '007.json.gz');
  assert.equal(getShardPath('20260917T081500Z', 42), 'dgfip-vat-20260917T081500Z/042.json.gz');
  assert.equal(getManifestPath(), `${POINTER_TAG}/${MANIFEST_ASSET}`);
  assert.equal(
    getReleaseDownloadBaseUrl('SARANGE-PRO/devis-sarange'),
    'https://github.com/SARANGE-PRO/devis-sarange/releases/download'
  );
});

run('identifiant de version trié chronologiquement', () => {
  const older = buildVersionId('2026-07-29T11:53:54.061Z');
  const newer = buildVersionId('2026-07-30T14:16:38.726Z');

  assert.equal(older, '20260729T115354Z');
  assert.ok(newer > older, 'le tri lexicographique doit suivre la chronologie');
});

run('découpage : fichiers équilibrés, bornes croissantes, chaque SIREN dans le sien', () => {
  const entries = {
    820001014: 'FR22820001014',
    820009999: 'FR44820009999',
    123456789: 'FR40123456789',
    '001234567': 'FR00001234567',
    552100554: 'FR96552100554',
    999999998: 'FR00999999998',
    300000000: 'FR00300000000',
    // Clé invalide : ignorée, jamais de fichier parasite.
    abc: 'FR40123456789',
  };

  const { shards, bounds } = buildShards(entries, 3);

  // Sept entrées valides réparties en 3 fichiers : 2, 2 et 3.
  assert.equal(shards.length, 3);
  assert.deepEqual(
    shards.map((shard) => Object.keys(shard).length),
    [2, 2, 3]
  );
  assert.deepEqual(bounds, ['123456789', '552100554', '999999998']);

  // Chaque SIREN se retrouve par dichotomie dans le fichier qui le contient.
  Object.keys(entries)
    .filter((siren) => /^\d{9}$/.test(siren))
    .forEach((siren) => {
      const index = findShardIndex(siren, bounds);
      assert.equal(shards[index][siren], entries[siren], `SIREN ${siren}`);
    });

  // Le contenu ne porte QUE des correspondances SIREN -> numéro.
  shards.forEach((shard) =>
    Object.entries(shard).forEach(([siren, vatNumber]) => {
      assert.match(siren, /^\d{9}$/);
      assert.match(vatNumber, /^FR[0-9A-Z]{2}\d{9}$/);
    })
  );

  // Plus de fichiers demandés que d'entrées : un fichier par entrée, jamais
  // de fichier vide.
  const small = buildShards({ 820001014: 'FR22820001014' }, 100);
  assert.equal(small.shards.length, 1);
  assert.deepEqual(small.bounds, ['820001014']);

  assert.deepEqual(buildShards({}), { shards: [], bounds: [] });
});

run('recherche du fichier : dichotomie sur les bornes', () => {
  const bounds = ['123456789', '552100554', '999999998'];

  // En dessous de la première borne : premier fichier (qui peut ne pas le
  // contenir : ce sera un NOT_FOUND légitime).
  assert.equal(findShardIndex('000000001', bounds), 0);
  assert.equal(findShardIndex('123456789', bounds), 0);
  assert.equal(findShardIndex('123456790', bounds), 1);
  assert.equal(findShardIndex('552100554', bounds), 1);
  assert.equal(findShardIndex('820001014', bounds), 2);
  // Au-delà de la dernière borne : aucune entreprise de l'extraction.
  assert.equal(findShardIndex('999999999', bounds), -1);
  // SIREN inexploitable ou bornes absentes.
  assert.equal(findShardIndex('12', bounds), -1);
  assert.equal(findShardIndex('820001014', []), -1);
});

run('manifeste : champs attendus, bornes contrôlées', () => {
  const manifest = buildManifest({
    version: '20260917T081500Z',
    publishedAt: '2026-09-16T11:53:15.213000+00:00',
    entryCount: 4834738,
    fingerprint: '2026-09-16T11:53:15.213000+00:00',
    generatedAt: '2026-09-17T08:15:00.000Z',
    producer: 'DGFIP',
    bounds: ['123456789', '552100554', '999999998'],
  });

  assert.equal(manifest.version, '20260917T081500Z');
  assert.equal(manifest.entryCount, 4834738);
  assert.equal(manifest.shardCount, 3);

  // Aller-retour JSON (publication puis lecture).
  assert.deepEqual(normalizeManifest(JSON.parse(JSON.stringify(manifest))), manifest);

  // Manifeste inexploitable : refusé, l'application retombe sur ses replis.
  assert.equal(normalizeManifest(null), null);
  assert.equal(normalizeManifest({}), null);
  assert.equal(normalizeManifest({ ...manifest, entryCount: 0 }), null);
  assert.equal(normalizeManifest({ ...manifest, version: 'v1' }), null);
  assert.equal(normalizeManifest({ ...manifest, bounds: [] }), null);
  // Bornes non croissantes : la dichotomie serait fausse.
  assert.equal(normalizeManifest({ ...manifest, bounds: ['552100554', '123456789'] }), null);
  assert.equal(normalizeManifest({ ...manifest, bounds: ['12', '552100554'] }), null);
});

run('élagage : version active et les plus récentes conservées, restes supprimés', () => {
  const versions = ['20260728T000000Z', '20260729T000000Z', '20260730T000000Z', '20260727T000000Z'];

  const pruned = getVersionsToPrune(versions, '20260730T000000Z', 2);
  assert.deepEqual(pruned, ['20260728T000000Z', '20260727T000000Z']);

  // Jamais moins de deux versions conservées, même si on demande moins.
  assert.deepEqual(getVersionsToPrune(versions, '20260730T000000Z', 1), [
    '20260728T000000Z',
    '20260727T000000Z',
  ]);

  // Une version plus récente que l'active est une publication interrompue
  // avant la bascule : supprimée. L'active et sa précédente sont conservées.
  assert.deepEqual(getVersionsToPrune(versions, '20260729T000000Z', 2), [
    '20260730T000000Z',
    '20260727T000000Z',
  ]);

  // Moins de deux versions : rien à supprimer.
  assert.deepEqual(getVersionsToPrune(['20260730T000000Z'], '20260730T000000Z', 2), []);
  assert.deepEqual(getVersionsToPrune([], '', 2), []);
});

console.log('Tous les tests de découpage de l’index DGFiP ont reussi.');
