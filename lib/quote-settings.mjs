import { normalizeContractTypeOverride } from './line-nature.mjs';

const DEFAULT_DELIVERY_DELAY = '4/6 semaines';
const DEFAULT_PAYMENT_MODE = 'standard';
// Trois modes de règlement :
//  - 'standard'        : acompte (50/40/30 %) + solde — échéancier 50/50 historique ;
//  - 'schedule'        : échéancier personnalisé en trois étapes (100 % exigés) ;
//  - 'fabricationPose' : acompte 50 %, solde fabrication/fournitures, prestations
//                        chantier — disponible uniquement sur un devis AVEC POSE.
export const PAYMENT_MODES = Object.freeze(['standard', 'schedule', 'fabricationPose']);
const STANDARD_DEPOSIT_OPTIONS = [50, 40, 30];
const VALIDITY_MONTHS_OPTIONS = [1, 2, 3];
const DEFAULT_VALIDITY_MONTHS = 1;
const DELIVERY_DELAY_OPTIONS = [
  '2/4 semaines',
  '4/6 semaines',
  '6/8 semaines',
  '8/10 semaines',
  '10/12 semaines',
];

// Déclencheurs d'exigibilité OBJECTIFS de l'échéancier personnalisé : liste
// fermée (les formulations imprécises type « selon avancement » sont donc
// mécaniquement impossibles), plus « Autre déclencheur précis » à texte
// obligatoire. Les libellés sont ÉVÉNEMENTIELS, jamais des dates calendaires
// impossibles à connaître au devis.
export const PAYMENT_TRIGGER_OPTIONS = Object.freeze([
  { id: 'signature', label: 'Signature du devis', due: 'À la signature' },
  { id: 'commande', label: 'Commande acceptée', due: 'À la commande' },
  {
    id: 'approvisionnement',
    label: 'Approvisionnement réalisé',
    due: "À l'approvisionnement réalisé",
  },
  {
    id: 'debut-fabrication',
    label: 'Démarrage de fabrication',
    due: 'Au démarrage de la fabrication',
  },
  {
    id: 'fin-fabrication',
    label: 'Fabrication terminée',
    due: "À l'achèvement de la fabrication et à réception de la facture correspondante",
  },
  {
    id: 'produits-disponibles',
    label: 'Produits disponibles',
    due: 'À la mise à disposition des produits fabriqués',
  },
  { id: 'livraison', label: 'Livraison réalisée', due: 'À la livraison' },
  {
    id: 'ouverture-chantier',
    label: 'Ouverture de chantier',
    due: "À l'ouverture de chantier",
  },
  {
    id: 'fin-pose',
    label: 'Pose terminée',
    due: "À l'achèvement de la pose et à réception de la facture correspondante",
  },
  { id: 'achevement', label: 'Achèvement des prestations', due: "À l'achèvement" },
  { id: 'autre', label: 'Autre déclencheur précis…', due: '' },
]);

const PAYMENT_TRIGGER_IDS = PAYMENT_TRIGGER_OPTIONS.map((option) => option.id);

export const getPaymentTriggerOptions = () =>
  PAYMENT_TRIGGER_OPTIONS.map((option) => ({ ...option }));

export const getPaymentTriggerById = (triggerId) =>
  PAYMENT_TRIGGER_OPTIONS.find((option) => option.id === triggerId) || null;

const DEFAULT_SETTINGS = Object.freeze({
  paymentMode: DEFAULT_PAYMENT_MODE,
  standardDepositPercent: 50,
  customSignaturePercent: 40,
  customOpeningPercent: 30,
  customBalancePercent: 30,
  // Déclencheurs des trois étapes de l'échéancier personnalisé. Les défauts
  // reproduisent les libellés historiques (signature / ouverture de chantier /
  // achèvement) pour que les devis existants soient rendus à l'identique.
  customStep1TriggerId: 'signature',
  customStep2TriggerId: 'ouverture-chantier',
  customStep3TriggerId: 'achevement',
  customStep1TriggerText: '',
  customStep2TriggerText: '',
  customStep3TriggerText: '',
  // Correction manuelle exceptionnelle du type de contrat détecté
  // ('auto' | 'FOURNITURE_SEULE' | 'AVEC_POSE').
  contractTypeOverride: 'auto',
  deliveryDelayMode: 'preset',
  deliveryDelayPreset: DEFAULT_DELIVERY_DELAY,
  deliveryDelayCustom: '',
  // Durée de validité de l'offre (en mois) : 1 mois par défaut, 2 ou 3 possibles.
  validityMonths: DEFAULT_VALIDITY_MONTHS,
  // Commission commerciale / apporteur d'affaires : pourcentage prélevé sur le total
  // HT après remise et redistribué DANS les prix des menuiseries (au prorata), sans
  // toucher à la pose. Invisible pour le client (aucune ligne « commission »).
  commissionPercent: 0,
});

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value) =>
  Math.round((toFiniteNumber(value) + Number.EPSILON) * 100) / 100;

const normalizePercent = (value) => {
  const parsed = toFiniteNumber(value);
  if (parsed <= 0) return 0;
  if (parsed >= 100) return 100;
  return Math.round(parsed * 100) / 100;
};

const normalizeStandardDepositPercent = (value) => {
  const parsed = normalizePercent(value);
  if (STANDARD_DEPOSIT_OPTIONS.includes(parsed)) {
    return parsed;
  }

  return DEFAULT_SETTINGS.standardDepositPercent;
};

const normalizeValidityMonths = (value) => {
  const parsed = Math.round(toFiniteNumber(value));
  return VALIDITY_MONTHS_OPTIONS.includes(parsed) ? parsed : DEFAULT_VALIDITY_MONTHS;
};

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeDeliveryDelayPreset = (value) => {
  const preset = normalizeString(value);
  if (!preset) return DEFAULT_DELIVERY_DELAY;
  if (DELIVERY_DELAY_OPTIONS.includes(preset)) return preset;
  return preset;
};

const normalizeTriggerId = (value, fallback) =>
  PAYMENT_TRIGGER_IDS.includes(value) ? value : fallback;

export const getDefaultQuoteSettings = () => ({ ...DEFAULT_SETTINGS });

export const getStandardDepositOptions = () => [...STANDARD_DEPOSIT_OPTIONS];

export const getDeliveryDelayOptions = () => [...DELIVERY_DELAY_OPTIONS];

export const getValidityMonthsOptions = () => [...VALIDITY_MONTHS_OPTIONS];

export const normalizeQuoteSettings = (input = {}) => {
  const nextSettings = {
    ...DEFAULT_SETTINGS,
    ...(input || {}),
  };

  const paymentMode = PAYMENT_MODES.includes(nextSettings.paymentMode)
    ? nextSettings.paymentMode
    : DEFAULT_PAYMENT_MODE;
  const deliveryDelayMode =
    nextSettings.deliveryDelayMode === 'custom' ? 'custom' : 'preset';

  return {
    paymentMode,
    standardDepositPercent: normalizeStandardDepositPercent(
      nextSettings.standardDepositPercent
    ),
    customSignaturePercent: normalizePercent(nextSettings.customSignaturePercent),
    customOpeningPercent: normalizePercent(nextSettings.customOpeningPercent),
    customBalancePercent: normalizePercent(nextSettings.customBalancePercent),
    customStep1TriggerId: normalizeTriggerId(
      nextSettings.customStep1TriggerId,
      DEFAULT_SETTINGS.customStep1TriggerId
    ),
    customStep2TriggerId: normalizeTriggerId(
      nextSettings.customStep2TriggerId,
      DEFAULT_SETTINGS.customStep2TriggerId
    ),
    customStep3TriggerId: normalizeTriggerId(
      nextSettings.customStep3TriggerId,
      DEFAULT_SETTINGS.customStep3TriggerId
    ),
    customStep1TriggerText: normalizeString(nextSettings.customStep1TriggerText),
    customStep2TriggerText: normalizeString(nextSettings.customStep2TriggerText),
    customStep3TriggerText: normalizeString(nextSettings.customStep3TriggerText),
    contractTypeOverride: normalizeContractTypeOverride(
      nextSettings.contractTypeOverride
    ),
    deliveryDelayMode,
    deliveryDelayPreset: normalizeDeliveryDelayPreset(nextSettings.deliveryDelayPreset),
    deliveryDelayCustom: normalizeString(nextSettings.deliveryDelayCustom),
    validityMonths: normalizeValidityMonths(nextSettings.validityMonths),
    commissionPercent: normalizePercent(nextSettings.commissionPercent),
  };
};

export const getValidityLabel = (input = {}) => {
  const settings = normalizeQuoteSettings(input);
  return `${settings.validityMonths} mois`;
};

/**
 * Déclencheur d'exigibilité d'une étape (1 à 3) de l'échéancier personnalisé.
 * Retourne { id, dueLabel, isValid } — invalide si « Autre » sans texte.
 */
export const getScheduleTrigger = (input = {}, step = 1) => {
  const settings = normalizeQuoteSettings(input);
  const id = settings[`customStep${step}TriggerId`];
  const text = settings[`customStep${step}TriggerText`];

  if (id === 'autre') {
    return { id, dueLabel: text, isValid: Boolean(text) };
  }

  const option = getPaymentTriggerById(id);
  return { id, dueLabel: option?.due || '', isValid: Boolean(option?.due) };
};

export const getPaymentScheduleValidation = (input = {}) => {
  const settings = normalizeQuoteSettings(input);
  const totalPercent = roundCurrency(
    settings.customSignaturePercent +
      settings.customOpeningPercent +
      settings.customBalancePercent
  );
  const isValid = settings.paymentMode !== 'schedule' || totalPercent === 100;

  return {
    isValid,
    totalPercent,
    differencePercent: roundCurrency(100 - totalPercent),
  };
};

/**
 * Validation COMPLÈTE du plan de règlement, tous modes confondus. Bloque la
 * génération du devis (comme la règle historique des 100 %) tant que :
 *  - échéancier personnalisé : somme ≠ 100 % ou déclencheur « Autre » vide ;
 *  - fabrication/pose : devis sans prestation chantier, ou acompte de 50 %
 *    supérieur au sous-total fabrication/fournitures (échéance 2 négative).
 * `totals` est le résultat de computeQuoteTotals (pour la ventilation).
 */
export const getPaymentPlanValidation = (input = {}, totals = null) => {
  const settings = normalizeQuoteSettings(input);
  const errors = [];

  if (settings.paymentMode === 'schedule') {
    const scheduleValidation = getPaymentScheduleValidation(settings);
    if (!scheduleValidation.isValid) {
      errors.push(
        `L'échéancier doit totaliser 100 % (actuellement ${scheduleValidation.totalPercent} %).`
      );
    }

    [1, 2, 3].forEach((step) => {
      const trigger = getScheduleTrigger(settings, step);
      if (!trigger.isValid) {
        errors.push(
          `Échéance ${step} : précisez un déclencheur d'exigibilité objectif (le déclencheur « Autre » ne peut pas rester vide).`
        );
      }
    });
  }

  if (settings.paymentMode === 'fabricationPose') {
    const breakdown = totals?.breakdown;

    if (!breakdown) {
      errors.push(
        "Ventilation fabrication / chantier indisponible : impossible de calculer l'échéancier fabrication/pose."
      );
    } else {
      const totalTTC = roundCurrency(totals?.totalTTC);
      const chantierTTC = roundCurrency(breakdown?.chantier?.totalTTC);
      const fabricationTTC = roundCurrency(breakdown?.fabrication?.totalTTC);
      const deposit = roundCurrency(totalTTC * 0.5);

      if (chantierTTC <= 0) {
        errors.push(
          "L'échéancier fabrication/pose est réservé aux devis comportant une pose ou des prestations de chantier."
        );
      } else if (roundCurrency(fabricationTTC - deposit) < 0) {
        errors.push(
          "L'acompte de 50 % dépasse le sous-total fabrication et fournitures : l'échéancier fabrication/pose est impossible sur ce devis (échéance 2 négative)."
        );
      }
    }
  }

  return { isValid: errors.length === 0, errors };
};

export const getDeliveryDelayLabel = (input = {}) => {
  const settings = normalizeQuoteSettings(input);

  if (settings.deliveryDelayMode === 'custom' && settings.deliveryDelayCustom) {
    return settings.deliveryDelayCustom;
  }

  return settings.deliveryDelayPreset || DEFAULT_DELIVERY_DELAY;
};

const getPaymentMilestoneDefinitions = (input = {}) => {
  const settings = normalizeQuoteSettings(input);

  if (settings.paymentMode === 'schedule') {
    const step2 = getScheduleTrigger(settings, 2);
    const step2Option = getPaymentTriggerById(settings.customStep2TriggerId);

    return [
      {
        id: 'signature',
        label: 'Acompte',
        percent: settings.customSignaturePercent,
        dueLabel: getScheduleTrigger(settings, 1).dueLabel || 'À la signature',
      },
      {
        id: 'opening',
        label:
          settings.customStep2TriggerId === 'autre'
            ? 'Échéance intermédiaire'
            : step2Option?.label || 'Échéance intermédiaire',
        percent: settings.customOpeningPercent,
        dueLabel: step2.dueLabel || "À l'ouverture de chantier",
      },
      {
        id: 'balance',
        label: 'Solde',
        percent: settings.customBalancePercent,
        dueLabel: getScheduleTrigger(settings, 3).dueLabel || "À l'achèvement",
      },
    ];
  }

  const depositPercent = settings.standardDepositPercent;

  return [
    {
      id: 'deposit',
      label: 'Acompte',
      percent: depositPercent,
      dueLabel: 'À la commande',
    },
    {
      id: 'balance',
      label: 'Solde',
      percent: roundCurrency(100 - depositPercent),
      dueLabel: "À l'achèvement",
    },
  ];
};

// Échéancier FABRICATION / POSE — montants calculés depuis la ventilation :
//   échéance 1 = 50 % du total TTC (imputée sur la fabrication) ;
//   échéance 2 = sous-total fabrication/fournitures TTC − échéance 1 ;
//   échéance 3 = sous-total prestations chantier TTC (écart d'arrondi absorbé).
// L'échéance 2 n'est PAS écrêtée à 0 : une valeur négative doit rester visible
// pour que la validation (getPaymentPlanValidation) bloque le devis.
const getFabricationPoseMilestones = (totalTTC, breakdown) => {
  const safeTotalTTC = roundCurrency(totalTTC);
  const fabricationTTC = roundCurrency(breakdown?.fabrication?.totalTTC);
  const deposit = roundCurrency(safeTotalTTC * 0.5);
  const fabricationBalance = roundCurrency(fabricationTTC - deposit);
  const chantierBalance = roundCurrency(safeTotalTTC - deposit - fabricationBalance);
  const toPercent = (amount) =>
    safeTotalTTC > 0 ? Math.round((amount / safeTotalTTC) * 1000) / 10 : 0;

  return [
    {
      id: 'deposit',
      label: 'Acompte',
      percent: 50,
      dueLabel: 'À la commande',
      amountTTC: deposit,
    },
    {
      id: 'fabrication-balance',
      label: 'Solde fabrication et fournitures',
      percent: toPercent(fabricationBalance),
      dueLabel:
        "À l'achèvement de la fabrication et à réception de la facture correspondante",
      amountTTC: fabricationBalance,
    },
    {
      id: 'chantier',
      label: 'Prestations de chantier',
      percent: toPercent(chantierBalance),
      dueLabel: "À l'achèvement de la pose et à réception de la facture correspondante",
      amountTTC: chantierBalance,
    },
  ];
};

/**
 * Échéances affichées sur le devis. `breakdown` (computeQuoteTotals().breakdown)
 * n'est requis que pour le mode fabrication/pose ; sans lui, ce mode retombe
 * sur un 50/50 défensif (seul l'acompte — identique — est alors fiable, cas du
 * service de signature qui n'affiche que la première échéance).
 */
export const getPaymentMilestones = (input = {}, totalTTC = 0, breakdown = null) => {
  const settings = normalizeQuoteSettings(input);

  if (settings.paymentMode === 'fabricationPose') {
    if (breakdown && Number.isFinite(Number(breakdown?.fabrication?.totalTTC))) {
      return getFabricationPoseMilestones(totalTTC, breakdown);
    }

    const safeTotalTTC = roundCurrency(totalTTC);
    const deposit = roundCurrency(safeTotalTTC * 0.5);
    return [
      {
        id: 'deposit',
        label: 'Acompte',
        percent: 50,
        dueLabel: 'À la commande',
        amountTTC: deposit,
      },
      {
        id: 'balance',
        label: 'Solde',
        percent: 50,
        dueLabel: "À l'achèvement",
        amountTTC: roundCurrency(safeTotalTTC - deposit),
      },
    ];
  }

  const milestones = getPaymentMilestoneDefinitions(settings);
  const safeTotalTTC = roundCurrency(totalTTC);

  return milestones.map((milestone, index) => {
    const previousAmounts = milestones
      .slice(0, index)
      .reduce((sum, previousMilestone) => {
        const previousAmount = roundCurrency((safeTotalTTC * previousMilestone.percent) / 100);
        return sum + previousAmount;
      }, 0);

    const amountTTC =
      index === milestones.length - 1
        ? roundCurrency(safeTotalTTC - previousAmounts)
        : roundCurrency((safeTotalTTC * milestone.percent) / 100);

    return {
      ...milestone,
      amountTTC: Math.max(0, amountTTC),
    };
  });
};

// « À la commande » → « à la commande » : pour tout fragment réutilisé en
// milieu de phrase (déclencheur d'échéance, phrase de règlement citée en CGV).
const lowercaseFirst = (value) => {
  const text = normalizeString(value);
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : '';
};

export const buildPaymentTermsSentence = (input = {}) => {
  const settings = normalizeQuoteSettings(input);

  if (settings.paymentMode === 'schedule') {
    const dues = [1, 2, 3].map(
      (step) => lowercaseFirst(getScheduleTrigger(settings, step).dueLabel) || 'à préciser'
    );
    return [
      `Règlement selon échéancier personnalisé : ${settings.customSignaturePercent}% ${dues[0]},`,
      `${settings.customOpeningPercent}% ${dues[1]},`,
      `${settings.customBalancePercent}% ${dues[2]}.`,
    ].join(' ');
  }

  if (settings.paymentMode === 'fabricationPose') {
    return [
      "Règlement en trois échéances : acompte de 50% du total TTC à la commande,",
      "solde de la part fabrication et fournitures à l'achèvement de la fabrication et à réception de la facture correspondante,",
      "puis règlement des prestations de chantier à l'achèvement de la pose (montants détaillés au tableau de financement).",
    ].join(' ');
  }

  const depositPercent = settings.standardDepositPercent;
  const balancePercent = roundCurrency(100 - depositPercent);
  // Le premier « ou » coordonne deux alternatives complètes (moment + moyen) :
  // virement à la commande, ou remise d'un chèque / virement le jour du métré.
  // Ne pas revenir à « à la commande, ou par chèque ou virement… » : la
  // suppression de la carte bancaire (CGV 2026.07.2) avait laissé la première
  // branche sans moyen de paiement, d'où un « ou … ou » sans rattachement.
  return [
    `Règlement d'un acompte de ${depositPercent}% par virement à la commande`,
    "ou, si un métré SARANGE est prévu, par chèque ou virement lors de la prise de côtes,",
    `puis solde de ${balancePercent}% à l'achèvement.`,
  ].join(' ');
};

export const buildPaymentTermsForPdf = (input = {}) => {
  const deliveryDelayLabel = getDeliveryDelayLabel(input);

  return [
    "Les produits demeurent la propriété de SARANGE jusqu'au paiement intégral du prix, dans les conditions précisées aux CGV.",
    "Le règlement peut s'effectuer par virement bancaire ou par chèque. Un règlement par virement n'est considéré comme effectué qu'après crédit effectif du compte bancaire de SARANGE ; un chèque n'est considéré comme encaissé qu'après sa remise à SARANGE et sous réserve de son encaissement effectif.",
    buildPaymentTermsSentence(input),
    "Aucun approvisionnement ni lancement en fabrication avant encaissement effectif de l'acompte ; aucune livraison ni pose avant encaissement des échéances déjà exigibles.",
    'Coordonnées bancaires (RIB) : FR76 1010 7002 2500 0170 5433 705.',
    `!!**SARANGE assure le suivi après-vente de ses ouvrages pendant dix ans.**!! Délais matériels indicatifs : ${deliveryDelayLabel}.`,
  ];
};

export const buildPaymentLegalParagraph = (input = {}) => {
  const scheduleSentence = buildPaymentTermsSentence(input);
  return [
    // La phrase d'échéancier est ici citée en milieu de phrase : minuscule
    // initiale, sinon « sauf mention contraire, Règlement d'un acompte… ».
    `2.2. Modalités : sauf mention contraire, ${lowercaseFirst(scheduleSentence)}`,
    "Le règlement peut s'effectuer par virement bancaire ou par chèque.",
    "Aucun escompte n'est accordé pour paiement anticipé.",
    'Les conditions particulières de règlement figurant au devis reprennent l’échéancier sélectionné ; en cas de différence, elles prévalent sur la présente clause.',
  ].join(' ');
};
