import assert from 'node:assert/strict';
import {
  buildPaymentTermsForPdf,
  buildPaymentTermsSentence,
  getDeliveryDelayLabel,
  getPaymentMilestones,
  getPaymentPlanValidation,
  getPaymentScheduleValidation,
  getValidityLabel,
  getValidityMonthsOptions,
  normalizeQuoteSettings,
} from '../lib/quote-settings.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('normalise les reglages par defaut', () => {
  const settings = normalizeQuoteSettings();

  assert.equal(settings.paymentMode, 'standard');
  assert.equal(settings.standardDepositPercent, 50);
  assert.equal(settings.deliveryDelayPreset, '4/6 semaines');
  assert.equal(settings.validityMonths, 1);
});

run("propose les durees de validite 1, 2 et 3 mois", () => {
  assert.deepEqual(getValidityMonthsOptions(), [1, 2, 3]);
});

run('normalise la duree de validite de l offre', () => {
  assert.equal(normalizeQuoteSettings({ validityMonths: 2 }).validityMonths, 2);
  assert.equal(normalizeQuoteSettings({ validityMonths: 3 }).validityMonths, 3);
  // Valeurs hors options (anciennes donnees, saisies invalides) -> defaut 1 mois.
  assert.equal(normalizeQuoteSettings({ validityMonths: 0 }).validityMonths, 1);
  assert.equal(normalizeQuoteSettings({ validityMonths: 12 }).validityMonths, 1);
  assert.equal(normalizeQuoteSettings({ validityMonths: 'abc' }).validityMonths, 1);
});

run("genere le libelle de validite affiche sur le devis", () => {
  assert.equal(getValidityLabel(), '1 mois');
  assert.equal(getValidityLabel({ validityMonths: 3 }), '3 mois');
});

run("valide un echeancier personnalise dont la somme est egale a 100", () => {
  const validation = getPaymentScheduleValidation({
    paymentMode: 'schedule',
    customSignaturePercent: 40,
    customOpeningPercent: 30,
    customBalancePercent: 30,
  });

  assert.equal(validation.isValid, true);
  assert.equal(validation.totalPercent, 100);
});

run("calcule les montants TTC d'un acompte standard a 40%", () => {
  const milestones = getPaymentMilestones(
    {
      paymentMode: 'standard',
      standardDepositPercent: 40,
    },
    1234.56
  );

  assert.deepEqual(
    milestones.map(({ label, percent, amountTTC, dueLabel }) => ({
      label,
      percent,
      amountTTC,
      dueLabel,
    })),
    [
      {
        label: 'Acompte',
        percent: 40,
        amountTTC: 493.82,
        dueLabel: 'À la commande',
      },
      {
        label: 'Solde',
        percent: 60,
        amountTTC: 740.74,
        dueLabel: "À l'achèvement",
      },
    ]
  );
});

run("retourne le texte libre de delai lorsqu'il est personnalise", () => {
  const label = getDeliveryDelayLabel({
    deliveryDelayMode: 'custom',
    deliveryDelayCustom: 'Livraison prevue mi-juillet',
  });

  assert.equal(label, 'Livraison prevue mi-juillet');
});

run("genere une phrase de reglement adaptee a l'echeancier personnalise", () => {
  const sentence = buildPaymentTermsSentence({
    paymentMode: 'schedule',
    customSignaturePercent: 35,
    customOpeningPercent: 25,
    customBalancePercent: 40,
  });

  assert.equal(
    sentence,
    "Règlement selon échéancier personnalisé : 35% à la signature, 25% à l'ouverture de chantier, 40% à l'achèvement."
  );
});

run("genere une phrase de reglement standard avec l'option au metre", () => {
  const sentence = buildPaymentTermsSentence({
    paymentMode: 'standard',
    standardDepositPercent: 40,
  });

  assert.equal(
    sentence,
    "Règlement d'un acompte de 40% par virement à la commande ou, si un métré SARANGE est prévu, par chèque ou virement lors de la prise de côtes, puis solde de 60% à l'achèvement."
  );
});

run('accepte le mode fabricationPose et rejette les modes inconnus', () => {
  assert.equal(
    normalizeQuoteSettings({ paymentMode: 'fabricationPose' }).paymentMode,
    'fabricationPose'
  );
  assert.equal(normalizeQuoteSettings({ paymentMode: 'nimporte' }).paymentMode, 'standard');
  // Declencheurs : id inconnu -> defaut de l'etape.
  assert.equal(
    normalizeQuoteSettings({ customStep2TriggerId: 'selon-avancement' }).customStep2TriggerId,
    'ouverture-chantier'
  );
  assert.equal(
    normalizeQuoteSettings({ contractTypeOverride: 'AVEC_POSE' }).contractTypeOverride,
    'AVEC_POSE'
  );
  assert.equal(
    normalizeQuoteSettings({ contractTypeOverride: 'peut-etre' }).contractTypeOverride,
    'auto'
  );
});

run("calcule l'echeancier fabrication/pose depuis la ventilation", () => {
  const breakdown = {
    fabrication: { totalHT: 0, tva: 0, totalTTC: 8000 },
    chantier: { totalHT: 0, tva: 0, totalTTC: 2000 },
    hasChantier: true,
  };
  const milestones = getPaymentMilestones({ paymentMode: 'fabricationPose' }, 10000, breakdown);

  assert.deepEqual(
    milestones.map(({ label, amountTTC, dueLabel }) => ({ label, amountTTC, dueLabel })),
    [
      { label: 'Acompte', amountTTC: 5000, dueLabel: 'À la commande' },
      {
        label: 'Solde fabrication et fournitures',
        amountTTC: 3000,
        dueLabel:
          "À l'achèvement de la fabrication et à réception de la facture correspondante",
      },
      {
        label: 'Prestations de chantier',
        amountTTC: 2000,
        dueLabel: "À l'achèvement de la pose et à réception de la facture correspondante",
      },
    ]
  );
  // echeance 1 + echeance 2 + echeance 3 = total TTC.
  const sum = milestones.reduce((acc, milestone) => acc + milestone.amountTTC, 0);
  assert.equal(Math.round(sum * 100) / 100, 10000);
});

run("affecte l'ecart d'arrondi de l'echeancier fabrication/pose a la derniere echeance", () => {
  const breakdown = {
    fabrication: { totalHT: 0, tva: 0, totalTTC: 800.01 },
    chantier: { totalHT: 0, tva: 0, totalTTC: 200 },
    hasChantier: true,
  };
  const milestones = getPaymentMilestones({ paymentMode: 'fabricationPose' }, 1000.01, breakdown);
  const sum = milestones.reduce((acc, milestone) => acc + milestone.amountTTC, 0);
  assert.equal(Math.round(sum * 100) / 100, 1000.01);
});

run('bloque une echeance 2 negative (acompte superieur a la part fabrication)', () => {
  const breakdown = {
    fabrication: { totalHT: 0, tva: 0, totalTTC: 4000 },
    chantier: { totalHT: 0, tva: 0, totalTTC: 6000 },
    hasChantier: true,
  };
  const milestones = getPaymentMilestones({ paymentMode: 'fabricationPose' }, 10000, breakdown);
  // Le montant negatif reste VISIBLE (pas d'ecretage silencieux)…
  assert.equal(milestones[1].amountTTC, -1000);
  // …et la validation bloque la generation du devis.
  const validation = getPaymentPlanValidation(
    { paymentMode: 'fabricationPose' },
    { totalTTC: 10000, breakdown }
  );
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.some((error) => error.includes('échéance 2 négative')));
});

run('reserve l echeancier fabrication/pose aux devis avec prestations chantier', () => {
  const breakdown = {
    fabrication: { totalHT: 0, tva: 0, totalTTC: 10000 },
    chantier: { totalHT: 0, tva: 0, totalTTC: 0 },
    hasChantier: false,
  };
  const validation = getPaymentPlanValidation(
    { paymentMode: 'fabricationPose' },
    { totalTTC: 10000, breakdown }
  );
  assert.equal(validation.isValid, false);
});

run('sans ventilation, fabricationPose retombe sur un 50/50 defensif (acompte fiable)', () => {
  const milestones = getPaymentMilestones({ paymentMode: 'fabricationPose' }, 1000);
  assert.equal(milestones.length, 2);
  assert.equal(milestones[0].amountTTC, 500);
  assert.equal(milestones[0].dueLabel, 'À la commande');
});

run('refuse un declencheur « Autre » vide et accepte un declencheur precis', () => {
  const invalid = getPaymentPlanValidation({
    paymentMode: 'schedule',
    customSignaturePercent: 40,
    customOpeningPercent: 30,
    customBalancePercent: 30,
    customStep2TriggerId: 'autre',
    customStep2TriggerText: '',
  });
  assert.equal(invalid.isValid, false);

  const valid = getPaymentPlanValidation({
    paymentMode: 'schedule',
    customSignaturePercent: 40,
    customOpeningPercent: 30,
    customBalancePercent: 30,
    customStep2TriggerId: 'autre',
    customStep2TriggerText: 'À la fin du lot menuiseries du bâtiment A',
  });
  assert.equal(valid.isValid, true);
});

run('la phrase de reglement reprend les declencheurs choisis', () => {
  const sentence = buildPaymentTermsSentence({
    paymentMode: 'schedule',
    customSignaturePercent: 30,
    customOpeningPercent: 40,
    customBalancePercent: 30,
    customStep1TriggerId: 'commande',
    customStep2TriggerId: 'fin-fabrication',
    customStep3TriggerId: 'fin-pose',
  });

  assert.equal(
    sentence,
    "Règlement selon échéancier personnalisé : 30% à la commande, 40% à l'achèvement de la fabrication et à réception de la facture correspondante, 30% à l'achèvement de la pose et à réception de la facture correspondante."
  );
});

run('les conditions de reglement du PDF ne promettent plus « garantis 10 ans »', () => {
  const terms = buildPaymentTermsForPdf({ paymentMode: 'standard' }).join('\n');
  assert.ok(!terms.includes('garantis 10 ans'));
  assert.ok(terms.includes('suivi après-vente'));
  assert.ok(terms.includes('crédit effectif du compte bancaire de SARANGE'));
  assert.ok(!terms.toLowerCase().includes('arrhes'));
});

console.log('Tous les tests de reglages de devis ont reussi.');
