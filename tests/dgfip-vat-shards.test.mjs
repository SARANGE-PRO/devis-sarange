import assert from 'node:assert/strict';
import {
  MANIFEST_PATH,
  buildManifest,
  buildShards,
  buildVersionId,
  getShardPath,
  getSirenPrefix,
  getVersionFromPath,
  getVersionsToPrune,
  normalizeManifest,
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

run('préfixe de découpage : trois premiers chiffres du SIREN', () => {
  assert.equal(getSirenPrefix('820001014'), '820');
  assert.equal(getSirenPrefix('001234567'), '001');
  // SIREN invalide : aucun préfixe (aucun fichier ne sera consulté).
  assert.equal(getSirenPrefix('12345'), '');
  assert.equal(getSirenPrefix(''), '');
  assert.equal(getSirenPrefix(null), '');
});

run('chemins de blob déterministes', () => {
  assert.equal(getShardPath('20260730T141638Z', '820'), 'dgfip-vat/20260730T141638Z/820.json.gz');
  assert.equal(MANIFEST_PATH, 'dgfip-vat/current.json');
  assert.equal(getVersionFromPath('dgfip-vat/20260730T141638Z/820.json.gz'), '20260730T141638Z');
  // Le manifeste n'appartient à aucune version.
  assert.equal(getVersionFromPath('dgfip-vat/current.json'), '');
  assert.equal(getVersionFromPath('autre/chose.json.gz'), '');
});

run('identifiant de version trié chronologiquement', () => {
  const older = buildVersionId('2026-07-29T11:53:54.061Z');
  const newer = buildVersionId('2026-07-30T14:16:38.726Z');

  assert.equal(older, '20260729T115354Z');
  assert.ok(newer > older, 'le tri lexicographique doit suivre la chronologie');
});

run('découpage : chaque SIREN dans le fichier de son préfixe', () => {
  const shards = buildShards({
    820001014: 'FR22820001014',
    820009999: 'FR44820009999',
    123456789: 'FR40123456789',
    // Clé invalide : ignorée, jamais de fichier parasite.
    abc: 'FR40123456789',
  });

  assert.equal(shards.size, 2);
  assert.deepEqual(shards.get('820'), {
    820001014: 'FR22820001014',
    820009999: 'FR44820009999',
  });
  assert.deepEqual(shards.get('123'), { 123456789: 'FR40123456789' });

  // Le contenu ne porte QUE des correspondances SIREN -> numéro.
  Object.entries(shards.get('820')).forEach(([siren, vatNumber]) => {
    assert.match(siren, /^\d{9}$/);
    assert.match(vatNumber, /^FR[0-9A-Z]{2}\d{9}$/);
  });
});

run('manifeste : champs attendus et normalisation', () => {
  const manifest = buildManifest({
    version: '20260730T141638Z',
    publishedAt: '2026-07-29T11:53:54.061000+00:00',
    entryCount: 4826845,
    fingerprint: '2026-07-29T11:53:54.061000+00:00',
    generatedAt: '2026-07-30T14:16:38.726Z',
    producer: 'DGFIP',
    shardCount: 1000,
  });

  assert.equal(manifest.version, '20260730T141638Z');
  assert.equal(manifest.publishedAt, '2026-07-29T11:53:54.061000+00:00');
  assert.equal(manifest.entryCount, 4826845);
  assert.equal(manifest.shardCount, 1000);

  // Aller-retour JSON (publication puis lecture).
  assert.deepEqual(normalizeManifest(JSON.parse(JSON.stringify(manifest))), manifest);

  // Manifeste inexploitable : refusé, l'application retombe sur ses replis.
  assert.equal(normalizeManifest(null), null);
  assert.equal(normalizeManifest({}), null);
  assert.equal(normalizeManifest({ version: 'v1', entryCount: 0 }), null);
});

run('élagage : au minimum les deux versions les plus récentes conservées', () => {
  const versions = ['20260728T000000Z', '20260729T000000Z', '20260730T000000Z', '20260727T000000Z'];

  const pruned = getVersionsToPrune(versions, '20260730T000000Z', 2);
  assert.deepEqual(pruned, ['20260728T000000Z', '20260727T000000Z']);

  // Jamais moins de deux versions conservées, même si on demande moins.
  assert.deepEqual(getVersionsToPrune(versions, '20260730T000000Z', 1), [
    '20260728T000000Z',
    '20260727T000000Z',
  ]);

  // La version active est toujours conservée, même si elle n'est pas récente.
  const withOldActive = getVersionsToPrune(versions, '20260727T000000Z', 2);
  assert.ok(!withOldActive.includes('20260727T000000Z'));

  // Moins de deux versions : rien à supprimer.
  assert.deepEqual(getVersionsToPrune(['20260730T000000Z'], '20260730T000000Z', 2), []);
  assert.deepEqual(getVersionsToPrune([], '', 2), []);
});

console.log('Tous les tests de découpage de l’index DGFiP ont reussi.');
