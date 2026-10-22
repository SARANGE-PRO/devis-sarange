import assert from 'node:assert/strict';
import {
  POSE_DESCRIPTION_MAX_LENGTH,
  buildPoseDescription,
  buildPoseDesignation,
  buildPoseLabel,
  itemNeedsPowerSupply,
  normalizePoseDescription,
  parsePoseDesignation,
  quoteNeedsPowerSupply,
  resolvePoseDescription,
  resolvePoseKind,
  resolvePoseMaterial,
} from '../lib/pose-designation.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

const lineCount = (text) => text.split('\n').length;

run('nature du poste : fenêtre, porte-fenêtre, coulissant, châssis fixe, porte, volet, composé, libre, box', () => {
  assert.equal(resolvePoseKind({ productId: 'fenetre-1v', sheetName: 'Fenêtre 1V' }), 'fenetre');
  assert.equal(resolvePoseKind({ productId: 'fenetre-fixe-alu', sheetName: 'Fenêtre Fixe ALU' }), 'fixe');
  assert.equal(resolvePoseKind({ productId: 'pf-2v-alu', sheetName: 'Porte-Fenêtre 2V ALU' }), 'porte-fenetre');
  assert.equal(resolvePoseKind({ productId: 'coulissant-2v2r', sheetName: 'Coulissant 2 vantaux 2 rails' }), 'coulissant');
  assert.equal(resolvePoseKind({ productId: 'galandage-2v-alu', sheetName: 'Galandage 2 vantaux ALU' }), 'coulissant');
  assert.equal(resolvePoseKind({ productId: 'volet-radio', sheetName: 'Volet Filaire' }), 'volet');
  assert.equal(resolvePoseKind({ productId: 'volet-box-domotique', sheetName: 'Volet Box domotique' }), 'box-domotique');
  assert.equal(resolvePoseKind({ productId: 'porte-reno', sheetName: 'Porte Entrée RENO' }), 'porte');
  assert.equal(resolvePoseKind({ isComposite: true }), 'composite');
  assert.equal(resolvePoseKind({ productId: 'custom-product' }), 'custom');
});

run('matériau : champ explicite, jumeau -alu, feuille ALU, PVC par défaut', () => {
  assert.equal(resolvePoseMaterial({ productId: 'fenetre-1v' }), 'pvc');
  assert.equal(resolvePoseMaterial({ productId: 'fenetre-1v-alu' }), 'alu');
  assert.equal(resolvePoseMaterial({ productId: 'fenetre-1v', sheetName: 'Fenêtre 1V ALU' }), 'alu');
  assert.equal(resolvePoseMaterial({ productId: 'fenetre-1v', material: 'alu' }), 'alu');
  assert.equal(resolvePoseMaterial({ isComposite: true, compositeMaterial: 'alu' }), 'alu');
});

run('libellés adaptés au produit : matériau, vantaux, rails, motorisation', () => {
  assert.equal(buildPoseLabel({ productId: 'fenetre-2v', productLabel: 'Fenêtre 2 vantaux' }), 'Pose fenêtre PVC 2 vantaux');
  assert.equal(
    buildPoseLabel({ productId: 'fenetre-2v-alu', productLabel: 'Fenêtre 2 vantaux', sheetName: 'Fenêtre 2V ALU' }),
    'Pose fenêtre aluminium 2 vantaux'
  );
  assert.equal(buildPoseLabel({ productId: 'fenetre-2v1f', productLabel: 'Fenêtre 2V + 1 fixe' }), 'Pose fenêtre PVC 2V + 1 fixe');
  assert.equal(buildPoseLabel({ productId: 'fenetre-soufflet', productLabel: 'Fenêtre soufflet' }), 'Pose fenêtre PVC soufflet');
  assert.equal(buildPoseLabel({ productId: 'pf-2v', productLabel: 'Porte-fenêtre 2 vantaux' }), 'Pose porte-fenêtre PVC 2 vantaux');
  assert.equal(
    buildPoseLabel({ productId: 'coulissant-2v2r-alu', productLabel: 'Coulissant 2 vantaux 2 rails' }),
    'Pose coulissant aluminium 2 vantaux – 2 rails'
  );
  assert.equal(
    buildPoseLabel({ productId: 'galandage-2v-alu', productLabel: 'Coulissant à galandage 2 vantaux' }),
    'Pose coulissant à galandage aluminium 2 vantaux'
  );
  assert.equal(buildPoseLabel({ productId: 'fenetre-fixe', productLabel: 'Fenêtre fixe' }), 'Pose châssis fixe');
  assert.equal(buildPoseLabel({ isComposite: true }), 'Pose châssis composé');
  assert.equal(buildPoseLabel({ productId: 'porte-reno', productLabel: "Porte d'entrée rénovation" }), "Pose porte d'entrée");
  assert.equal(buildPoseLabel({ productId: 'porte-neuf-alu', productLabel: "Porte d'entrée neuf" }), "Pose porte d'entrée");
  assert.equal(buildPoseLabel({ productId: 'volet-radio', productLabel: 'Volet roulant radio' }), 'Pose volet roulant motorisé radio');
  assert.equal(buildPoseLabel({ productId: 'volet-filaire', productLabel: 'Volet roulant filaire' }), 'Pose volet roulant motorisé filaire');
  assert.equal(buildPoseLabel({ productId: 'volet-solaire', productLabel: 'Volet roulant solaire' }), 'Pose volet roulant solaire');
  assert.equal(buildPoseLabel({ productId: 'volet-manuel', productLabel: 'Volet roulant manuel' }), 'Pose volet roulant manuel');
  assert.equal(buildPoseLabel({ productId: 'volet-box-domotique' }), 'Pose box domotique');
  assert.equal(buildPoseLabel({ productId: 'custom-product', productLabel: 'Fenêtre de toit' }), 'Pose Fenêtre de toit');
  // Ligne importée du site qui porte déjà le matériau : pas de doublon.
  assert.equal(buildPoseLabel({ productId: 'fenetre-1v', productLabel: 'Fenêtre PVC 1 vantail' }), 'Pose fenêtre PVC 1 vantail');
  // Volet monobloc : la pose couvre les deux.
  assert.equal(
    buildPoseLabel({ productId: 'fenetre-2v', productLabel: 'Fenêtre 2 vantaux', voletMonobloc: true }),
    'Pose fenêtre PVC 2 vantaux et volet roulant monobloc'
  );
  assert.equal(buildPoseLabel({ isComposite: true, voletMonobloc: true }), 'Pose châssis composé et volet roulant monobloc');
});

run('descriptions : une ligne par poste, textes de la spécification', () => {
  assert.equal(
    buildPoseDescription({ productId: 'fenetre-1v' }),
    'Installation, fixation, calfeutrement et étanchéité périphérique, réglages et contrôle du bon fonctionnement.'
  );
  assert.equal(
    buildPoseDescription({ productId: 'pf-2v' }),
    'Installation, fixation, calfeutrement et étanchéité, réglages des ouvrants et contrôle du fonctionnement.'
  );
  assert.equal(
    buildPoseDescription({ productId: 'porte-reno' }),
    'Installation, fixation, étanchéité, réglages des paumelles et de la serrure, contrôle du fonctionnement.'
  );
  assert.equal(
    buildPoseDescription({ productId: 'coulissant-2v2r' }),
    'Installation, fixation, étanchéité périphérique, réglages des vantaux et contrôle du coulissement.'
  );
  const fixe = 'Installation, fixation, calfeutrement et étanchéité périphérique, contrôle des finitions.';
  assert.equal(buildPoseDescription({ productId: 'fenetre-fixe' }), fixe);
  assert.equal(buildPoseDescription({ isComposite: true }), fixe);
  assert.equal(
    buildPoseDescription({ productId: 'volet-radio' }),
    'Installation et fixation du volet roulant, branchement sur alimentation mise à disposition, réglages, programmation et essais de fonctionnement.'
  );
  assert.equal(buildPoseDescription({ productId: 'volet-filaire' }), buildPoseDescription({ productId: 'volet-radio' }));
  assert.equal(
    buildPoseDescription({ productId: 'volet-solaire' }),
    'Installation et fixation du volet roulant, réglages, programmation et essais de fonctionnement.'
  );
  assert.equal(
    buildPoseDescription({ productId: 'volet-manuel' }),
    'Installation et fixation du volet roulant, réglages et vérification du bon fonctionnement.'
  );
  assert.equal(buildPoseDescription({ productId: 'custom-product' }), "Dépose éventuelle, pose et raccordement d'étanchéité.");
  assert.equal(buildPoseDescription({ productId: 'volet-box-domotique' }), 'Installation, paramétrage et appairage des volets.');
  for (const item of [{ productId: 'fenetre-1v' }, { productId: 'pf-2v' }, { productId: 'volet-radio' }, { isComposite: true }]) {
    assert.equal(lineCount(buildPoseDescription(item)), 1);
  }
});

run('volet monobloc : deuxième ligne selon la manœuvre, jamais plus de deux lignes', () => {
  const radio = buildPoseDescription({ productId: 'fenetre-2v', voletMonobloc: true, voletMonoblocManoeuvre: 'radio' });
  assert.equal(lineCount(radio), 2);
  assert.equal(radio.split('\n')[1], 'Volet roulant monobloc : branchement sur alimentation mise à disposition, réglages, programmation et essais.');
  assert.equal(
    buildPoseDescription({ productId: 'pf-1v', voletMonobloc: true, voletMonoblocManoeuvre: 'filaire', voletMonoblocSeparate: true }).split('\n')[1],
    'Volet roulant monobloc : branchement sur alimentation mise à disposition, réglages, programmation et essais.'
  );
  assert.equal(
    buildPoseDescription({ productId: 'fenetre-2v', voletMonobloc: true, voletMonoblocManoeuvre: 'solaire' }).split('\n')[1],
    'Volet roulant monobloc : réglages, programmation et essais.'
  );
  assert.equal(
    buildPoseDescription({ productId: 'fenetre-2v', voletMonobloc: true }).split('\n')[1],
    'Volet roulant monobloc : réglages et vérification du bon fonctionnement.'
  );
  assert.equal(lineCount(buildPoseDescription({ isComposite: true, voletMonobloc: true, voletMonoblocManoeuvre: 'radio' })), 2);
  assert.ok(!buildPoseDescription({ productId: 'fenetre-2v', voletMonobloc: true, voletMonoblocManoeuvre: 'radio' }).includes('230 V'), 'jamais sous le poste');
});

run('alimentation 230 V : volets électriques seuls ou monobloc, jamais solaire ni manuel', () => {
  assert.equal(itemNeedsPowerSupply({ productId: 'volet-radio' }), true);
  assert.equal(itemNeedsPowerSupply({ productId: 'volet-filaire' }), true);
  assert.equal(itemNeedsPowerSupply({ productId: 'volet-solaire' }), false);
  assert.equal(itemNeedsPowerSupply({ productId: 'volet-manuel' }), false);
  assert.equal(itemNeedsPowerSupply({ productId: 'fenetre-2v', voletMonobloc: true, voletMonoblocManoeuvre: 'radio' }), true);
  assert.equal(itemNeedsPowerSupply({ productId: 'fenetre-2v', voletMonobloc: true, voletMonoblocManoeuvre: 'solaire' }), false);
  assert.equal(itemNeedsPowerSupply({ productId: 'fenetre-2v', voletMonobloc: true }), false);
  assert.equal(itemNeedsPowerSupply({ productId: 'fenetre-2v' }), false);
  assert.equal(quoteNeedsPowerSupply([{ productId: 'fenetre-2v' }, { productId: 'volet-solaire' }]), false);
  assert.equal(quoteNeedsPowerSupply([{ productId: 'fenetre-2v' }, { productId: 'volet-radio' }]), true);
  assert.equal(quoteNeedsPowerSupply([]), false);
  assert.equal(quoteNeedsPowerSupply(null), false);
});

run('texte saisi : prioritaire, nettoyé et borné ; null = automatique ; vide = aucun détail', () => {
  assert.equal(normalizePoseDescription(null), null);
  assert.equal(normalizePoseDescription(undefined), null);
  assert.equal(normalizePoseDescription('  Pose spéciale \r\n avec nacelle  '), 'Pose spéciale\n avec nacelle');
  assert.equal(normalizePoseDescription('x'.repeat(700)).length, POSE_DESCRIPTION_MAX_LENGTH);
  assert.equal(resolvePoseDescription({ productId: 'fenetre-1v', poseDescription: 'Avec nacelle.' }), 'Avec nacelle.');
  assert.equal(resolvePoseDescription({ productId: 'fenetre-1v', poseDescription: '' }), '', 'vide = pas de détail');
  assert.ok(resolvePoseDescription({ productId: 'fenetre-1v' }).startsWith('Installation'));
});

run('désignation complète et lecture inverse du texte édité', () => {
  assert.equal(buildPoseDesignation('Pose fenêtre', 'Détail.'), 'Pose fenêtre\nDétail.');
  assert.equal(buildPoseDesignation('Pose fenêtre', ''), 'Pose fenêtre');
  assert.deepEqual(parsePoseDesignation('Pose fenêtre\nLigne 1\nLigne 2'), { poseLabel: 'Pose fenêtre', poseDescription: 'Ligne 1\nLigne 2' });
  assert.deepEqual(parsePoseDesignation('Pose fenêtre'), { poseLabel: 'Pose fenêtre', poseDescription: '' }, 'libellé seul = aucun détail voulu');
  assert.deepEqual(parsePoseDesignation(''), { poseLabel: '', poseDescription: null }, 'tout vide = textes automatiques');
});

console.log('Tous les tests de désignation de pose ont reussi.');
