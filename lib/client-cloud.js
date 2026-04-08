export const EMPTY_CLIENT_DATA = {
  savedClientId: '',
  nom: '',
  prenom: '',
  referenceDevis: '',
  adresse: '',
  codePostal: '',
  ville: '',
  telephone: '',
  email: '',
  memeAdresseChantier: true,
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
    nom: normalizeString(normalized.nom),
    prenom: normalizeString(normalized.prenom),
    referenceDevis: normalizeString(normalized.referenceDevis),
    adresse: normalizeString(normalized.adresse),
    codePostal: normalizeString(normalized.codePostal),
    ville: normalizeString(normalized.ville),
    telephone: normalizeString(normalized.telephone),
    email: normalizeString(normalized.email).toLowerCase(),
    memeAdresseChantier: normalized.memeAdresseChantier !== false,
    adresseChantier: normalizeString(normalized.adresseChantier),
    codePostalChantier: normalizeString(normalized.codePostalChantier),
    villeChantier: normalizeString(normalized.villeChantier),
  };
};

export const getClientFullName = (clientData = {}) => {
  const normalized = sanitizeClientData(clientData);
  return [normalized.prenom, normalized.nom].filter(Boolean).join(' ').trim();
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
    normalized.referenceDevis,
    normalized.adresse,
    normalized.codePostal,
    normalized.ville,
    normalized.telephone,
    getPhoneDigits(normalized.telephone),
    normalized.email,
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
    referenceHint: normalized.referenceDevis || null,
    searchText: buildClientSearchText(normalized),
    payload: {
      ...normalized,
      savedClientId: clientId,
    },
  };
};
