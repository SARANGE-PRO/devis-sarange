// Sérialisation incrémentale des abonnements Firestore (lib/firebase/snapshot-cache.mjs).
//   node tests/snapshot-cache.test.mjs
import assert from 'node:assert/strict';

import { createIncrementalSerializer, describeSnapshot } from '../lib/firebase/snapshot-cache.mjs';

let ok = 0;
let fail = 0;
const run = (name, fn) => {
  try {
    fn();
    ok += 1;
    console.log(`OK - ${name}`);
  } catch (error) {
    fail += 1;
    console.error(`KO - ${name}`);
    console.error(error);
  }
};

// Faux instantané : `docs` dans l'ordre de la requête, `changes` = deltas.
const fakeDoc = (id, data) => ({ id, data: () => data, exists: () => true });
const fakeSnapshot = (docs, changes, metadata = { fromCache: false, hasPendingWrites: false }) => ({
  docs,
  docChanges: () => changes,
  metadata,
});

run('premier instantané : tout est sérialisé, dans l’ordre de la requête', () => {
  let calls = 0;
  const toItems = createIncrementalSerializer((doc) => {
    calls += 1;
    return { id: doc.id, title: doc.data().title };
  });
  const a = fakeDoc('a', { title: 'A' });
  const b = fakeDoc('b', { title: 'B' });
  const items = toItems(
    fakeSnapshot([b, a], [{ type: 'added', doc: b }, { type: 'added', doc: a }])
  );
  assert.deepEqual(items.map((item) => item.id), ['b', 'a']);
  assert.equal(calls, 2);
});

run('mise à jour : seul le document modifié est re-sérialisé', () => {
  let calls = 0;
  const toItems = createIncrementalSerializer((doc) => {
    calls += 1;
    return { id: doc.id, title: doc.data().title };
  });
  const a = fakeDoc('a', { title: 'A' });
  const b = fakeDoc('b', { title: 'B' });
  toItems(fakeSnapshot([a, b], [{ type: 'added', doc: a }, { type: 'added', doc: b }]));
  calls = 0;

  const b2 = fakeDoc('b', { title: 'B2' });
  const items = toItems(fakeSnapshot([b2, a], [{ type: 'modified', doc: b2 }]));
  assert.equal(calls, 1, 'un seul document re-sérialisé');
  assert.deepEqual(items.map((item) => item.title), ['B2', 'A']);
});

run('suppression : le document disparaît de la liste', () => {
  const toItems = createIncrementalSerializer((doc) => ({ id: doc.id }));
  const a = fakeDoc('a', {});
  const b = fakeDoc('b', {});
  toItems(fakeSnapshot([a, b], [{ type: 'added', doc: a }, { type: 'added', doc: b }]));
  const items = toItems(fakeSnapshot([b], [{ type: 'removed', doc: a }]));
  assert.deepEqual(items.map((item) => item.id), ['b']);
});

run('document illisible : ignoré et signalé, les autres passent', () => {
  const errors = [];
  const toItems = createIncrementalSerializer(
    (doc) => {
      if (doc.id === 'bad') throw new Error('payload corrompu');
      return { id: doc.id };
    },
    { onDocumentError: (error, id) => errors.push(`${id}: ${error.message}`) }
  );
  const good = fakeDoc('good', {});
  const bad = fakeDoc('bad', {});
  const items = toItems(
    fakeSnapshot([bad, good], [{ type: 'added', doc: bad }, { type: 'added', doc: good }])
  );
  assert.deepEqual(items.map((item) => item.id), ['good']);
  assert.deepEqual(errors, ['bad: payload corrompu']);
});

run('sérialisation vide (document sans contenu) : retiré de la liste', () => {
  const toItems = createIncrementalSerializer((doc) => (doc.id === 'empty' ? null : { id: doc.id }));
  const a = fakeDoc('a', {});
  const empty = fakeDoc('empty', {});
  const items = toItems(
    fakeSnapshot([a, empty], [{ type: 'added', doc: a }, { type: 'added', doc: empty }])
  );
  assert.deepEqual(items.map((item) => item.id), ['a']);
});

run('describeSnapshot : cache local ou serveur', () => {
  assert.deepEqual(describeSnapshot(fakeSnapshot([], [], { fromCache: true, hasPendingWrites: false })), {
    fromCache: true,
    hasPendingWrites: false,
  });
  assert.deepEqual(describeSnapshot({}), { fromCache: false, hasPendingWrites: false });
});

console.log(`${ok} OK, ${fail} FAIL`);
if (fail > 0) process.exit(1);
