import assert from 'node:assert/strict';
import {
  CGV_VERSION,
  buildCgvSections,
  buildCgvSnapshot,
  getLegalNoticeColumns,
  matchCgvSnapshotEntry,
  normalizeCgvSnapshot,
} from '../lib/cgv-templates.mjs';
import {
  CLIENT_TYPES,
  UNKNOWN_CLIENT_TYPE,
  isKnownClientType,
  normalizeClientType,
  normalizeSiret,
} from '../lib/client-type.mjs';
import { CONTRACT_TYPES } from '../lib/line-nature.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

const flatten = (sections) =>
  sections.map((section) => `${section.title}\n${section.text}`).join('\n\n');

const build = (clientType, contractType, quoteSettings = {}) =>
  buildCgvSections({ clientType, contractType, quoteSettings });

const MATRIX = [
  [CLIENT_TYPES.PARTICULIER, CONTRACT_TYPES.FOURNITURE_SEULE],
  [CLIENT_TYPES.PARTICULIER, CONTRACT_TYPES.AVEC_POSE],
  [CLIENT_TYPES.PROFESSIONNEL, CONTRACT_TYPES.FOURNITURE_SEULE],
  [CLIENT_TYPES.PROFESSIONNEL, CONTRACT_TYPES.AVEC_POSE],
];

run('type de client : AUCUN defaut, INCONNU tant que non choisi explicitement', () => {
  assert.equal(normalizeClientType('PROFESSIONNEL'), 'PROFESSIONNEL');
  assert.equal(normalizeClientType('professionnel'), 'PROFESSIONNEL');
  assert.equal(normalizeClientType('PARTICULIER'), 'PARTICULIER');
  // Fiches historiques / champ absent -> INCONNU, jamais PARTICULIER.
  assert.equal(normalizeClientType(''), UNKNOWN_CLIENT_TYPE);
  assert.equal(normalizeClientType(undefined), UNKNOWN_CLIENT_TYPE);
  assert.equal(normalizeClientType('n importe quoi'), UNKNOWN_CLIENT_TYPE);
  assert.equal(isKnownClientType('PARTICULIER'), true);
  assert.equal(isKnownClientType('PROFESSIONNEL'), true);
  assert.equal(isKnownClientType(''), false);
  assert.equal(isKnownClientType(undefined), false);
  // Le type n'est jamais deduit du SIRET : normaliser un SIRET ne change rien.
  assert.equal(normalizeSiret('820 001 014 00027'), '82000101400027');
  assert.equal(isKnownClientType(''), false);
});

run('aucun snapshot (donc aucun figement) tant que le type de client est inconnu', () => {
  const blocked = buildCgvSnapshot({
    clientType: undefined,
    entries: [
      {
        variantId: 'mono',
        contractType: CONTRACT_TYPES.FOURNITURE_SEULE,
        quoteSettings: {},
      },
    ],
  });
  assert.equal(blocked, null);
});

run("l'attestation decennale vient des parametres societe (plus de 2026 en dur)", () => {
  const columns = getLegalNoticeColumns(CONTRACT_TYPES.AVEC_POSE, {
    insurer: 'AXA France',
    contractNumber: 'ABC 123',
    activities: 'Menuiseries exterieures',
    startDate: '2027-01-01',
    endDate: '2027-12-31',
  });
  const text = JSON.stringify(columns);
  assert.ok(text.includes('AXA France'));
  assert.ok(text.includes('ABC 123'));
  assert.ok(text.includes('du 01/01/2027 au 31/12/2027'));
  assert.ok(!text.includes('2026'));

  const sections = buildCgvSections({
    clientType: CLIENT_TYPES.PARTICULIER,
    contractType: CONTRACT_TYPES.AVEC_POSE,
    quoteSettings: {},
    insurance: { insurer: 'AXA France', contractNumber: 'ABC 123' },
  });
  const cgvText = sections.map((section) => section.text).join('\n');
  assert.ok(cgvText.includes('AXA France n° ABC 123'));
});

run('produit 8 sections pour chacune des 4 variantes', () => {
  MATRIX.forEach(([clientType, contractType]) => {
    const sections = build(clientType, contractType);
    assert.equal(sections.length, 8);
    sections.forEach((section) => {
      assert.ok(section.title, 'titre manquant');
      assert.ok(section.text, 'texte manquant');
    });
  });
});

run('CM2C present en B2C uniquement, jamais en B2B', () => {
  MATRIX.forEach(([clientType, contractType]) => {
    const text = flatten(build(clientType, contractType));
    if (clientType === CLIENT_TYPES.PARTICULIER) {
      assert.ok(text.includes('CM2C'), `CM2C absent (${contractType})`);
      assert.ok(text.includes('cm2c@cm2c.net'));
      assert.ok(text.includes('49 rue de Ponthieu'));
    } else {
      assert.ok(!text.includes('CM2C'), `CM2C affiche en B2B (${contractType})`);
    }
  });
});

run("indemnite de 40 € et penalites BCE reservees au B2B", () => {
  MATRIX.forEach(([clientType, contractType]) => {
    const text = flatten(build(clientType, contractType));
    const isPro = clientType === CLIENT_TYPES.PROFESSIONNEL;
    assert.equal(text.includes('40 €'), isPro, `40 € (${clientType}/${contractType})`);
    assert.equal(
      text.includes('taux de refinancement'),
      isPro,
      `penalites BCE (${clientType}/${contractType})`
    );
  });
});

run('aucune juridiction imposee : ni Melun ni tribunal de commerce exclusif', () => {
  MATRIX.forEach(([clientType, contractType]) => {
    const text = flatten(build(clientType, contractType));
    assert.ok(!text.includes('Melun'));
    assert.ok(!text.includes('compétence exclusive'));
  });
});

run('clauses retractation : L. 221-28 en B2C fourniture seule uniquement', () => {
  const b2cSeule = flatten(build(CLIENT_TYPES.PARTICULIER, CONTRACT_TYPES.FOURNITURE_SEULE));
  const b2cPose = flatten(build(CLIENT_TYPES.PARTICULIER, CONTRACT_TYPES.AVEC_POSE));
  const b2bSeule = flatten(build(CLIENT_TYPES.PROFESSIONNEL, CONTRACT_TYPES.FOURNITURE_SEULE));

  assert.ok(b2cSeule.includes('L. 221-28'));
  assert.ok(!b2cPose.includes('L. 221-28'));
  assert.ok(
    b2cPose.includes('conclu à distance ou hors établissement'),
    'clause generale distance/hors etablissement manquante en B2C pose'
  );
  assert.ok(!b2bSeule.includes('L. 221-28'));
  // Interdiction de percevoir un paiement avant 7 jours : B2C uniquement.
  assert.ok(b2cSeule.includes('sept jours'));
  assert.ok(b2cPose.includes('sept jours'));
  assert.ok(!b2bSeule.includes('sept jours'));
});

run('aucune clause de garanties travaux/pose sur une fourniture seule', () => {
  [CLIENT_TYPES.PARTICULIER, CLIENT_TYPES.PROFESSIONNEL].forEach((clientType) => {
    const seule = flatten(build(clientType, CONTRACT_TYPES.FOURNITURE_SEULE));
    const pose = flatten(build(clientType, CONTRACT_TYPES.AVEC_POSE));

    assert.ok(!seule.includes('décennale'), `decennale en fourniture seule (${clientType})`);
    assert.ok(!seule.includes('parfait achèvement'));
    assert.ok(!seule.includes('conformité des supports'));
    assert.ok(pose.includes('décennale'));
    assert.ok(pose.includes('parfait achèvement'));
  });
});

run('reserve de propriete limitee aux elements non incorpores en avec pose', () => {
  const pose = flatten(build(CLIENT_TYPES.PARTICULIER, CONTRACT_TYPES.AVEC_POSE));
  assert.ok(pose.includes('non encore incorporés'));
  assert.ok(pose.includes("n'emporte pas la dépose automatique"));
});

run('SAV dix ans : jamais presente comme garantie gratuite, ancien texte supprime', () => {
  MATRIX.forEach(([clientType, contractType]) => {
    const text = flatten(build(clientType, contractType));
    assert.ok(!text.includes('garantis 10 ans'), 'ancienne mention encore presente');
    assert.ok(text.includes('suivi après-vente'));
    assert.ok(text.includes('ne constitue pas une garantie générale et gratuite'));
    assert.ok(text.includes('pièce compatible'));
  });
});

run("emploie « acompte », jamais « arrhes », et l'ordre de virement ne vaut pas paiement", () => {
  MATRIX.forEach(([clientType, contractType]) => {
    const text = flatten(build(clientType, contractType));
    assert.ok(!text.toLowerCase().includes('arrhes'));
    assert.ok(text.includes('acompte'));
    assert.ok(text.includes('ordre de virement'));
    assert.ok(text.includes('ne constitue pas un encaissement'));
    assert.ok(text.includes('crédit effectif du compte bancaire de SARANGE'));
  });
});

run("clause d'annulation equilibree (plus de cumul acompte + execution forcee)", () => {
  MATRIX.forEach(([clientType, contractType]) => {
    const text = flatten(build(clientType, contractType));
    assert.ok(!text.includes('exécution forcée'));
    assert.ok(!text.includes("reste acquis à SARANGE"));
    assert.ok(text.includes('sous déduction des coûts évités'));
    assert.ok(text.includes('Réciproquement'));
  });
});

run("une seule variante d'echeancier apparait dans l'article 2", () => {
  const standard = flatten(build(CLIENT_TYPES.PARTICULIER, CONTRACT_TYPES.AVEC_POSE, { paymentMode: 'standard' }));
  assert.ok(standard.includes("acompte de 50%"));
  assert.ok(!standard.includes('échéancier personnalisé'));
  assert.ok(!standard.includes('trois échéances'));

  const schedule = flatten(build(CLIENT_TYPES.PARTICULIER, CONTRACT_TYPES.AVEC_POSE, {
    paymentMode: 'schedule',
    customSignaturePercent: 40,
    customOpeningPercent: 30,
    customBalancePercent: 30,
  }));
  assert.ok(schedule.includes('échéancier personnalisé'));
  assert.ok(!schedule.includes('trois échéances'));

  const fabricationPose = flatten(build(CLIENT_TYPES.PARTICULIER, CONTRACT_TYPES.AVEC_POSE, {
    paymentMode: 'fabricationPose',
  }));
  assert.ok(fabricationPose.includes('trois échéances'));
  assert.ok(!fabricationPose.includes('échéancier personnalisé'));
});

run("mediation : maitre de l'ouvrage en pose, client consommateur en fourniture seule", () => {
  const pose = flatten(build(CLIENT_TYPES.PARTICULIER, CONTRACT_TYPES.AVEC_POSE));
  const seule = flatten(build(CLIENT_TYPES.PARTICULIER, CONTRACT_TYPES.FOURNITURE_SEULE));
  assert.ok(pose.includes("maître de l'ouvrage"));
  assert.ok(seule.includes('client consommateur'));
  assert.ok(!seule.includes("maître de l'ouvrage"));
});

run('vieux textes contradictoires purges (30 jours, 50 % fige)', () => {
  const text = flatten(build(CLIENT_TYPES.PROFESSIONNEL, CONTRACT_TYPES.AVEC_POSE, {
    validityMonths: 2,
    paymentMode: 'standard',
    standardDepositPercent: 30,
  }));
  assert.ok(!text.includes('30 jours'));
  assert.ok(text.includes('2 mois'));
  assert.ok(text.includes('acompte de 30%'));
});

run('carte garanties du devis sans clause pose en fourniture seule', () => {
  const seule = JSON.stringify(getLegalNoticeColumns(CONTRACT_TYPES.FOURNITURE_SEULE));
  const pose = JSON.stringify(getLegalNoticeColumns(CONTRACT_TYPES.AVEC_POSE));
  assert.ok(!seule.includes('décennale'));
  assert.ok(seule.includes('suivi après-vente'));
  assert.ok(pose.includes('décennale'));
});

run('snapshot : figement, normalisation et resolution par variante', () => {
  const snapshot = buildCgvSnapshot({
    clientType: 'PROFESSIONNEL',
    generatedAt: '2026-07-29T10:00:00.000Z',
    entries: [
      {
        variantId: 'var-1',
        contractType: CONTRACT_TYPES.AVEC_POSE,
        quoteSettings: { paymentMode: 'fabricationPose' },
      },
      {
        variantId: 'var-2',
        contractType: CONTRACT_TYPES.FOURNITURE_SEULE,
        quoteSettings: { paymentMode: 'standard', standardDepositPercent: 40 },
      },
    ],
  });

  assert.equal(snapshot.version, CGV_VERSION);
  assert.equal(snapshot.clientType, 'PROFESSIONNEL');
  assert.equal(snapshot.entries.length, 2);
  assert.equal(snapshot.entries[0].paymentMode, 'fabricationPose');
  assert.ok(snapshot.entries[0].sections.length === 8);
  assert.ok(snapshot.entries[0].paymentTerms.length > 0);
  assert.ok(snapshot.entries[0].legalNotices.length > 0);

  // Aller-retour JSON (persistance Firestore) sans perte.
  const restored = normalizeCgvSnapshot(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(restored, snapshot);

  // Resolution par variante + repli mono.
  assert.equal(matchCgvSnapshotEntry(snapshot, 'var-2').variantId, 'var-2');
  assert.equal(matchCgvSnapshotEntry(snapshot, 'var-inconnue'), null);
  assert.equal(matchCgvSnapshotEntry(null, 'var-1'), null);

  const mono = buildCgvSnapshot({
    clientType: 'PARTICULIER',
    entries: [
      {
        variantId: 'mono',
        contractType: CONTRACT_TYPES.FOURNITURE_SEULE,
        quoteSettings: {},
      },
    ],
  });
  assert.equal(matchCgvSnapshotEntry(mono).variantId, 'mono');
  // Le snapshot fige le TEXTE : il ne doit plus contenir l'ancienne garantie.
  assert.ok(!JSON.stringify(mono).includes('garantis 10 ans'));
});

console.log('Tous les tests des CGV adaptatives ont reussi.');
