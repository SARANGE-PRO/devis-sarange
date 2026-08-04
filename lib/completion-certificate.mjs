/**
 * completion-certificate.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Statuts, numérotation et helpers purs du « bon de fin de chantier » (PV de
 * réception des travaux, art. 1792-6 du Code civil). Miroir de
 * lib/quote-signature.js, pour le cycle de vie séparé du bon plutôt que celui
 * de la signature du devis.
 *
 * Module pur (aucun import interne autre que ce fichier) : testable par le
 * runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const STATUS_FALLBACK = 'pending';

export const COMPLETION_STATUSES = [
  'pending',
  'sent',
  'viewed',
  'received_no_reserves',
  'received_with_reserves',
  'reserves_lifted',
  'refused',
  'expired',
];

export const COMPLETION_STATUS_META = {
  pending: { label: 'Non généré', className: 'bg-slate-100 text-slate-600' },
  sent: { label: 'Envoyé', className: 'bg-blue-100 text-blue-700' },
  viewed: { label: 'Consulté', className: 'bg-cyan-100 text-cyan-700' },
  received_no_reserves: { label: 'Réceptionné, sans réserve', className: 'bg-green-100 text-green-700' },
  received_with_reserves: { label: 'Réceptionné, avec réserves', className: 'bg-amber-100 text-amber-700' },
  reserves_lifted: { label: 'Réserves levées', className: 'bg-green-100 text-green-700' },
  refused: { label: 'Refusé', className: 'bg-rose-100 text-rose-700' },
  expired: { label: 'Expiré', className: 'bg-amber-100 text-amber-700' },
};

export const DEFAULT_COMPLETION_EXPIRY_DAYS = 60;

// Relances manuelles du bon non signé, même cadence que les devis
// (QUOTE_SIGNATURE_REMINDER_META dans lib/quote-signature.js).
export const COMPLETION_REMINDER_META = {
  1: { level: 1, label: 'Relance J+3', shortLabel: 'J+3' },
  2: { level: 2, label: 'Relance J+10', shortLabel: 'J+10' },
  3: { level: 3, label: 'Relance J+30', shortLabel: 'J+30' },
};

export const getCompletionReminderMeta = (level) =>
  COMPLETION_REMINDER_META[Number(level)] || null;

// Taux de retenue de garantie (art. 4.5 des CGV avec pose) : 5% du montant
// total TTC du devis, prélevé sur le solde en cas de réserves. Voir
// lib/cgv-templates.mjs pour la clause contractuelle correspondante.
export const RETENTION_DE_GARANTIE_RATE = 0.05;

// Délai standard de levée des réserves proposé par défaut sur le bon (le
// module client ne permet pas de négocier un délai ligne par ligne).
export const DEFAULT_RESERVE_LIFT_DELAY_DAYS = 30;

/* ─── Type de document ───────────────────────────────────────────────────── */
// AVEC POSE  → 'reception'  : PV de réception des travaux (art. 1792-6).
// SANS POSE  → 'enlevement' ou 'livraison' : bon de remise des produits —
// choisi MANUELLEMENT à l'envoi (jamais deviné), seule la détection
// pose/fourniture seule est automatique (resolveContractType, comme pour la
// TVA et les CGV).
export const COMPLETION_DOC_TYPES = ['reception', 'enlevement', 'livraison'];

export const normalizeCompletionDocType = (value) =>
  COMPLETION_DOC_TYPES.includes(value) ? value : 'reception';

export const getCompletionDocTypeLabel = (docType) => {
  switch (normalizeCompletionDocType(docType)) {
    case 'enlevement':
      return "bon d'enlèvement";
    case 'livraison':
      return 'bon de livraison';
    default:
      return 'bon de fin de chantier';
  }
};

// Critères de satisfaction : mêmes CLÉS quel que soit le type (stockage et
// statistiques homogènes), seuls les libellés s'adaptent — pas de « qualité
// de la pose » sur une fourniture seule.
export const getCompletionRatingCriteria = (docType) =>
  normalizeCompletionDocType(docType) === 'reception'
    ? [
        { key: 'pose', label: 'Qualité de la pose' },
        { key: 'proprete', label: 'Propreté du chantier' },
        { key: 'relation', label: "Relation avec l'équipe" },
      ]
    : [
        { key: 'pose', label: 'Qualité des produits' },
        { key: 'proprete', label: 'Conformité de la commande' },
        { key: 'relation', label: "Relation avec l'équipe" },
      ];

const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === '[object Object]';

export const normalizeCompletionStatus = (value) => {
  if (typeof value !== 'string') return STATUS_FALLBACK;
  const normalized = value.trim().toLowerCase();
  return COMPLETION_STATUSES.includes(normalized) ? normalized : STATUS_FALLBACK;
};

export const getCompletionStatusMeta = (status) =>
  COMPLETION_STATUS_META[normalizeCompletionStatus(status)] ||
  COMPLETION_STATUS_META[STATUS_FALLBACK];

export const getCompletionWorkflow = (quote) =>
  isPlainObject(quote?.completionWorkflow) ? quote.completionWorkflow : {};

export const getCompletionDisplayStatus = (quote) =>
  normalizeCompletionStatus(getCompletionWorkflow(quote).status);

export const completionHasReserves = (status) =>
  ['received_with_reserves'].includes(normalizeCompletionStatus(status));

// Numéro du bon : BFC-{AA}{JJJ}{HHmm}, même format que les devis (DV-…) mais
// préfixe distinct — voir generateQuoteNumber dans lib/quote-signature.js.
const buildStampedNumber = (prefix, date) => {
  const sourceDate = date instanceof Date ? date : new Date(date);

  const year = String(sourceDate.getFullYear()).slice(-2);
  const startOfYear = new Date(sourceDate.getFullYear(), 0, 0);
  const diff = sourceDate - startOfYear;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  const dayOfYearPadded = String(dayOfYear).padStart(3, '0');

  const hours = String(sourceDate.getHours()).padStart(2, '0');
  const minutes = String(sourceDate.getMinutes()).padStart(2, '0');

  return `${prefix}-${year}${dayOfYearPadded}${hours}${minutes}`;
};

export const generateCompletionNumber = (date = new Date()) => buildStampedNumber('BFC', date);

// PV de levée des réserves : préfixe LR, référencé au bon d'origine.
export const generateLiftNumber = (date = new Date()) => buildStampedNumber('LR', date);

export const buildCompletionSignaturePageHref = (sessionId) =>
  `/reception/${encodeURIComponent(String(sessionId || ''))}`;

export const buildCompletionDocumentHref = (sessionId, type = 'original') =>
  `/api/completion-certificates/${encodeURIComponent(String(sessionId || ''))}/document?type=${encodeURIComponent(type)}`;

export const getCompletionExpiryDays = () => {
  const rawValue = Number.parseInt(process.env.NEXT_PUBLIC_COMPLETION_SIGNATURE_EXPIRY_DAYS, 10);
  if (Number.isFinite(rawValue) && rawValue > 0) {
    return rawValue;
  }
  return DEFAULT_COMPLETION_EXPIRY_DAYS;
};

/**
 * Calcule le solde à réclamer sur le bon. `reservesLifted` ne s'applique pas
 * ici : la retenue n'est calculée qu'au moment de l'émission du bon, sa
 * libération ultérieure est un événement séparé (voir le flux de levée de
 * réserves), pas un recalcul de ce même document.
 */
export const computeCompletionBalance = ({
  totalDevisTTC = 0,
  acompteRecu = 0,
  hasReserves = false,
  retentionEligible = false,
}) => {
  const total = Number(totalDevisTTC) || 0;
  const acompte = Number(acompteRecu) || 0;
  const soldeAvantRetenue = Math.max(0, total - acompte);
  const retenue = hasReserves && retentionEligible
    ? Math.round(total * RETENTION_DE_GARANTIE_RATE * 100) / 100
    : 0;
  const soldeAPercevoir = Math.max(0, soldeAvantRetenue - retenue);

  return {
    totalDevisTTC: total,
    acompteRecu: acompte,
    soldeAvantRetenue,
    retenueGarantie: retenue,
    soldeAPercevoir,
  };
};
