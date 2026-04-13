import assert from 'node:assert/strict';
import {
  buildPaymentTermsSentence,
  getDeliveryDelayLabel,
  getPaymentMilestones,
  getPaymentScheduleValidation,
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

console.log('Tous les tests de reglages de devis ont reussi.');
