import assert from 'node:assert/strict';
import {
  buildClientFolderFields,
  buildClientFolderHtml,
  getClientFolderLetter,
  getClientFolderName,
} from '../lib/client-folder.mjs';

let ok = 0;
let fail = 0;
const test = (name, fn) => {
  try { fn(); ok += 1; console.log(`OK - ${name}`); }
  catch (error) { fail += 1; console.error(`FAIL - ${name}\n`, error); }
};

test('société : première lettre de la raison sociale', () => {
  assert.equal(getClientFolderLetter({ clientType: 'PROFESSIONNEL', nom: 'SARL Bâtiplus', prenom: 'Marc' }), 'S');
});

test('particulier : première lettre du nom, sinon du prénom', () => {
  assert.equal(getClientFolderLetter({ clientType: 'PARTICULIER', nom: 'dupont', prenom: 'Jean' }), 'D');
  assert.equal(getClientFolderLetter({ nom: '', prenom: 'jean' }), 'J');
  assert.equal(getClientFolderLetter({}), '');
});

test('accents retirés, espaces et ponctuation ignorés', () => {
  assert.equal(getClientFolderLetter({ nom: '  Émile' }), 'E');
  assert.equal(getClientFolderLetter({ nom: "« L'Atelier »" }), 'L');
});

test('nom sur la chemise : raison sociale, ou NOM Prénom', () => {
  assert.equal(getClientFolderName({ clientType: 'PROFESSIONNEL', nom: 'SARL Exemple', prenom: 'Marc' }), 'SARL Exemple');
  assert.equal(getClientFolderName({ clientType: 'PARTICULIER', nom: 'Dupont', prenom: 'Jean' }), 'DUPONT Jean');
  assert.equal(getClientFolderName({ prenom: 'Jean' }), 'Jean');
});

test('champs pré-remplis depuis la fiche', () => {
  const fields = buildClientFolderFields({
    nom: 'Dupont', prenom: 'Jean', adresse: '12 rue de la Paix', codePostal: '77000', ville: 'Melun',
    telephone: '06 12 34 56 78', email: 'jean@exemple.fr',
  });
  assert.deepEqual(fields, {
    letter: 'D', name: 'DUPONT Jean', addressLine1: '12 rue de la Paix', addressLine2: '77000 Melun',
    phone: '06 12 34 56 78', email: 'jean@exemple.fr', notes: '',
  });
});

test('HTML : A3 paysage, valeurs échappées', () => {
  const html = buildClientFolderHtml({ name: '<b>X</b>', notes: 'a & b' });
  assert.match(html, /size: A3 landscape/);
  assert.ok(html.includes('&lt;b&gt;X&lt;/b&gt;'));
  assert.ok(html.includes('a &amp; b'));
  assert.ok(!html.includes('<b>X</b>'));
});

console.log(`${ok} OK, ${fail} FAIL`);
if (fail) process.exit(1);
