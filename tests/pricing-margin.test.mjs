import assert from 'node:assert/strict';
import {
  calculateGrossAmountToAddForNetMargin,
  calculateGrossAmountToSubtractForNetDiscount,
  calculateRecoveredNetMargin,
  calculateRecoveredNetDiscount,
} from '../lib/pricing-margin.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('compense exactement 100 EUR nets avec 20% de remise', () => {
  const netMarginWanted = 100;
  const remise = 20;
  const grossToAdd = calculateGrossAmountToAddForNetMargin(netMarginWanted, remise);
  const recoveredNet = calculateRecoveredNetMargin(grossToAdd, remise);

  assert.equal(grossToAdd, 125);
  assert.equal(recoveredNet, 100);
});

run('sans remise, le brut ajoute est egal a la marge nette', () => {
  assert.equal(calculateGrossAmountToAddForNetMargin(100, 0), 100);
  assert.equal(calculateRecoveredNetMargin(100, 0), 100);
});

run('compense exactement 100 EUR nets de remise avec 20% de remise visible', () => {
  const netDiscountWanted = 100;
  const remise = 20;
  const grossToSubtract = calculateGrossAmountToSubtractForNetDiscount(
    netDiscountWanted,
    remise
  );
  const recoveredNet = calculateRecoveredNetDiscount(grossToSubtract, remise);

  assert.equal(grossToSubtract, 125);
  assert.equal(recoveredNet, 100);
});

run('ignore les valeurs invalides ou negatives', () => {
  assert.equal(calculateGrossAmountToAddForNetMargin(-10, 20), 0);
  assert.equal(calculateGrossAmountToAddForNetMargin('abc', 20), 0);
  assert.equal(calculateGrossAmountToSubtractForNetDiscount(-10, 20), 0);
  assert.equal(calculateGrossAmountToSubtractForNetDiscount('abc', 20), 0);
  assert.equal(calculateRecoveredNetMargin('abc', 20), 0);
  assert.equal(calculateRecoveredNetDiscount('abc', 20), 0);
});

console.log('Tous les tests de marge ont reussi.');
