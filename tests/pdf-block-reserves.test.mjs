// Réserves de page des blocs du devis PDF (« Conditions de règlement /
// Synthèse », mentions légales, bloc TVA).
//
// À lancer avec le chargeur d'alias :
//   node --import ./tests/helpers/register-alias.mjs tests/pdf-block-reserves.test.mjs
//
// Régression du 29/09/2026 : la réserve avant drawCommercialAndTotals était un
// forfait (70 mm + hauteur du tableau de financement). Avec l'échéancier
// « 100 % à la commande », le tableau est court (une seule échéance) et les
// conditions de règlement longues : la carte de gauche dépassait le forfait et
// débordait sur le pied de page. Depuis, chaque bloc expose sa MESURE réelle,
// utilisée à la fois pour la réserve (ensureQuoteSpace) et pour le dessin :
// ces tests verrouillent le comportement des fonctions de mesure.
import assert from 'node:assert/strict';

const { getCommercialAndTotalsMetrics, getLegalNoticeCardsMetrics, getVatBlockHeight } =
  await import('../lib/pdf-generator.js');

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

// Doc factice : seules les primitives de MESURE de jsPDF sont nécessaires.
// Largeurs simplifiées (mm par caractère) : les tests comparent des hauteurs
// entre elles, jamais à des valeurs absolues au millimètre.
const createMeasuringDoc = () => ({
  setFont() {},
  setFontSize() {},
  getTextWidth: (text) => String(text).length * 1.55,
  splitTextToSize(text, width) {
    const perLine = Math.max(8, Math.floor(width / 1.55));
    const lines = [];
    let line = '';
    String(text)
      .split(' ')
      .forEach((word) => {
        if (`${line} ${word}`.trim().length > perLine) {
          if (line.trim()) lines.push(line.trim());
          line = word;
        } else {
          line = `${line} ${word}`;
        }
      });
    if (line.trim()) lines.push(line.trim());
    return lines.length ? lines : [''];
  },
});

const baseContext = {
  pageWidth: 210,
  fontFamily: 'helvetica',
  taxRegime: null,
  tvaRate: 20,
  contractType: 'FOURNITURE_SEULE',
  totals: {
    totalTTC: 471.8,
    totalHT: 393.17,
    tva: 78.63,
    hasDiscount: true,
    originalTotalHT: 468.96,
    discountTotal: 75.79,
    breakdown: null,
    activeVatBuckets: [],
    hasReducedVat: false,
    hasZeroVat: false,
  },
  quoteSettings: { paymentMode: 'fullPrepaid' },
};

run('bloc conditions/synthèse : la hauteur suit les conditions de règlement', () => {
  const doc = createMeasuringDoc();
  const short = getCommercialAndTotalsMetrics(doc, {
    ...baseContext,
    paymentTerms: ['Une seule condition.'],
  });
  const long = getCommercialAndTotalsMetrics(doc, {
    ...baseContext,
    paymentTerms: Array.from({ length: 10 }, () =>
      'Une condition de règlement volontairement longue qui occupe plusieurs lignes une fois repliée dans la largeur de la carte de gauche du devis.'
    ),
  });

  // La carte courte reste bornée par le minimum et la carte de droite.
  assert.ok(short.cardHeight >= 62);
  assert.ok(short.cardHeight >= short.paymentTableOffset + 5);
  // La réserve grandit avec le texte : c'est ce qui manquait au forfait.
  assert.ok(
    long.cardHeight > short.cardHeight + 40,
    `hauteur longue (${long.cardHeight}) vs courte (${short.cardHeight})`
  );
});

run('bloc conditions/synthèse : le scénario du bug, la carte de gauche domine', () => {
  const doc = createMeasuringDoc();
  // Conditions réelles du devis DV-262721637 (échéancier 100 % à la commande,
  // conditions par défaut de buildPaymentTermsForPdf) : une seule échéance au
  // financement, six puces dont plusieurs multi-lignes à gauche. L'ancien
  // forfait (70 mm + hauteur du financement) suivait la carte de DROITE : il
  // ratait précisément ce cas où la gauche est bien plus haute qu'elle.
  const metrics = getCommercialAndTotalsMetrics(doc, baseContext);
  assert.equal(metrics.paymentMilestones.length, 1);
  assert.ok(
    metrics.cardHeight > metrics.paymentTableOffset + 25,
    `la carte de gauche (${metrics.cardHeight}) doit dépasser la colonne de droite (~${metrics.paymentTableOffset + 25})`
  );
});

run('mentions légales : hauteur mesurée, jamais sous le minimum de la carte', () => {
  const doc = createMeasuringDoc();
  const metrics = getLegalNoticeCardsMetrics(doc, baseContext);
  assert.ok(metrics.cardHeight >= 32);
  assert.ok(metrics.legalNoticeColumns.length >= 1);

  const custom = getLegalNoticeCardsMetrics(doc, {
    ...baseContext,
    legalNoticeColumns: [
      {
        title: 'Colonne test',
        items: Array.from({ length: 8 }, () =>
          'Une mention légale suffisamment longue pour replier sur plusieurs lignes dans la colonne.'
        ),
      },
    ],
  });
  assert.ok(custom.cardHeight > metrics.cardHeight);
});

run('bloc TVA : certification 5,5 % mesurée, autoliquidation mesurée, 0 sinon', () => {
  const doc = createMeasuringDoc();
  assert.equal(getVatBlockHeight(doc, baseContext), 0);

  const reduced = getVatBlockHeight(doc, {
    ...baseContext,
    totals: { ...baseContext.totals, hasReducedVat: true },
  });
  // L'ancien forfait de 32 mm était déjà limite : la mesure doit le couvrir.
  assert.ok(reduced >= 29, `certification (${reduced})`);

  const zero = getVatBlockHeight(doc, {
    ...baseContext,
    totals: { ...baseContext.totals, hasZeroVat: true },
  });
  assert.ok(zero >= 11);
});

console.log('Tous les tests de réserves des blocs PDF ont reussi.');
