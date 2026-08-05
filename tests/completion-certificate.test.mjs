import assert from 'node:assert/strict';
import {
  RETENTION_DE_GARANTIE_RATE,
  buildCompletionBalanceDisplay,
  computeCompletionBalance,
  getDocTypeTexts,
  getReceptionReservesPaymentText,
} from '../lib/completion-certificate.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

const BANNED = [/retenue de garantie/i, /somme retenue/i, /71-584/, /consignation/i, /consignataire/i];
const assertNoBanned = (text, context) => {
  BANNED.forEach((pattern) => {
    assert.ok(!pattern.test(text), `expression bannie ${pattern} dans ${context}`);
  });
};

run('réception sans réserve : aucun mécanisme de 5 %', () => {
  const balance = computeCompletionBalance({
    totalDevisTTC: 10000,
    acompteRecu: 3000,
    hasReserves: false,
    retentionEligible: true,
  });
  assert.equal(balance.retenueGarantie, 0);
  assert.equal(balance.soldeAPercevoir, 7000);

  const display = buildCompletionBalanceDisplay({ balance, hasReserves: false });
  assert.equal(display.rows.length, 2);
  assert.ok(!display.rows.some((row) => row.label.includes('Échéance finale')));
  assert.equal(display.note, '');
  assert.equal(display.totalLabel, 'SOLDE DÛ À RÉCEPTION');
  assert.equal(display.totalAmount, 7000);
});

run('réception avec réserve (clause au devis) : échéance finale de 5 % affichée séparément', () => {
  const balance = computeCompletionBalance({
    totalDevisTTC: 10000,
    acompteRecu: 3000,
    hasReserves: true,
    retentionEligible: true,
  });
  const display = buildCompletionBalanceDisplay({ balance, hasReserves: true });

  const labels = display.rows.map((row) => row.label);
  assert.deepEqual(labels, [
    'Total du devis TTC',
    'Sommes déjà encaissées',
    'Montant exigible à réception (95 % du total TTC)',
    'Échéance finale après levée des réserves (5 %)',
  ]);
  // Jamais présentée comme une déduction d'une somme déjà due/facturée.
  const echeanceRow = display.rows[3];
  assert.equal(echeanceRow.isDeduction, false);
  assert.equal(display.totalLabel, 'MONTANT À RÉGLER À RÉCEPTION');
  assert.equal(
    display.note,
    "L'échéance finale de 5 % deviendra exigible après validation de la levée de l'ensemble des réserves."
  );
});

run('échéance finale égale exactement à 5 % du total TTC', () => {
  assert.equal(RETENTION_DE_GARANTIE_RATE, 0.05);
  [10000, 12345.67, 999.99].forEach((total) => {
    const balance = computeCompletionBalance({
      totalDevisTTC: total,
      acompteRecu: 0,
      hasReserves: true,
      retentionEligible: true,
    });
    assert.equal(balance.retenueGarantie, Math.round(total * 0.05 * 100) / 100, `total ${total}`);
  });
});

run('montant exigible à réception = 95 % du devis moins les sommes déjà encaissées', () => {
  const balance = computeCompletionBalance({
    totalDevisTTC: 20000,
    acompteRecu: 8000,
    hasReserves: true,
    retentionEligible: true,
  });
  assert.equal(balance.soldeAPercevoir, 20000 * 0.95 - 8000);

  const display = buildCompletionBalanceDisplay({ balance, hasReserves: true });
  const exigibleRow = display.rows.find((row) => row.label.startsWith('Montant exigible'));
  assert.equal(exigibleRow.amount, 20000 * 0.95);
  assert.equal(display.totalAmount, 20000 * 0.95 - 8000);
});

run('plusieurs réserves : une seule échéance finale globale de 5 %', () => {
  // Le calcul ne dépend que de la PRÉSENCE de réserves, jamais de leur
  // nombre : même montant pour 1 ou 5 réserves, et une seule ligne affichée.
  const one = computeCompletionBalance({ totalDevisTTC: 10000, acompteRecu: 0, hasReserves: true, retentionEligible: true });
  const many = computeCompletionBalance({ totalDevisTTC: 10000, acompteRecu: 0, hasReserves: true, retentionEligible: true });
  assert.equal(one.retenueGarantie, many.retenueGarantie);
  assert.equal(one.retenueGarantie, 500);

  const display = buildCompletionBalanceDisplay({ balance: many, hasReserves: true });
  const echeanceRows = display.rows.filter((row) => row.label.includes('Échéance finale'));
  assert.equal(echeanceRows.length, 1);
});

run('devis sans clause (ancien devis figé) : solde total dû malgré les réserves', () => {
  const balance = computeCompletionBalance({
    totalDevisTTC: 10000,
    acompteRecu: 3000,
    hasReserves: true,
    retentionEligible: false,
  });
  assert.equal(balance.retenueGarantie, 0);
  assert.equal(balance.soldeAPercevoir, 7000);

  const display = buildCompletionBalanceDisplay({ balance, hasReserves: true });
  assert.ok(!display.rows.some((row) => row.label.includes('Échéance finale')));
  assert.equal(display.note, '');
  assertNoBanned(getReceptionReservesPaymentText(false), 'texte réserves sans clause');
});

run('nouvelle phrase générale de réception, identique avec et sans réserves', () => {
  const texts = getDocTypeTexts('reception');
  assert.equal(
    texts.lead,
    "Le client, maître d'ouvrage, après visite contradictoire des ouvrages exécutés au titre du devis référencé ci-dessus, prononce ce jour leur réception dans les conditions indiquées ci-dessous."
  );
});

run('nouveau bloc garanties : effets de la réception, assureur décennal explicite', () => {
  const texts = getDocTypeTexts('reception');
  assert.equal(texts.guaranteesTitle, 'GARANTIES – EFFETS DE LA RÉCEPTION');
  assert.equal(texts.guarantees.length, 3);
  assert.ok(texts.guarantees[0].startsWith('Garantie de parfait achèvement'));
  assert.ok(texts.guarantees[0].includes('désordres révélés postérieurement à la réception'));
  assert.ok(texts.guarantees[1].startsWith('Garantie de bon fonctionnement'));
  assert.ok(texts.guarantees[1].includes('deux ans'));
  assert.ok(texts.guarantees[2].startsWith('Responsabilité décennale'));
  assert.ok(texts.guarantees[2].includes('BPCE IARD'));
  assert.ok(texts.guarantees[2].includes('194388251 R 002'));
});

run('mention de signature conservée avec réserves', () => {
  const texts = getDocTypeTexts('reception');
  assert.equal(texts.mention(true), 'Bon pour réception des travaux, avec les réserves ci-dessus');
  assert.equal(texts.mention(false), 'Bon pour réception des travaux, sans réserve');
});

run('aucune expression bannie dans les textes du PV', () => {
  ['reception', 'enlevement', 'livraison'].forEach((docType) => {
    const texts = getDocTypeTexts(docType);
    const flat = JSON.stringify({ ...texts, mention: [texts.mention(true), texts.mention(false)] });
    assertNoBanned(flat, `textes ${docType}`);
  });
  assertNoBanned(getReceptionReservesPaymentText(true), 'texte échéance finale');
  const balance = computeCompletionBalance({ totalDevisTTC: 10000, acompteRecu: 0, hasReserves: true, retentionEligible: true });
  assertNoBanned(JSON.stringify(buildCompletionBalanceDisplay({ balance, hasReserves: true })), 'bloc de règlement');
});

run('texte échéance finale : 95 % à réception, 5 % non exigibles avant la levée', () => {
  const text = getReceptionReservesPaymentText(true);
  assert.ok(text.includes('article 4.5 des CGV'));
  assert.ok(text.includes('limité à 95 %'));
  assert.ok(text.includes("n'est pas exigible à la réception"));
  assert.ok(text.includes('levée écrite'));
});

console.log('completion-certificate.test.mjs : tous les tests passent');
