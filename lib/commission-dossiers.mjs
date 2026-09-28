/**
 * commission-dossiers.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Suivi des commissions de vente : dossiers apportés via le site internet ou
 * saisis à la main, avec prix SARANGE, prix de vente et paiements reçus.
 *
 * Règles métier :
 *  - la commission n'existe que sur un dossier VENDU dont les deux prix sont
 *    renseignés : prix de vente - prix SARANGE ;
 *  - le solde dû = commission - déjà payé par SARANGE ;
 *  - le total dû affiché en tête de page = somme des commissions - somme des
 *    paiements : il diminue dès qu'un paiement est saisi.
 *
 * Page discrète /commissions : réservée aux administrateurs, derrière un code
 * à 4 chiffres (voir app/commissions/page.js). Les données vivent dans la
 * collection Firestore `commissionDossiers` (serveur uniquement, comme
 * quoteSignatureSessions) via les routes app/api/commissions/*.
 *
 * Module pur (aucun import) : testable par le runner Node, partagé par le
 * navigateur (affichage, calculs) et le serveur (validation).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const COMMISSION_STATUSES = Object.freeze([
  Object.freeze({ value: 'attente-devis', label: 'En attente de devis' }),
  Object.freeze({ value: 'devis-envoye', label: 'Devis envoyé' }),
  Object.freeze({ value: 'vendu', label: 'Vendu' }),
  Object.freeze({ value: 'perdu', label: 'Perdu' }),
]);

export const DEFAULT_COMMISSION_STATUS = 'attente-devis';

export const COMMISSION_SOURCES = Object.freeze({ MANUAL: 'manuel', WEBSITE: 'site-web' });

/** Plafond par fichier joint : la limite hébergeur est ~4,5 Mo par requête et
 *  le base64 gonfle d'un tiers, donc 3 Mo de fichier utile maximum. */
export const MAX_COMMISSION_DOCUMENT_BYTES = 3 * 1024 * 1024;
export const MAX_COMMISSION_DOCUMENTS = 20;
export const MAX_COMMISSION_LABEL_LENGTH = 200;

export const normalizeCommissionStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return COMMISSION_STATUSES.some((status) => status.value === normalized)
    ? normalized
    : DEFAULT_COMMISSION_STATUS;
};

export const commissionStatusLabel = (value) =>
  COMMISSION_STATUSES.find((status) => status.value === normalizeCommissionStatus(value))?.label || '';

const roundMoney = (value) => Math.round(value * 100) / 100;

/**
 * Saisie d'un montant en euros : accepte « 1 234,56 », « 1234.56 », un nombre,
 * une chaîne vide. Renvoie un nombre >= 0 arrondi au centime, ou null si la
 * saisie est vide ou invalide (les prix négatifs n'ont pas de sens ici).
 */
export const parseMoneyInput = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? roundMoney(value) : null;
  }
  const text = String(value ?? '')
    .replace(/[€\s  ]/g, '')
    .replace(',', '.');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? roundMoney(parsed) : null;
};

export const formatMoney = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
    : '';

export const normalizeCommissionDocument = (raw) => ({
  id: String(raw?.id || '').trim(),
  name: String(raw?.name || 'document').trim().slice(0, 200) || 'document',
  path: String(raw?.path || '').trim(),
  size: Number.isFinite(Number(raw?.size)) && Number(raw?.size) > 0 ? Number(raw.size) : 0,
  contentType: String(raw?.contentType || 'application/octet-stream').trim(),
  uploadedAt: raw?.uploadedAt || null,
  uploadedBy: String(raw?.uploadedBy || '').trim(),
});

export const normalizeCommissionDossier = (raw) => ({
  id: String(raw?.id || '').trim(),
  label: String(raw?.label || '').trim().slice(0, MAX_COMMISSION_LABEL_LENGTH),
  status: normalizeCommissionStatus(raw?.status),
  purchasePrice: parseMoneyInput(raw?.purchasePrice),
  salePrice: parseMoneyInput(raw?.salePrice),
  paidAmount: parseMoneyInput(raw?.paidAmount) ?? 0,
  source: raw?.source === COMMISSION_SOURCES.WEBSITE ? COMMISSION_SOURCES.WEBSITE : COMMISSION_SOURCES.MANUAL,
  leadClientId: String(raw?.leadClientId || '').trim(),
  documents: (Array.isArray(raw?.documents) ? raw.documents : [])
    .map(normalizeCommissionDocument)
    .filter((entry) => entry.id),
  createdAt: raw?.createdAt || null,
  updatedAt: raw?.updatedAt || null,
});

/**
 * Commission d'un dossier : uniquement s'il est VENDU et que les deux prix
 * sont renseignés. Un dossier vendu à moitié chiffré n'affiche rien plutôt
 * qu'un montant faux.
 */
export const computeCommission = (dossier) => {
  const normalized = normalizeCommissionDossier(dossier);
  if (normalized.status !== 'vendu') return null;
  if (normalized.salePrice === null || normalized.purchasePrice === null) return null;
  return roundMoney(normalized.salePrice - normalized.purchasePrice);
};

/**
 * Solde dû par SARANGE sur un dossier : commission - déjà payé. Null quand il
 * n'y a ni commission ni paiement (rien à afficher).
 */
export const computeBalance = (dossier) => {
  const commission = computeCommission(dossier);
  const paid = parseMoneyInput(dossier?.paidAmount) ?? 0;
  if (commission === null && paid === 0) return null;
  return roundMoney((commission ?? 0) - paid);
};

/**
 * Totaux affichés en tête de page. `dueTotal` = commissions - paiements : il
 * se met à jour dès qu'un paiement est saisi sur n'importe quel dossier.
 */
export const computeCommissionTotals = (dossiers) => {
  const list = Array.isArray(dossiers) ? dossiers : [];
  let commissionTotal = 0;
  let paidTotal = 0;
  let soldCount = 0;
  list.forEach((dossier) => {
    const commission = computeCommission(dossier);
    if (commission !== null) commissionTotal += commission;
    if (normalizeCommissionStatus(dossier?.status) === 'vendu') soldCount += 1;
    paidTotal += parseMoneyInput(dossier?.paidAmount) ?? 0;
  });
  return {
    commissionTotal: roundMoney(commissionTotal),
    paidTotal: roundMoney(paidTotal),
    dueTotal: roundMoney(commissionTotal - paidTotal),
    soldCount,
    count: list.length,
  };
};

/**
 * Champs modifiables d'un dossier, filtrés depuis un payload client : seules
 * les clés PRÉSENTES dans `raw` sont renvoyées (mise à jour partielle).
 */
export const sanitizeCommissionDossierInput = (raw) => {
  const input = raw && typeof raw === 'object' ? raw : {};
  const updates = {};
  if ('label' in input) {
    updates.label = String(input.label || '').trim().slice(0, MAX_COMMISSION_LABEL_LENGTH);
  }
  if ('status' in input) updates.status = normalizeCommissionStatus(input.status);
  if ('purchasePrice' in input) updates.purchasePrice = parseMoneyInput(input.purchasePrice);
  if ('salePrice' in input) updates.salePrice = parseMoneyInput(input.salePrice);
  if ('paidAmount' in input) updates.paidAmount = parseMoneyInput(input.paidAmount) ?? 0;
  return updates;
};

/** Intitulé lisible d'un dossier créé depuis un lead du site internet. */
export const buildLeadDossierLabel = ({ nom = '', prenom = '', ville = '' } = {}) => {
  const name = [String(nom || '').trim(), String(prenom || '').trim()].filter(Boolean).join(' ');
  const city = String(ville || '').trim();
  if (name && city) return `${name} (${city})`;
  return name || city || 'Demande du site';
};
