import assert from 'node:assert/strict';

import {
  CIVILITES,
  CIVILITE_OPTIONS,
  DEFAULT_SALUTATION,
  formatClientSalutation,
  getCiviliteLabel,
  getCiviliteLongLabel,
  getClientGreetingName,
  isCoupleCivilite,
  normalizeCivilite,
} from '../lib/civilite.mjs';
import {
  getClientFullName,
  getClientGreetingName as greetingFromClient,
  getClientSalutation,
  sanitizeClientData,
} from '../lib/client-cloud.js';

// Normalisation : canonique, alias courants, points et casse ignorés.
assert.equal(normalizeCivilite('M'), 'M');
assert.equal(normalizeCivilite('M.'), 'M');
assert.equal(normalizeCivilite(' monsieur '), 'M');
assert.equal(normalizeCivilite('Mme'), 'MME');
assert.equal(normalizeCivilite('MADAME'), 'MME');
assert.equal(normalizeCivilite('MME_M'), 'MME_M');
assert.equal(normalizeCivilite('Mme & M.'), 'MME_M');
assert.equal(normalizeCivilite('M. et Mme'), 'MME_M');
assert.equal(normalizeCivilite('couple'), 'MME_M');
assert.equal(normalizeCivilite(''), '');
assert.equal(normalizeCivilite('Dr'), '', 'civilité inconnue : vide');
assert.equal(normalizeCivilite(null), '');
assert.equal(normalizeCivilite(42), '');

assert.deepEqual(
  CIVILITE_OPTIONS.map((option) => option.value),
  [CIVILITES.M, CIVILITES.MME, CIVILITES.MME_M]
);
assert.equal(getCiviliteLabel('M'), 'M.');
assert.equal(getCiviliteLabel('MME'), 'Mme');
assert.equal(getCiviliteLabel('MME_M'), 'Mme & M.');
assert.equal(getCiviliteLabel('x'), '');
assert.equal(getCiviliteLongLabel('M'), 'Monsieur');
assert.equal(getCiviliteLongLabel('MME'), 'Madame');
assert.equal(getCiviliteLongLabel('MME_M'), 'Madame, Monsieur');
assert.equal(isCoupleCivilite('Mme & M.'), true);
assert.equal(isCoupleCivilite('M'), false);

// Particulier : « Civilité NOM Prénom », nom en capitales (accents conservés).
assert.equal(
  formatClientSalutation({ civilite: 'M', nom: 'Dupont', prenom: 'Jean', clientType: 'PARTICULIER' }),
  'M. DUPONT Jean'
);
assert.equal(
  formatClientSalutation({ civilite: 'MME', nom: 'Lévêque', prenom: 'Marie', clientType: 'PARTICULIER' }),
  'Mme LÉVÊQUE Marie'
);
assert.equal(
  formatClientSalutation({ civilite: 'M', nom: '  de la  Tour ', prenom: ' Pierre ' }),
  'M. DE LA TOUR Pierre',
  'espaces repliés, type inconnu traité comme particulier'
);
assert.equal(formatClientSalutation({ civilite: 'M', nom: 'Dupont' }), 'M. DUPONT', 'sans prénom');
assert.equal(formatClientSalutation({ civilite: 'MME', prenom: 'Jeanne' }), 'Mme Jeanne', 'sans nom');
assert.equal(formatClientSalutation({ civilite: 'M' }), 'Monsieur', 'civilité seule');
assert.equal(formatClientSalutation({ civilite: 'MME' }), 'Madame');

// Couple : « Mme & M. NOM », jamais le prénom.
assert.equal(
  formatClientSalutation({ civilite: 'MME_M', nom: 'Dupont', prenom: 'Jean', clientType: 'PARTICULIER' }),
  'Mme & M. DUPONT'
);
assert.equal(formatClientSalutation({ civilite: 'MME_M' }), DEFAULT_SALUTATION, 'couple sans nom');

// Professionnel : raison sociale jamais saluée, contact tel que saisi.
assert.equal(
  formatClientSalutation({ civilite: 'M', nom: 'SARL Exemple', prenom: 'Jean Martin', clientType: 'PROFESSIONNEL' }),
  'M. Jean Martin'
);
assert.equal(
  formatClientSalutation({ civilite: 'MME', nom: 'SARL Exemple', clientType: 'PROFESSIONNEL' }),
  'Madame',
  'professionnel sans contact'
);
assert.equal(
  formatClientSalutation({ civilite: 'MME_M', nom: 'SARL Exemple', prenom: 'Jean', clientType: 'PROFESSIONNEL' }),
  '',
  'couple ignoré pour une entreprise'
);

// Sans civilité : aucune formule (repli de l'appelant), jamais « Prénom Nom ».
assert.equal(formatClientSalutation({ nom: 'Dupont', prenom: 'Jean' }), '');
assert.equal(formatClientSalutation({ civilite: '', nom: 'Dupont' }), '');
assert.equal(formatClientSalutation(null), '');
assert.equal(getClientGreetingName({ nom: 'Dupont', prenom: 'Jean' }), 'Madame, Monsieur');
assert.equal(getClientGreetingName({ civilite: 'M', nom: 'Dupont', prenom: 'Jean' }), 'M. DUPONT Jean');

// Fiche client : la civilité est conservée et normalisée par sanitizeClientData,
// le nom complet « Prénom Nom » (identité) ne change pas.
const client = sanitizeClientData({
  civilite: 'Mme & M.',
  nom: ' Dupont ',
  prenom: 'Jean',
  clientType: 'PARTICULIER',
});
assert.equal(client.civilite, 'MME_M');
assert.equal(getClientFullName(client), 'Jean Dupont');
assert.equal(getClientSalutation(client), 'Mme & M. DUPONT');
assert.equal(greetingFromClient(client), 'Mme & M. DUPONT');
assert.equal(sanitizeClientData({ civilite: 'Dr' }).civilite, '', 'valeur inconnue : vide');
assert.equal(sanitizeClientData({}).civilite, '', 'fiches antérieures : vide');
assert.equal(getClientSalutation({ nom: 'Dupont', prenom: 'Jean' }), '');
assert.equal(greetingFromClient({ nom: 'Dupont', prenom: 'Jean' }), 'Madame, Monsieur');

console.log('civilite ok');
