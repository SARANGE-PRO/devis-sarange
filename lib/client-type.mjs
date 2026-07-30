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

/* ─── Identité fiscale (donneur d'ordre en sous-traitance BTP) ───────────── */

// SIREN : 9 premiers chiffres de l'identité de l'entreprise.
export const normalizeSiren = (value) =>
  typeof value === 'string' ? value.replace(/\D/g, '').slice(0, 9) : '';

export const getSirenFromSiret = (value) => normalizeSiret(value).slice(0, 9);

export const normalizeVatNumber = (value) =>
  typeof value === 'string'
    ? value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 15)
    : '';

/**
 * N° de TVA intracommunautaire français, reconstitué depuis le SIREN :
 * FR + clé + SIREN, avec clé = (12 + 3 × (SIREN modulo 97)) modulo 97.
 * (Algorithme officiel — vérifié sur SARANGE : 820001014 → FR22820001014.)
 */
export const computeFrenchVatNumber = (value) => {
  const siren = normalizeSiren(value);
  if (siren.length !== 9) return '';

  const key = (12 + 3 * (Number(siren) % 97)) % 97;
  return `FR${String(key).padStart(2, '0')}${siren}`;
};

export const isValidFrenchVatNumber = (value) => {
  const normalized = normalizeVatNumber(value);
  if (!/^FR\d{11}$/.test(normalized)) return false;
  return computeFrenchVatNumber(normalized.slice(4)) === normalized;
};

export const formatVatNumber = (value) => {
  const normalized = normalizeVatNumber(value);
  if (!/^FR\d{11}$/.test(normalized)) return normalized;
  return [
    normalized.slice(0, 2),
    normalized.slice(2, 4),
    normalized.slice(4, 7),
    normalized.slice(7, 10),
    normalized.slice(10),
  ].join(' ');
};

/**
 * Identité fiscale exploitable du client. Le n° de TVA saisi prime ; à défaut
 * il est reconstitué depuis le SIREN (ou le SIRET) déjà enregistré — c'est la
 * « nouvelle récupération » tentée avant tout blocage de l'autoliquidation.
 */
export const getClientTaxIdentity = (clientData = {}) => {
  const siret = normalizeSiret(clientData?.siret);
  const siren = normalizeSiren(clientData?.siren) || getSirenFromSiret(siret);
  const declaredVatNumber = normalizeVatNumber(clientData?.tvaIntra);

  return {
    siret,
    siren,
    vatNumber: declaredVatNumber || computeFrenchVatNumber(siren),
    isVatNumberDerived: !declaredVatNumber,
  };
};
