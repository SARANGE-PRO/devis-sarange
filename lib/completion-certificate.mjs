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

// Échéance finale en cas de réserves (art. 4.5 des CGV avec pose) : 5 % du
// montant total TTC du devis, non exigibles à la réception, exigibles dès la
// levée écrite de l'ensemble des réserves. C'est une modalité contractuelle
// de paiement convenue au devis, PAS une retenue de garantie au sens de la
// loi n° 71-584 du 16 juillet 1971 — ne jamais la présenter comme telle.
// Voir lib/cgv-templates.mjs pour la clause contractuelle correspondante.
// (Le nom du taux et les clés stockées `retenueGarantie` sont conservés pour
// la compatibilité des sessions et workflows Firestore déjà enregistrés.)
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

/**
 * Textes du document selon son type, partagés entre le rendu PDF
 * (lib/completion-pdf-generator.js) et les tests. AVEC POSE → PV de
 * réception des travaux (art. 1792-6, garanties travaux). SANS POSE → bon
 * d'enlèvement ou de livraison : constat de remise des produits, garanties
 * de conformité / vices cachés / fabricant et transfert des risques —
 * jamais de garanties travaux ni d'échéance finale (mécanisme réservé aux
 * marchés de travaux).
 */
export const getDocTypeTexts = (docType = 'reception') => {
  if (docType === 'enlevement' || docType === 'livraison') {
    const isEnlevement = docType === 'enlevement';
    return {
      title: isEnlevement ? "BON D'ENLÈVEMENT" : 'BON DE LIVRAISON',
      subtitle: 'Constat contradictoire de remise des produits (fourniture sans pose)',
      worksTitle: 'PRODUITS REMIS',
      sectionTitle: 'REMISE DES PRODUITS',
      lead: `Le client reconnaît que les produits désignés ci-dessus, conformes au devis référencé, lui ont été ${
        isEnlevement ? 'remis lors de leur enlèvement en atelier' : "livrés à l'adresse indiquée"
      } ce jour, et qu'il a pu en vérifier l'état et la conformité au moment de la remise.`,
      withoutReserves: 'Remise SANS réserve.',
      withReserves: 'Remise AVEC réserves :',
      dateLabel: 'Remise',
      soldeLabel: 'SOLDE DÛ À LA REMISE',
      guaranteesTitle: 'GARANTIES — EFFETS DE LA REMISE',
      guarantees: [
        'Garantie légale de conformité et garantie des vices cachés : les produits en bénéficient dans les conditions prévues par la loi.',
        'Garanties fabricant : certains composants bénéficient de garanties propres de leurs fabricants, transmises au client.',
        'Transfert des risques : la garde et les risques des produits sont transférés au client à compter de la présente remise.',
      ],
      mention: (hasReserves) =>
        `Bon pour ${isEnlevement ? 'enlèvement' : 'livraison'} des produits, ${
          hasReserves ? 'avec les réserves ci-dessus' : 'sans réserve'
        }`,
    };
  }
  return {
    title: 'BON DE FIN DE CHANTIER',
    subtitle: 'Procès-verbal de réception des travaux (article 1792-6 du Code civil)',
    worksTitle: 'OUVRAGES RÉCEPTIONNÉS',
    sectionTitle: 'RÉCEPTION DES TRAVAUX',
    // Formulation UNIQUE, valable avec comme sans réserves : les conditions
    // (sans réserve / avec réserves) sont détaillées juste en dessous.
    lead: "Le client, maître d'ouvrage, après visite contradictoire des ouvrages exécutés au titre du devis référencé ci-dessus, prononce ce jour leur réception dans les conditions indiquées ci-dessous.",
    withoutReserves: 'Réception SANS réserve.',
    withReserves: 'Réception AVEC réserves :',
    dateLabel: 'Réception',
    soldeLabel: 'SOLDE DÛ À RÉCEPTION',
    guaranteesTitle: 'GARANTIES – EFFETS DE LA RÉCEPTION',
    guarantees: [
      "Garantie de parfait achèvement : pendant un an à compter de la réception, elle couvre les réserves mentionnées au présent procès-verbal ainsi que les désordres révélés postérieurement à la réception et notifiés par écrit dans ce délai.",
      "Garantie de bon fonctionnement : elle s'applique pendant deux ans aux éléments d'équipement dissociables, lorsque ses conditions légales d'application sont réunies.",
      "Responsabilité décennale : elle s'applique pendant dix ans aux désordres entrant dans son champ légal. SARANGE est assurée auprès de BPCE IARD sous le contrat n° 194388251 R 002, dans les limites des activités et de la période couvertes par l'attestation d'assurance.",
    ],
    mention: (hasReserves) =>
      `Bon pour réception des travaux, ${hasReserves ? 'avec les réserves ci-dessus' : 'sans réserve'}`,
  };
};

/**
 * Phrase explicative des modalités de paiement affichée dans la section
 * réception du PV, UNIQUEMENT en cas de réserves sur un flux lié à un devis
 * (montant connu). Deux cas selon que les CGV figées du devis contenaient la
 * clause d'échéance finale (art. 4.5) ou non.
 */
export const getReceptionReservesPaymentText = (retentionEligible) =>
  retentionEligible
    ? "Échéance finale : conformément à l'article 4.5 des CGV du devis d'origine, le montant exigible à la date de réception est limité à 95 % du montant total TTC du devis. L'échéance finale de 5 % n'est pas exigible à la réception : elle devient exigible dès la levée écrite de l'ensemble des réserves."
    : "Le devis d'origine ne prévoit pas d'échéance finale en cas de réserves : le solde ci-dessous reste dû en totalité malgré les réserves.";

/**
 * Lignes d'affichage du bloc de règlement du PV, sous forme de données pures
 * (le rendu PDF ne fait que les dessiner ; les tests les vérifient telles
 * quelles). En cas de réserves avec clause d'échéance finale : détail
 * complet mandaté (total, encaissé, exigible à réception = 95 %, échéance
 * finale 5 % affichée SÉPARÉMENT, jamais comme une somme déjà facturée ou
 * simplement impayée) + note d'exigibilité sous le calcul. Sinon : détail
 * classique, aucun mécanisme de 5 %.
 */
export const buildCompletionBalanceDisplay = ({ balance, hasReserves, soldeLabel = 'SOLDE DÛ À RÉCEPTION' } = {}) => {
  const total = Number(balance?.totalDevisTTC) || 0;
  const acompte = Number(balance?.acompteRecu) || 0;
  const echeanceFinale = Number(balance?.retenueGarantie) || 0;
  const applyFinalInstallment = Boolean(hasReserves) && echeanceFinale > 0;

  if (!applyFinalInstallment) {
    return {
      rows: [
        { label: 'Total devis TTC', amount: total, isDeduction: false },
        { label: 'Acompte déjà réglé', amount: acompte, isDeduction: true },
      ],
      totalLabel: soldeLabel,
      totalAmount: Number(balance?.soldeAPercevoir) || 0,
      note: '',
    };
  }

  return {
    rows: [
      { label: 'Total du devis TTC', amount: total, isDeduction: false },
      { label: 'Sommes déjà encaissées', amount: acompte, isDeduction: true },
      { label: 'Montant exigible à réception (95 % du total TTC)', amount: total - echeanceFinale, isDeduction: false },
      { label: 'Échéance finale après levée des réserves (5 %)', amount: echeanceFinale, isDeduction: false },
    ],
    totalLabel: 'MONTANT À RÉGLER À RÉCEPTION',
    totalAmount: Number(balance?.soldeAPercevoir) || 0,
    note: "L'échéance finale de 5 % deviendra exigible après validation de la levée de l'ensemble des réserves.",
  };
};

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
 * Calcule le montant à régler à réception. En cas de réserves sur un devis
 * dont les CGV contiennent la clause d'échéance finale (art. 4.5) : le
 * montant exigible à réception est limité à 95 % du total TTC, déduction
 * faite des sommes déjà encaissées ; les 5 % restants (clé stockée
 * `retenueGarantie`, nom conservé pour compatibilité Firestore) forment une
 * échéance distincte exigible à la levée écrite des réserves. `reservesLifted`
 * ne s'applique pas ici : l'échéance finale n'est calculée qu'au moment de
 * l'émission du bon, son exigibilité ultérieure est un événement séparé
 * (voir le flux de levée de réserves), pas un recalcul de ce même document.
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
