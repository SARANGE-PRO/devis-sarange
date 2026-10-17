// Adresse d'un lead du site découpée en voie, code postal et ville, comme
// l'autocomplétion du bureau le ferait.
//
//   node tests/lead-address.test.mjs
import assert from 'node:assert/strict';

import { cleanLeadField, splitLeadAddress } from '../lib/lead-address.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('Configurateur : libellé BAN complet, code postal seul, ville absente', () => {
  assert.deepEqual(splitLeadAddress({ address: '35 Avenue Michel Chartier 77090 Collégien', zip: '77090', city: '' }), {
    adresse: '35 Avenue Michel Chartier',
    codePostal: '77090',
    ville: 'Collégien',
  });
});

run('Configurateur : la ville du projet est reprise telle quelle', () => {
  assert.deepEqual(splitLeadAddress({ address: '2 Rue de la Gare 77176 Savigny-le-Temple', zip: '77176', city: 'Savigny-le-Temple' }), {
    adresse: '2 Rue de la Gare',
    codePostal: '77176',
    ville: 'Savigny-le-Temple',
  });
});

run('Ville avec accents et tirets', () => {
  assert.deepEqual(splitLeadAddress({ address: 'Place de la Mairie 91000 Évry-Courcouronnes', zip: '91000' }), {
    adresse: 'Place de la Mairie',
    codePostal: '91000',
    ville: 'Évry-Courcouronnes',
  });
});

run('Ancien formulaire : adresse tapée avec le code postal, zip « 77550 Ville »', () => {
  assert.deepEqual(splitLeadAddress({ address: '4 rue des Pins 77550 Moissy-Cramayel', zip: '77550 Moissy-Cramayel' }), {
    adresse: '4 rue des Pins',
    codePostal: '77550',
    ville: 'Moissy-Cramayel',
  });
});

run('Ancien formulaire : adresse sans code postal, zip « 77000 MELUN »', () => {
  assert.deepEqual(splitLeadAddress({ address: '12 AVENUE DU TEST', zip: '77000 MELUN' }), {
    adresse: '12 AVENUE DU TEST',
    codePostal: '77000',
    ville: 'MELUN',
  });
});

run('Ville répétée en fin de voie, après une virgule', () => {
  assert.deepEqual(splitLeadAddress({ address: '12 avenue du Test, Melun', zip: '77000 Melun' }), {
    adresse: '12 avenue du Test',
    codePostal: '77000',
    ville: 'Melun',
  });
  assert.deepEqual(splitLeadAddress({ address: '3 rue Haute Combs la Ville', zip: '77380', city: 'Combs-la-Ville' }), {
    adresse: '3 rue Haute',
    codePostal: '77380',
    ville: 'Combs-la-Ville',
  });
});

run("L'adresse réduite à la localité ne devient pas une voie", () => {
  assert.deepEqual(splitLeadAddress({ address: '77090 Collégien', zip: '77090' }), { adresse: '', codePostal: '77090', ville: 'Collégien' });
  assert.deepEqual(splitLeadAddress({ address: 'Combs-la-Ville', zip: '77380', city: 'Combs-la-Ville' }), {
    adresse: '',
    codePostal: '77380',
    ville: 'Combs-la-Ville',
  });
});

run('Un numéro de voie à cinq chiffres ne passe pas pour un code postal', () => {
  assert.deepEqual(splitLeadAddress({ address: '12345 route de Paris', zip: '' }), { adresse: '12345 route de Paris', codePostal: '', ville: '' });
});

run("Les bouche-trous de l'Apps Script deviennent vides", () => {
  assert.deepEqual(splitLeadAddress({ address: 'Non renseignée', zip: 'Non renseigné' }), { adresse: '', codePostal: '', ville: '' });
  assert.equal(cleanLeadField('Non renseigné'), '');
  assert.equal(cleanLeadField('Inconnu'), '');
  assert.equal(cleanLeadField('  Marie Martin '), 'Marie Martin');
  assert.equal(cleanLeadField(undefined), '');
});

run('Rien du tout, ou seulement un code postal', () => {
  assert.deepEqual(splitLeadAddress({}), { adresse: '', codePostal: '', ville: '' });
  assert.deepEqual(splitLeadAddress({ address: '', zip: '77380' }), { adresse: '', codePostal: '77380', ville: '' });
  assert.deepEqual(splitLeadAddress({ address: '3 rue Haute' }), { adresse: '3 rue Haute', codePostal: '', ville: '' });
});

console.log('Tous les tests lead-address passent.');
