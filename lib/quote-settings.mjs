const DEFAULT_DELIVERY_DELAY = '4/6 semaines';
const DEFAULT_PAYMENT_MODE = 'standard';
const STANDARD_DEPOSIT_OPTIONS = [50, 40, 30];
const DELIVERY_DELAY_OPTIONS = [
  '2/4 semaines',
  '4/6 semaines',
  '6/8 semaines',
  '8/10 semaines',
  '10/12 semaines',
];

const DEFAULT_SETTINGS = Object.freeze({
  paymentMode: DEFAULT_PAYMENT_MODE,
  standardDepositPercent: 50,
  customSignaturePercent: 40,
  customOpeningPercent: 30,
  customBalancePercent: 30,
  deliveryDelayMode: 'preset',
  deliveryDelayPreset: DEFAULT_DELIVERY_DELAY,
  deliveryDelayCustom: '',
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

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeDeliveryDelayPreset = (value) => {
  const preset = normalizeString(value);
  if (!preset) return DEFAULT_DELIVERY_DELAY;
  if (DELIVERY_DELAY_OPTIONS.includes(preset)) return preset;
  return preset;
};

export const getDefaultQuoteSettings = () => ({ ...DEFAULT_SETTINGS });

export const getStandardDepositOptions = () => [...STANDARD_DEPOSIT_OPTIONS];

export const getDeliveryDelayOptions = () => [...DELIVERY_DELAY_OPTIONS];

export const normalizeQuoteSettings = (input = {}) => {
  const nextSettings = {
    ...DEFAULT_SETTINGS,
    ...(input || {}),
  };

  const paymentMode = nextSettings.paymentMode === 'schedule' ? 'schedule' : 'standard';
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
    deliveryDelayMode,
    deliveryDelayPreset: normalizeDeliveryDelayPreset(nextSettings.deliveryDelayPreset),
    deliveryDelayCustom: normalizeString(nextSettings.deliveryDelayCustom),
  };
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
    return [
      {
        id: 'signature',
        label: 'Acompte',
        percent: settings.customSignaturePercent,
        dueLabel: 'À la signature',
      },
      {
        id: 'opening',
        label: 'Ouverture de chantier',
        percent: settings.customOpeningPercent,
        dueLabel: "À l'ouverture de chantier",
      },
      {
        id: 'balance',
        label: 'Solde',
        percent: settings.customBalancePercent,
        dueLabel: "À l'achèvement",
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

export const getPaymentMilestones = (input = {}, totalTTC = 0) => {
  const milestones = getPaymentMilestoneDefinitions(input);
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

export const buildPaymentTermsSentence = (input = {}) => {
  const settings = normalizeQuoteSettings(input);

  if (settings.paymentMode === 'schedule') {
    return [
      `Règlement selon échéancier personnalisé : ${settings.customSignaturePercent}% à la signature,`,
      `${settings.customOpeningPercent}% à l'ouverture de chantier,`,
      `${settings.customBalancePercent}% à l'achèvement.`,
    ].join(' ');
  }

  const depositPercent = settings.standardDepositPercent;
  const balancePercent = roundCurrency(100 - depositPercent);
  return `Règlement d'un acompte de ${depositPercent}% à la commande, solde de ${balancePercent}% à l'achèvement.`;
};

export const buildPaymentTermsForPdf = (input = {}) => {
  const deliveryDelayLabel = getDeliveryDelayLabel(input);

  return [
    "Les matériels fournis, qu'ils soient posés ou non, demeurent la propriété de SARANGE jusqu'au paiement intégral du prix.",
    "Le règlement peut s'effectuer par virement bancaire, carte bancaire ou chèque.",
    buildPaymentTermsSentence(input),
    'Coordonnées bancaires (RIB) : FR76 1010 7002 2500 0170 5433 705.',
    `!!**Tous nos produits sont garantis 10 ans.**!! Délais matériels indicatifs : ${deliveryDelayLabel}.`,
  ];
};

export const buildPaymentLegalParagraph = (input = {}) => {
  const scheduleSentence = buildPaymentTermsSentence(input);
  return [
    '2.2. Modalités : sauf mention contraire,',
    scheduleSentence,
    "Le règlement peut s'effectuer par virement bancaire, carte bancaire ou chèque.",
    "Aucun escompte n'est accordé pour paiement anticipé.",
  ].join(' ');
};
