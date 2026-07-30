import {
  UNKNOWN_CLIENT_TYPE,
  normalizeClientType,
  normalizeSiren,
  normalizeSiret,
  normalizeVatNumber,
} from './client-type.mjs';

export const EMPTY_CLIENT_DATA = {
  savedClientId: '',
  // Type juridique du client : PARTICULIER ou PROFESSIONNEL, choisi
  // EXPLICITEMENT par l'utilisateur (aucun défaut — INCONNU tant que non
  // renseigné, et le devis reste bloqué). Pilote les CGV adaptatives.
  clientType: UNKNOWN_CLIENT_TYPE,
  // Identité fiscale du client professionnel (renseignée automatiquement par
  // la recherche d'entreprise, saisissable à la main en cas d'échec de l'API).
  // Obligatoire uniquement pour un devis en autoliquidation BTP.
  siret: '',
  siren: '',
  tvaIntra: '',
  // Vérification du n° de TVA : un numéro reconstitué depuis le SIREN reste
  // CALCULATED_UNVERIFIED. `tvaVerifiedNumber` mémorise le numéro exact qui a
  // été vérifié — le statut retombe si le numéro est modifié ensuite.
  tvaVerificationStatus: '',
  tvaVerifiedNumber: '',
  tvaVerifiedAt: '',
  tvaVerifiedBy: '',
  // Traçabilité d'une confirmation manuelle (source + référence obligatoires)
  // ou date de publication de l'extraction officielle utilisée.
  tvaVerificationSource: '',
  tvaVerificationComment: '',
  tvaVerificationAttachment: '',
  tvaVerificationSourceDate: '',
  nom: '',
  prenom: '',
  adresse: '',
  codePostal: '',
  ville: '',
  telephone: '',
  email: '',
  memeAdresseChantier: true,
  nomChantierDifferent: false,
  nomChantier: '',
  prenomChantier: '',
  adresseChantier: '',
  codePostalChantier: '',
  villeChantier: '',
};

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const slugify = (value) =>
  normalizeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const getPhoneDigits = (value) => normalizeString(value).replace(/\D/g, '');

export const sanitizeClientData = (clientData = {}) => {
  const normalized = {
    ...EMPTY_CLIENT_DATA,
    ...(clientData || {}),
  };

  return {
    savedClientId: normalizeString(normalized.savedClientId),
    clientType: normalizeClientType(normalized.clientType),
    siret: normalizeSiret(normalized.siret),
    siren: normalizeSiren(normalized.siren),
    tvaIntra: normalizeVatNumber(normalized.tvaIntra),
    tvaVerificationStatus: normalizeString(normalized.tvaVerificationStatus),
    tvaVerifiedNumber: normalizeVatNumber(normalized.tvaVerifiedNumber),
    tvaVerifiedAt: normalizeString(normalized.tvaVerifiedAt),
    tvaVerifiedBy: normalizeString(normalized.tvaVerifiedBy),
    tvaVerificationSource: normalizeString(normalized.tvaVerificationSource),
    tvaVerificationComment: normalizeString(normalized.tvaVerificationComment),
    tvaVerificationAttachment: normalizeString(normalized.tvaVerificationAttachment),
    tvaVerificationSourceDate: normalizeString(normalized.tvaVerificationSourceDate),
    nom: normalizeString(normalized.nom),
    prenom: normalizeString(normalized.prenom),
    adresse: normalizeString(normalized.adresse),
    codePostal: normalizeString(normalized.codePostal),
    ville: normalizeString(normalized.ville),
    telephone: normalizeString(normalized.telephone),
    email: normalizeString(normalized.email).toLowerCase(),
    memeAdresseChantier: normalized.memeAdresseChantier !== false,
    nomChantierDifferent: normalized.nomChantierDifferent === true,
    nomChantier: normalizeString(normalized.nomChantier),
    prenomChantier: normalizeString(normalized.prenomChantier),
    adresseChantier: normalizeString(normalized.adresseChantier),
    codePostalChantier: normalizeString(normalized.codePostalChantier),
    villeChantier: normalizeString(normalized.villeChantier),
  };
};

export const getClientFullName = (clientData = {}) => {
  const normalized = sanitizeClientData(clientData);
  return [normalized.prenom, normalized.nom].filter(Boolean).join(' ').trim();
};

export const getClientJobSiteFullName = (clientData = {}) => {
  const normalized = sanitizeClientData(clientData);
  const jobSiteName = [normalized.prenomChantier, normalized.nomChantier]
    .filter(Boolean)
    .join(' ')
    .trim();

  return normalized.nomChantierDifferent && jobSiteName
    ? jobSiteName
    : getClientFullName(normalized);
};

export const getClientDisplayName = (clientData = {}) => {
  const normalized = sanitizeClientData(clientData);
  const fullName = [normalized.prenom, normalized.nom].filter(Boolean).join(' ').trim();

  if (fullName) return fullName;
  if (normalized.email) return normalized.email;
  if (normalized.telephone) return normalized.telephone;
  return 'Client sans nom';
};

export const getClientFullLocation = (clientData = {}) => {
  const normalized = sanitizeClientData(clientData);
  const mainLocation = [normalized.codePostal, normalized.ville].filter(Boolean).join(' ').trim();

  if (mainLocation) return mainLocation;

  return [normalized.codePostalChantier, normalized.villeChantier]
    .filter(Boolean)
    .join(' ')
    .trim();
};

export const hasMeaningfulClientData = (clientData = {}) => {
  const normalized = sanitizeClientData(clientData);

  return Boolean(
    normalized.nom ||
      normalized.prenom ||
      normalized.email ||
      normalized.telephone ||
      normalized.adresse ||
      normalized.ville
  );
};

export const buildClientSearchText = (clientData = {}) => {
  const normalized = sanitizeClientData(clientData);

  return [
    normalized.prenom,
    normalized.nom,
    normalized.siret,
    normalized.siren,
    normalized.tvaIntra,
    normalized.adresse,
    normalized.codePostal,
    normalized.ville,
    normalized.telephone,
    getPhoneDigits(normalized.telephone),
    normalized.email,
    normalized.prenomChantier,
    normalized.nomChantier,
    normalized.adresseChantier,
    normalized.codePostalChantier,
    normalized.villeChantier,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

export const deriveClientDocumentId = (clientData = {}) => {
  const normalized = sanitizeClientData(clientData);

  if (normalized.savedClientId) return normalized.savedClientId;
  if (normalized.email) return `email-${slugify(normalized.email)}`;

  const phoneDigits = getPhoneDigits(normalized.telephone);
  if (phoneDigits) return `tel-${phoneDigits}`;

  const fallback = slugify(
    [
      normalized.prenom,
      normalized.nom,
      normalized.codePostal,
      normalized.ville,
      normalized.codePostalChantier,
      normalized.villeChantier,
    ]
      .filter(Boolean)
      .join(' ')
  );

  return fallback ? `client-${fallback}` : '';
};

export const buildClientRecord = (clientData = {}) => {
  const normalized = sanitizeClientData(clientData);
  const clientId = deriveClientDocumentId(normalized);

  return {
    displayName: getClientDisplayName(normalized),
    fullName: getClientFullName(normalized) || null,
    email: normalized.email || null,
    telephone: normalized.telephone || null,
    telephoneDigits: getPhoneDigits(normalized.telephone) || null,
    city: normalized.ville || normalized.villeChantier || null,
    codePostal: normalized.codePostal || normalized.codePostalChantier || null,
    searchText: buildClientSearchText(normalized),
    payload: {
      ...normalized,
      savedClientId: clientId,
    },
  };
};
