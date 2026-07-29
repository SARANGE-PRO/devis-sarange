/**
 * company-insurance.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Assurance décennale de SARANGE — paramètres société éditables (onglet
 * Paramètres) au lieu d'un texte 2026 codé en dur : assureur, numéro de
 * contrat, activités couvertes, période de validité, lien vers l'attestation.
 *
 * `getInsuranceStatus` alimente l'alerte d'expiration : avertissement fort
 * lorsque l'attestation est expirée (ou expire bientôt) sur un devis avec pose.
 *
 * Module pur, sans import : testable par le runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Valeurs du contrat actuellement en vigueur (reprises des anciens textes en
// dur) : utilisées tant que l'utilisateur n'a rien modifié dans Paramètres.
export const DEFAULT_COMPANY_INSURANCE = Object.freeze({
  insurer: 'BPCE IARD',
  contractNumber: '194388251 R 002',
  activities: 'Fabrication et pose de menuiseries extérieures',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  attestationUrl: '',
});

// Seuil de pré-alerte avant expiration (renouvellement d'attestation).
export const INSURANCE_EXPIRY_WARNING_DAYS = 45;

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

// Dates au format ISO AAAA-MM-JJ (valeur des <input type="date">).
const normalizeIsoDate = (value) => {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
};

export const normalizeCompanyInsurance = (input = {}) => {
  const raw = input && typeof input === 'object' ? input : {};

  return {
    insurer: normalizeText(raw.insurer) || DEFAULT_COMPANY_INSURANCE.insurer,
    contractNumber:
      normalizeText(raw.contractNumber) || DEFAULT_COMPANY_INSURANCE.contractNumber,
    activities: normalizeText(raw.activities) || DEFAULT_COMPANY_INSURANCE.activities,
    startDate: normalizeIsoDate(raw.startDate) || DEFAULT_COMPANY_INSURANCE.startDate,
    endDate: normalizeIsoDate(raw.endDate) || DEFAULT_COMPANY_INSURANCE.endDate,
    attestationUrl: normalizeText(raw.attestationUrl),
  };
};

export const formatInsuranceDateFr = (isoDate) => {
  const normalized = normalizeIsoDate(isoDate);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
};

export const getInsurancePeriodLabel = (input = {}) => {
  const insurance = normalizeCompanyInsurance(input);
  const start = formatInsuranceDateFr(insurance.startDate);
  const end = formatInsuranceDateFr(insurance.endDate);
  if (start && end) return `du ${start} au ${end}`;
  if (end) return `jusqu'au ${end}`;
  return '';
};

/**
 * Statut de validité de l'attestation à une date de référence donnée.
 * L'attestation couvre la journée de `endDate` entière (expirée le lendemain).
 */
export const getInsuranceStatus = (input = {}, referenceDate = new Date()) => {
  const insurance = normalizeCompanyInsurance(input);
  const reference =
    referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
      ? referenceDate
      : new Date();

  const endOfCoverage = new Date(`${insurance.endDate}T23:59:59.999`);
  const millisecondsLeft = endOfCoverage.getTime() - reference.getTime();
  const daysLeft = Math.ceil(millisecondsLeft / (24 * 60 * 60 * 1000));
  const isExpired = millisecondsLeft < 0;

  return {
    isExpired,
    expiresSoon: !isExpired && daysLeft <= INSURANCE_EXPIRY_WARNING_DAYS,
    daysLeft,
    endDateLabel: formatInsuranceDateFr(insurance.endDate),
    periodLabel: getInsurancePeriodLabel(insurance),
  };
};
