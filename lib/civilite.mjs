/**
 * civilite.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Civilité du client (M., Mme, Mme & M.) et formule d'adresse des e-mails.
 *
 * Les e-mails saluaient le client par « Bonjour Jean Dupont, » : on ne salue
 * personne par son prénom et son nom. La formule devient :
 *   - particulier : « M. DUPONT Jean », « Mme DUPONT Jeanne », et pour un
 *     couple « Mme & M. DUPONT » (nom de famille seul, en capitales) ;
 *   - professionnel : civilité + contact tel que saisi (« M. Jean Martin ») ;
 *   - sans civilité (fiches antérieures à ce champ) : « Madame, Monsieur ».
 *
 * Le nom complet « Prénom Nom » (identité du client, signature, PDF, fiches
 * et listes) n'est PAS concerné : il reste produit par lib/client-cloud.js.
 *
 * Module pur (n'importe que client-type.mjs) : testable par le runner Node,
 * partagé par la fiche client (aperçu de la formule), le serveur (gabarits
 * d'e-mails) et les aperçus de lien.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { isProfessionalClient } from './client-type.mjs';

export const CIVILITES = Object.freeze({
  M: 'M',
  MME: 'MME',
  MME_M: 'MME_M',
});

// Ordre d'affichage des boutons de la fiche client.
export const CIVILITE_OPTIONS = Object.freeze([
  { value: CIVILITES.M, label: 'M.', title: 'Monsieur' },
  { value: CIVILITES.MME, label: 'Mme', title: 'Madame' },
  { value: CIVILITES.MME_M, label: 'Mme & M.', title: 'Madame et Monsieur (couple)' },
]);

// Formule neutre : civilité absente, ou nom manquant pour un couple.
export const DEFAULT_SALUTATION = 'Madame, Monsieur';

const SHORT_LABELS = {
  [CIVILITES.M]: 'M.',
  [CIVILITES.MME]: 'Mme',
  [CIVILITES.MME_M]: 'Mme & M.',
};

const LONG_LABELS = {
  [CIVILITES.M]: 'Monsieur',
  [CIVILITES.MME]: 'Madame',
  [CIVILITES.MME_M]: DEFAULT_SALUTATION,
};

// Saisies tolérées (import, anciennes données, frappe libre) : points et
// espaces superflus ignorés, casse ignorée.
const ALIASES = {
  M: CIVILITES.M,
  MR: CIVILITES.M,
  MONSIEUR: CIVILITES.M,
  MME: CIVILITES.MME,
  MADAME: CIVILITES.MME,
  MME_M: CIVILITES.MME_M,
  'MME & M': CIVILITES.MME_M,
  'M & MME': CIVILITES.MME_M,
  'MME ET M': CIVILITES.MME_M,
  'M ET MME': CIVILITES.MME_M,
  COUPLE: CIVILITES.MME_M,
};

/** Valeur canonique ('M', 'MME', 'MME_M') ou '' si inconnue. */
export const normalizeCivilite = (value) => {
  if (typeof value !== 'string') return '';
  const key = value.replace(/\./g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  return ALIASES[key] || '';
};

export const isKnownCivilite = (value) => normalizeCivilite(value) !== '';

export const isCoupleCivilite = (value) => normalizeCivilite(value) === CIVILITES.MME_M;

/** « M. », « Mme », « Mme & M. » ou ''. */
export const getCiviliteLabel = (value) => SHORT_LABELS[normalizeCivilite(value)] || '';

/** « Monsieur », « Madame », « Madame, Monsieur » ou ''. */
export const getCiviliteLongLabel = (value) => LONG_LABELS[normalizeCivilite(value)] || '';

const clean = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

// Nom de famille en capitales, accents conservés (DUPONT, LÉVÊQUE).
const upperName = (value) => clean(value).toLocaleUpperCase('fr-FR');

/**
 * Formule d'adresse du client, ou '' sans civilité exploitable (l'appelant
 * choisit alors son repli, en général DEFAULT_SALUTATION).
 *
 * @param {{civilite?: string, nom?: string, prenom?: string, clientType?: string}} clientData
 */
export const formatClientSalutation = (clientData = {}) => {
  const data = clientData || {};
  const civilite = normalizeCivilite(data.civilite);
  if (!civilite) return '';

  if (isProfessionalClient(data.clientType)) {
    // nom = raison sociale, prenom = contact (libre : « Jean Martin »). Un
    // couple n'est pas un interlocuteur d'entreprise : civilité ignorée.
    if (civilite === CIVILITES.MME_M) return '';
    const contact = clean(data.prenom);
    return contact ? `${SHORT_LABELS[civilite]} ${contact}` : LONG_LABELS[civilite];
  }

  const nom = upperName(data.nom);
  if (civilite === CIVILITES.MME_M) {
    return nom ? `${SHORT_LABELS[civilite]} ${nom}` : DEFAULT_SALUTATION;
  }

  const parts = [SHORT_LABELS[civilite], nom, clean(data.prenom)].filter(Boolean);
  // Civilité seule (« M. ») : on préfère « Monsieur ».
  return parts.length > 1 ? parts.join(' ') : LONG_LABELS[civilite];
};

/** Formule prête pour « Bonjour … », repli « Madame, Monsieur ». */
export const getClientGreetingName = (clientData = {}) =>
  formatClientSalutation(clientData) || DEFAULT_SALUTATION;
