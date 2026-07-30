import assert from 'node:assert/strict';
import {
  AUTOLIQUIDATION_IDENTITY_ERROR,
  AUTOLIQUIDATION_MENTION,
  AUTOLIQUIDATION_SCOPE_ERROR,
  AUTOLIQUIDATION_TOTAL_LABEL,
  AUTOLIQUIDATION_VAT_VALUE,
  TAX_REGIMES,
  getTaxRegimeValidation,
  isAutoliquidation,
  resolveTaxRegime,
} from '../lib/tax-regime.mjs';
import {
  computeFrenchVatNumber,
  getClientTaxIdentity,
  isValidFrenchVatNumber,
} from '../lib/client-type.mjs';
import { buildCgvSections } from '../lib/cgv-templates.mjs';
import { CONTRACT_TYPES } from '../lib/line-nature.mjs';
import {
  buildPaymentLegalParagraph,
  buildPaymentTermsForPdf,
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

const POSE_ITEMS = [{ productId: 'fenetre-1v', includePose: true }];
const FOURNITURE_ITEMS = [{ productId: 'fenetre-1v', includePose: false }];
// Donneur d'ordre complet (identité fiscale récupérée depuis l'annuaire).
const PRO_CLIENT = {
  clientType: 'PROFESSIONNEL',
  nom: 'ENTREPRISE PRINCIPALE',
  siret: '82000101400035',
  siren: '820001014',
  tvaIntra: 'FR22820001014',
};

run('professionnel avec pose et TVA 0 % : autoliquidation BTP', () => {
  const regime = resolveTaxRegime({
    clientType: 'PROFESSIONNEL',
    tvaRate: 0,
    cartItems: POSE_ITEMS,
  });

  assert.equal(regime, TAX_REGIMES.AUTOLIQUIDATION_BTP);
  assert.equal(isAutoliquidation(regime), true);

  const validation = getTaxRegimeValidation({
    clientType: 'PROFESSIONNEL',
    tvaRate: 0,
    cartItems: POSE_ITEMS,
    clientData: PRO_CLIENT,
  });
  assert.equal(validation.isValid, true);
  assert.deepEqual(validation.errors, []);
});

run('professionnel sans pose et TVA 0 % : blocage (fourniture seule)', () => {
  const validation = getTaxRegimeValidation({
    clientType: 'PROFESSIONNEL',
    tvaRate: 0,
    cartItems: FOURNITURE_ITEMS,
    clientData: PRO_CLIENT,
  });

  assert.equal(validation.taxRegime, TAX_REGIMES.STANDARD);
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.includes(AUTOLIQUIDATION_SCOPE_ERROR));
});

run('particulier avec TVA 0 % : blocage', () => {
  const validation = getTaxRegimeValidation({
    clientType: 'PARTICULIER',
    tvaRate: 0,
    cartItems: POSE_ITEMS,
    clientData: { clientType: 'PARTICULIER' },
  });

  assert.equal(validation.taxRegime, TAX_REGIMES.STANDARD);
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.includes(AUTOLIQUIDATION_SCOPE_ERROR));
});

run('type de client inconnu avec TVA 0 % : blocage', () => {
  const validation = getTaxRegimeValidation({
    clientType: '',
    tvaRate: 0,
    cartItems: POSE_ITEMS,
    clientData: {},
  });

  assert.equal(validation.isValid, false);
});

run('professionnel avec pose et TVA normale : régime standard, aucun blocage', () => {
  [5.5, 10, 20].forEach((tvaRate) => {
    const validation = getTaxRegimeValidation({
      clientType: 'PROFESSIONNEL',
      tvaRate,
      cartItems: POSE_ITEMS,
      clientData: { clientType: 'PROFESSIONNEL' },
    });

    assert.equal(validation.taxRegime, TAX_REGIMES.STANDARD, `TVA ${tvaRate}`);
    assert.equal(validation.isValid, true, `TVA ${tvaRate}`);
  });
});

run('n° de TVA reconstitué depuis le SIREN (algorithme officiel)', () => {
  // Clé = (12 + 3 × (SIREN mod 97)) mod 97 — vérifié sur SARANGE.
  assert.equal(computeFrenchVatNumber('820001014'), 'FR22820001014');
  assert.equal(isValidFrenchVatNumber('FR22820001014'), true);
  assert.equal(isValidFrenchVatNumber('FR99820001014'), false);
  assert.equal(computeFrenchVatNumber('123'), '');

  // Client sans n° de TVA saisi : reconstitué depuis le SIRET enregistré.
  const identity = getClientTaxIdentity({ siret: '82000101400035' });
  assert.equal(identity.siren, '820001014');
  assert.equal(identity.vatNumber, 'FR22820001014');
  assert.equal(identity.isVatNumberDerived, true);
});

run('client sans n° de TVA : récupération depuis le SIREN, aucun blocage', () => {
  const validation = getTaxRegimeValidation({
    clientType: 'PROFESSIONNEL',
    tvaRate: 0,
    cartItems: POSE_ITEMS,
    clientData: { clientType: 'PROFESSIONNEL', siret: '82000101400035' },
  });

  assert.equal(validation.taxRegime, TAX_REGIMES.AUTOLIQUIDATION_BTP);
  assert.equal(validation.isValid, true);
});

run('échec API puis saisie manuelle : blocage tant que le SIRET manque', () => {
  // Annuaire indisponible : aucune identité fiscale enregistrée.
  const blocked = getTaxRegimeValidation({
    clientType: 'PROFESSIONNEL',
    tvaRate: 0,
    cartItems: POSE_ITEMS,
    clientData: { clientType: 'PROFESSIONNEL' },
  });
  assert.equal(blocked.isValid, false);
  assert.ok(blocked.errors.includes(AUTOLIQUIDATION_IDENTITY_ERROR));

  // Saisie manuelle du SIRET et du n° de TVA : le devis repart.
  const manual = getTaxRegimeValidation({
    clientType: 'PROFESSIONNEL',
    tvaRate: 0,
    cartItems: POSE_ITEMS,
    clientData: {
      clientType: 'PROFESSIONNEL',
      siret: '55210055400013',
      tvaIntra: 'FR 40 552 100 554',
    },
  });
  assert.equal(manual.isValid, true);
});

run('libellés de synthèse : « Autoliquidation » et « NET À PAYER »', () => {
  assert.equal(AUTOLIQUIDATION_VAT_VALUE, 'Autoliquidation');
  assert.equal(AUTOLIQUIDATION_TOTAL_LABEL, 'NET À PAYER');
  // Ni « TVA (0 %) » ni « MONTANT TTC » dans les libellés d'autoliquidation.
  assert.ok(!AUTOLIQUIDATION_TOTAL_LABEL.includes('TTC'));
  assert.ok(!AUTOLIQUIDATION_VAT_VALUE.includes('0'));
});

run('mention légale : référence exacte à l’article 283, 2 nonies', () => {
  assert.ok(AUTOLIQUIDATION_MENTION.includes('283, 2 nonies'));
  assert.ok(AUTOLIQUIDATION_MENTION.includes('TVA due par le preneur'));
  assert.ok(AUTOLIQUIDATION_MENTION.includes('Code général des impôts'));
  // L'ancienne référence « 283-2 » ne doit plus apparaître.
  assert.ok(!AUTOLIQUIDATION_MENTION.includes('283-2'));
});

/* ─── Clause de sous-traitance BTP dans les CGV ──────────────────────────── */

const SUBCONTRACTING_TITLE = 'Dispositions spécifiques à la sous-traitance BTP';

const cgvText = (options) =>
  buildCgvSections(options)
    .map((section) => `${section.title}\n${section.text}`)
    .join('\n\n');

run('clause de sous-traitance présente pour un B2B avec pose en autoliquidation', () => {
  const sections = buildCgvSections({
    clientType: 'PROFESSIONNEL',
    contractType: CONTRACT_TYPES.AVEC_POSE,
    taxRegime: TAX_REGIMES.AUTOLIQUIDATION_BTP,
    quoteSettings: {},
  });

  const clause = sections.find((section) => section.title === SUBCONTRACTING_TITLE);
  assert.ok(clause, 'clause de sous-traitance absente');
  assert.ok(clause.text.includes("loi n° 75-1334 du 31 décembre 1975"));
  assert.ok(clause.text.includes("entreprise principale"));
  assert.ok(clause.text.includes('faire agréer ses conditions de paiement'));
  assert.ok(clause.text.includes('caution personnelle et solidaire'));
  assert.ok(clause.text.includes('283, 2 nonies'));
});

run('clause de sous-traitance absente dans tous les autres dossiers', () => {
  const cases = [
    // Particulier, même avec pose et taux 0 % forcé.
    {
      clientType: 'PARTICULIER',
      contractType: CONTRACT_TYPES.AVEC_POSE,
      taxRegime: TAX_REGIMES.AUTOLIQUIDATION_BTP,
    },
    // Professionnel à TVA normale (régime standard).
    {
      clientType: 'PROFESSIONNEL',
      contractType: CONTRACT_TYPES.AVEC_POSE,
      taxRegime: TAX_REGIMES.STANDARD,
    },
    // Professionnel en fourniture seule.
    {
      clientType: 'PROFESSIONNEL',
      contractType: CONTRACT_TYPES.FOURNITURE_SEULE,
      taxRegime: TAX_REGIMES.AUTOLIQUIDATION_BTP,
    },
    // Régime non renseigné.
    { clientType: 'PROFESSIONNEL', contractType: CONTRACT_TYPES.AVEC_POSE },
  ];

  cases.forEach((options) => {
    const sections = buildCgvSections({ ...options, quoteSettings: {} });
    assert.ok(
      !sections.some((section) => section.title === SUBCONTRACTING_TITLE),
      `clause présente à tort (${options.clientType} / ${options.contractType} / ${options.taxRegime})`
    );
    assert.ok(!cgvText({ ...options, quoteSettings: {} }).includes('75-1334'));
  });
});

/* ─── Modes de règlement : plus de carte bancaire ────────────────────────── */

run('aucune mention de carte bancaire dans les CGV ni les conditions', () => {
  const documents = [
    cgvText({
      clientType: 'PROFESSIONNEL',
      contractType: CONTRACT_TYPES.AVEC_POSE,
      taxRegime: TAX_REGIMES.AUTOLIQUIDATION_BTP,
      quoteSettings: {},
    }),
    cgvText({
      clientType: 'PARTICULIER',
      contractType: CONTRACT_TYPES.FOURNITURE_SEULE,
      quoteSettings: {},
    }),
    buildPaymentTermsForPdf({}).join('\n'),
    buildPaymentLegalParagraph({}),
  ];

  documents.forEach((text) => {
    const lower = text.toLowerCase();
    ['carte bancaire', 'carte de crédit', 'paiement cb', 'stripe', 'payplug', 'sumup'].forEach(
      (forbidden) => {
        assert.ok(!lower.includes(forbidden), `mention interdite : ${forbidden}`);
      }
    );
  });
});

run('les modes affichés sont uniquement le virement et le chèque', () => {
  const terms = buildPaymentTermsForPdf({}).join('\n');
  assert.ok(terms.includes("virement bancaire ou par chèque"));
  assert.ok(buildPaymentLegalParagraph({}).includes("virement bancaire ou par chèque"));
});

run("aucune régression sur les conditions d'encaissement", () => {
  const terms = buildPaymentTermsForPdf({}).join('\n');
  assert.ok(terms.includes('crédit effectif du compte bancaire de SARANGE'));
  assert.ok(terms.includes("sous réserve de son encaissement effectif"));

  const cgv = cgvText({
    clientType: 'PROFESSIONNEL',
    contractType: CONTRACT_TYPES.AVEC_POSE,
    taxRegime: TAX_REGIMES.AUTOLIQUIDATION_BTP,
    quoteSettings: {},
  });
  assert.ok(cgv.includes('crédit effectif du compte bancaire de SARANGE'));
  assert.ok(cgv.includes("ne constitue pas un encaissement"));
  assert.ok(cgv.includes('remise du chèque à SARANGE'));
  assert.ok(cgv.includes("le rejet d'un chèque entraîne le maintien de la créance"));
});

console.log('Tous les tests du régime fiscal (autoliquidation BTP) ont reussi.');
