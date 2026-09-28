import assert from 'node:assert/strict';
import {
  COMMISSION_SOURCES,
  COMMISSION_STATUSES,
  DEFAULT_COMMISSION_STATUS,
  buildLeadDossierLabel,
  commissionStatusLabel,
  computeBalance,
  computeCommission,
  computeCommissionTotals,
  normalizeCommissionDossier,
  normalizeCommissionStatus,
  parseMoneyInput,
  sanitizeCommissionDossierInput,
} from '../lib/commission-dossiers.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('statuts : les 4 attendus, défaut « En attente de devis »', () => {
  assert.deepEqual(
    COMMISSION_STATUSES.map((status) => status.value),
    ['attente-devis', 'devis-envoye', 'vendu', 'perdu']
  );
  assert.equal(DEFAULT_COMMISSION_STATUS, 'attente-devis');
  assert.equal(normalizeCommissionStatus('VENDU'), 'vendu');
  assert.equal(normalizeCommissionStatus('inconnu'), 'attente-devis');
  assert.equal(normalizeCommissionStatus(null), 'attente-devis');
  assert.equal(commissionStatusLabel('devis-envoye'), 'Devis envoyé');
});

run('montants : formats français, symboles, invalides, négatifs', () => {
  assert.equal(parseMoneyInput('1 234,56'), 1234.56);
  assert.equal(parseMoneyInput('1234.56'), 1234.56);
  assert.equal(parseMoneyInput('2 500 €'), 2500);
  assert.equal(parseMoneyInput(1999.999), 2000);
  assert.equal(parseMoneyInput(''), null);
  assert.equal(parseMoneyInput('abc'), null);
  assert.equal(parseMoneyInput('-50'), null);
  assert.equal(parseMoneyInput(null), null);
  assert.equal(parseMoneyInput(0), 0);
});

run('commission : uniquement un dossier VENDU aux deux prix renseignés', () => {
  const base = { purchasePrice: 8000, salePrice: 10000 };
  assert.equal(computeCommission({ ...base, status: 'vendu' }), 2000);
  assert.equal(computeCommission({ ...base, status: 'devis-envoye' }), null);
  assert.equal(computeCommission({ ...base, status: 'perdu' }), null);
  assert.equal(computeCommission({ status: 'vendu', salePrice: 10000 }), null);
  assert.equal(computeCommission({ status: 'vendu', purchasePrice: 8000 }), null);
  // Vente à perte : la commission peut être négative, on ne masque pas.
  assert.equal(computeCommission({ status: 'vendu', purchasePrice: 10000, salePrice: 9000 }), -1000);
});

run('solde dû : commission - payé, null quand il n’y a rien à dire', () => {
  const vendu = { status: 'vendu', purchasePrice: 8000, salePrice: 10000 };
  assert.equal(computeBalance({ ...vendu, paidAmount: 0 }), 2000);
  assert.equal(computeBalance({ ...vendu, paidAmount: 500 }), 1500);
  assert.equal(computeBalance({ ...vendu, paidAmount: 2000 }), 0);
  // Paiement saisi sur un dossier non vendu : visible en négatif, pas caché.
  assert.equal(computeBalance({ status: 'attente-devis', paidAmount: 300 }), -300);
  assert.equal(computeBalance({ status: 'attente-devis', paidAmount: 0 }), null);
});

run('totaux : le total dû baisse dès qu’un paiement est saisi', () => {
  const dossiers = [
    { status: 'vendu', purchasePrice: 8000, salePrice: 10000, paidAmount: 0 },
    { status: 'vendu', purchasePrice: 3000, salePrice: 3500, paidAmount: 500 },
    { status: 'devis-envoye', purchasePrice: 1000, salePrice: 2000, paidAmount: 0 },
    { status: 'perdu', paidAmount: 0 },
  ];
  const before = computeCommissionTotals(dossiers);
  assert.equal(before.commissionTotal, 2500);
  assert.equal(before.paidTotal, 500);
  assert.equal(before.dueTotal, 2000);
  assert.equal(before.soldCount, 2);
  assert.equal(before.count, 4);

  dossiers[0].paidAmount = 2000;
  const after = computeCommissionTotals(dossiers);
  assert.equal(after.paidTotal, 2500);
  assert.equal(after.dueTotal, 0);

  assert.deepEqual(computeCommissionTotals([]), {
    commissionTotal: 0,
    paidTotal: 0,
    dueTotal: 0,
    soldCount: 0,
    count: 0,
  });
});

run('normalisation d’un dossier : défauts sûrs, documents filtrés', () => {
  const dossier = normalizeCommissionDossier({
    id: ' cd_1 ',
    label: `  Dupont  ${'x'.repeat(300)}`,
    status: 'vendu',
    purchasePrice: '8 000,50',
    salePrice: 10000,
    paidAmount: 'abc',
    source: 'site-web',
    documents: [{ id: 'doc_1', name: 'devis.pdf', path: 'p', size: 1024 }, { name: 'sans-id' }],
  });
  assert.equal(dossier.id, 'cd_1');
  assert.equal(dossier.label.length, 200);
  assert.equal(dossier.purchasePrice, 8000.5);
  assert.equal(dossier.paidAmount, 0);
  assert.equal(dossier.source, COMMISSION_SOURCES.WEBSITE);
  assert.equal(dossier.documents.length, 1);
  assert.equal(dossier.documents[0].name, 'devis.pdf');

  const vide = normalizeCommissionDossier(null);
  assert.equal(vide.status, 'attente-devis');
  assert.equal(vide.source, COMMISSION_SOURCES.MANUAL);
  assert.deepEqual(vide.documents, []);
});

run('saisie partielle : seules les clés fournies sont renvoyées', () => {
  assert.deepEqual(sanitizeCommissionDossierInput({ paidAmount: '1 000' }), { paidAmount: 1000 });
  assert.deepEqual(sanitizeCommissionDossierInput({ paidAmount: '' }), { paidAmount: 0 });
  assert.deepEqual(sanitizeCommissionDossierInput({ salePrice: '' }), { salePrice: null });
  assert.deepEqual(sanitizeCommissionDossierInput({ status: 'perdu', label: '  Villa Bleue  ' }), {
    status: 'perdu',
    label: 'Villa Bleue',
  });
  assert.deepEqual(sanitizeCommissionDossierInput({}), {});
  assert.deepEqual(sanitizeCommissionDossierInput(null), {});
});

run('libellé d’un lead du site : nom, ville, replis', () => {
  assert.equal(buildLeadDossierLabel({ nom: 'Dupont', prenom: 'Marie', ville: 'Nantes' }), 'Dupont Marie (Nantes)');
  assert.equal(buildLeadDossierLabel({ nom: 'Dupont' }), 'Dupont');
  assert.equal(buildLeadDossierLabel({ ville: 'Nantes' }), 'Nantes');
  assert.equal(buildLeadDossierLabel({}), 'Demande du site');
  assert.equal(buildLeadDossierLabel(), 'Demande du site');
});
