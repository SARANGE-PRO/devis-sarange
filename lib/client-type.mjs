/**
 * client-type.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Type juridique du client — la SEULE information juridique saisie
 * manuellement sur un devis : PARTICULIER (B2C) ou PROFESSIONNEL (B2B).
 * Pilote les CGV adaptatives (lib/cgv-templates.mjs).
 *
 * AUCUN défaut n'est appliqué : tant que l'utilisateur n'a pas choisi
 * explicitement, le type vaut INCONNU et la génération, l'envoi et la
 * signature du devis sont BLOQUÉS. Le type n'est JAMAIS déduit du SIRET,
 * du nom ou de l'adresse. Les anciens clients/devis sans clientType
 * s'affichent « Type de client à confirmer ».
 *
 * Module pur, sans import : testable par le runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const CLIENT_TYPES = Object.freeze({
  PARTICULIER: 'PARTICULIER',
  PROFESSIONNEL: 'PROFESSIONNEL',
});

// Valeur sentinelle des fiches non renseignées (dont toutes les données
// antérieures à l'introduction du champ). Jamais un choix proposé à l'écran.
export const UNKNOWN_CLIENT_TYPE = 'INCONNU';

export const normalizeClientType = (value) => {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (text === CLIENT_TYPES.PROFESSIONNEL) return CLIENT_TYPES.PROFESSIONNEL;
  if (text === CLIENT_TYPES.PARTICULIER) return CLIENT_TYPES.PARTICULIER;
  return UNKNOWN_CLIENT_TYPE;
};

export const isKnownClientType = (value) =>
  normalizeClientType(value) !== UNKNOWN_CLIENT_TYPE;

export const isProfessionalClient = (value) =>
  normalizeClientType(value) === CLIENT_TYPES.PROFESSIONNEL;

export const getClientTypeLabel = (value) => {
  const normalized = normalizeClientType(value);
  if (normalized === CLIENT_TYPES.PROFESSIONNEL) return 'Professionnel';
  if (normalized === CLIENT_TYPES.PARTICULIER) return 'Particulier';
  return 'Type de client à confirmer';
};

// SIRET : 14 chiffres maximum, saisie tolérante (espaces, points…).
export const normalizeSiret = (value) =>
  typeof value === 'string' ? value.replace(/\D/g, '').slice(0, 14) : '';

export const formatSiret = (value) => {
  const digits = normalizeSiret(value);
  if (!digits) return '';
  return digits.replace(/^(\d{3})(\d{0,3})(\d{0,3})(\d{0,5})$/, (_, a, b, c, d) =>
    [a, b, c, d].filter(Boolean).join(' ')
  );
};
