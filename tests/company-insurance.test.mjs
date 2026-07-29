import assert from 'node:assert/strict';
import {
  DEFAULT_COMPANY_INSURANCE,
  formatInsuranceDateFr,
  getInsurancePeriodLabel,
  getInsuranceStatus,
  normalizeCompanyInsurance,
} from '../lib/company-insurance.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('normalise les parametres avec repli sur le contrat en vigueur', () => {
  const normalized = normalizeCompanyInsurance({});
  assert.deepEqual(normalized, { ...DEFAULT_COMPANY_INSURANCE });

  const custom = normalizeCompanyInsurance({
    insurer: '  AXA France  ',
    contractNumber: 'ABC 123',
    startDate: '2027-01-01',
    endDate: '2027-12-31',
    attestationUrl: 'https://exemple.fr/attestation.pdf',
  });
  assert.equal(custom.insurer, 'AXA France');
  assert.equal(custom.endDate, '2027-12-31');
  assert.equal(custom.attestationUrl, 'https://exemple.fr/attestation.pdf');
  // Date invalide -> repli sur le defaut (jamais de date malformee sur le devis).
  assert.equal(normalizeCompanyInsurance({ endDate: '31/12/2027' }).endDate,
    DEFAULT_COMPANY_INSURANCE.endDate);
});

run('formate les dates et la periode en francais', () => {
  assert.equal(formatInsuranceDateFr('2026-12-31'), '31/12/2026');
  assert.equal(formatInsuranceDateFr('pas-une-date'), '');
  assert.equal(
    getInsurancePeriodLabel({ startDate: '2026-01-01', endDate: '2026-12-31' }),
    'du 01/01/2026 au 31/12/2026'
  );
});

run("detecte l'attestation expiree (le lendemain de la date de fin)", () => {
  const insurance = { startDate: '2026-01-01', endDate: '2026-12-31' };

  const expired = getInsuranceStatus(insurance, new Date('2027-01-05T10:00:00'));
  assert.equal(expired.isExpired, true);
  assert.equal(expired.expiresSoon, false);

  // Le dernier jour de couverture reste valide.
  const lastDay = getInsuranceStatus(insurance, new Date('2026-12-31T18:00:00'));
  assert.equal(lastDay.isExpired, false);
});

run("pre-alerte lorsque l'attestation expire bientot", () => {
  const insurance = { startDate: '2026-01-01', endDate: '2026-12-31' };

  const soon = getInsuranceStatus(insurance, new Date('2026-12-01T10:00:00'));
  assert.equal(soon.isExpired, false);
  assert.equal(soon.expiresSoon, true);

  const valid = getInsuranceStatus(insurance, new Date('2026-06-01T10:00:00'));
  assert.equal(valid.isExpired, false);
  assert.equal(valid.expiresSoon, false);
  assert.equal(valid.endDateLabel, '31/12/2026');
});

console.log("Tous les tests d'assurance decennale ont reussi.");
