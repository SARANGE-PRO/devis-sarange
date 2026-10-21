import assert from 'node:assert/strict';
import {
  POSE_DESCRIPTION_MAX_LENGTH,
  buildPoseDescription,
  buildPoseDesignation,
  normalizePoseDescription,
  parsePoseDesignation,
  resolvePoseDescription,
  resolvePoseKind,
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
const ELEC = 'alimentation 230 V en attente (électricité à la charge du client)';

run('nature du poste : menuiserie, volet seul, porte, composé, produit libre, box', () => {
  assert.equal(resolvePoseKind({ productId: 'fenetre-1v', sheetName: 'Fenêtre 1V' }), 'menuiserie');
  assert.equal(resolvePoseKind({ productId: 'pf-2v-alu', sheetName: 'Porte-Fenêtre 2V ALU' }), 'menuiserie');
  assert.equal(resolvePoseKind({ productId: 'volet-radio', sheetName: 'Volet Filaire' }), 'volet');
  assert.equal(resolvePoseKind({ productId: 'volet-box-domotique', sheetName: 'Volet Box domotique' }), 'box-domotique');
  assert.equal(resolvePoseKind({ productId: 'porte-reno', sheetName: 'Porte Entrée RENO' }), 'porte');
  assert.equal(resolvePoseKind({ productId: 'porte-neuf-alu', sheetName: 'Porte Entrée NEUF ALU' }), 'porte');
  assert.equal(resolvePoseKind({ isComposite: true }), 'composite');
  assert.equal(resolvePoseKind({ productId: 'custom-product' }), 'custom');
});

run('menuiserie sans volet : une seule ligne courte', () => {
  const text = buildPoseDescription({ productId: 'fenetre-1v', sheetName: 'Fenêtre 1V' });
  assert.equal(text, 'Fixation, calfeutrement et étanchéité, réglage des ouvrants, contrôle du fonctionnement.');
  assert.equal(lineCount(text), 1);
});

run('menuiserie avec volet monobloc : deux lignes, électricité à la charge du client', () => {
  const radio = buildPoseDescription({ productId: 'fenetre-2v', voletMonobloc: true, voletMonoblocManoeuvre: 'radio' });
  assert.equal(lineCount(radio), 2);
  assert.equal(
    radio.split('\n')[0],
    'La menuiserie et le volet monobloc posés en une seule intervention : fixation, calfeutrement et étanchéité, réglage des ouvrants.'
  );
  assert.equal(radio.split('\n')[1], `Volet : raccordement sur ${ELEC}, appairage de la télécommande, réglages, contrôle du fonctionnement.`);
  assert.ok(!radio.includes('deux lignes ci-dessus'));
  const manuel = buildPoseDescription({ productId: 'fenetre-2v', voletMonobloc: true });
  assert.equal(manuel.split('\n')[1], 'Volet : réglage de la manœuvre, contrôle du fonctionnement.');
  const filaire = buildPoseDescription({ productId: 'fenetre-2v', voletMonobloc: true, voletMonoblocManoeuvre: 'filaire' });
  assert.equal(filaire.split('\n')[1], `Volet : raccordement sur ${ELEC}, réglages, contrôle du fonctionnement.`);
  const solaire = buildPoseDescription({ productId: 'fenetre-2v', voletMonobloc: true, voletMonoblocManoeuvre: 'solaire' });
  assert.equal(solaire.split('\n')[1], 'Volet : mise en service solaire sans raccordement électrique, réglages, contrôle du fonctionnement.');
  assert.ok(!solaire.includes('230 V'), 'pas d’électricité pour le solaire');
});

run('volet chiffré séparément : la pose rappelle qu’elle couvre les deux lignes', () => {
  const text = buildPoseDescription({
    productId: 'pf-1v',
    voletMonobloc: true,
    voletMonoblocSeparate: true,
    voletMonoblocManoeuvre: 'filaire',
  });
  assert.equal(
    text.split('\n')[0],
    'Pose unique de la menuiserie et du volet monobloc (deux lignes ci-dessus) : fixation, calfeutrement et étanchéité, réglage des ouvrants.'
  );
  assert.equal(lineCount(text), 2);
});

run('volet roulant seul : une ligne, manœuvre d’après le produit', () => {
  const radio = buildPoseDescription({ productId: 'volet-radio', productLabel: 'Volet roulant radio' });
  assert.equal(radio, `Fixation du coffre et des coulisses, calfeutrement, raccordement sur ${ELEC}, appairage de la télécommande, réglages.`);
  assert.equal(buildPoseDescription({ productId: 'volet-manuel' }), 'Fixation du coffre et des coulisses, calfeutrement, réglage de la manœuvre.');
  assert.ok(buildPoseDescription({ productId: 'volet-solaire' }).includes('mise en service solaire sans raccordement électrique'));
  assert.ok(buildPoseDescription({ productId: 'volet-filaire' }).includes(ELEC));
});

run('porte d’entrée : une ligne, dormant existant ou dormant neuf', () => {
  const reno = buildPoseDescription({ productId: 'porte-reno', sheetName: 'Porte Entrée RENO' });
  assert.equal(reno, 'Sur dormant existant : fixation, calfeutrement et étanchéité, réglage des paumelles et de la serrure, contrôle du fonctionnement.');
  const neuf = buildPoseDescription({ productId: 'porte-neuf-alu', sheetName: 'Porte Entrée NEUF ALU' });
  assert.ok(neuf.startsWith('Dormant neuf : fixation'));
  assert.equal(lineCount(neuf), 1);
});

run('châssis composé : l’ensemble en une seule intervention, nombre de châssis', () => {
  assert.equal(
    buildPoseDescription({ isComposite: true }, { moduleCount: 3 }),
    "L'ensemble composé (3 châssis) posé en une seule intervention : fixation, calfeutrement et étanchéité, réglage des ouvrants, contrôle du fonctionnement."
  );
  assert.ok(buildPoseDescription({ isComposite: true }).startsWith("L'ensemble composé posé en une seule intervention"));
  const withVolet = buildPoseDescription({ isComposite: true, voletMonobloc: true, voletMonoblocManoeuvre: 'radio' }, { moduleCount: 2 });
  assert.ok(withVolet.startsWith("L'ensemble composé (2 châssis) et le volet monobloc posés en une seule intervention"));
  const separate = buildPoseDescription({ isComposite: true, voletMonobloc: true, voletMonoblocSeparate: true }, { moduleCount: 2 });
  assert.ok(separate.startsWith("Pose unique de l'ensemble composé (2 châssis) et du volet monobloc (deux lignes ci-dessus)"));
});

run('produit libre et box domotique', () => {
  assert.equal(buildPoseDescription({ productId: 'custom-product' }), "Dépose éventuelle, pose et raccordement d'étanchéité.");
  assert.equal(buildPoseDescription({ productId: 'volet-box-domotique' }), 'Installation, paramétrage et appairage des volets.');
});

run('texte saisi : prioritaire, nettoyé et borné ; null = automatique ; vide = aucun détail', () => {
  assert.equal(normalizePoseDescription(null), null);
  assert.equal(normalizePoseDescription(undefined), null);
  assert.equal(normalizePoseDescription('  Pose spéciale \r\n avec nacelle  '), 'Pose spéciale\n avec nacelle');
  assert.equal(normalizePoseDescription('x'.repeat(700)).length, POSE_DESCRIPTION_MAX_LENGTH);
  assert.equal(resolvePoseDescription({ productId: 'fenetre-1v', poseDescription: 'Avec nacelle.' }), 'Avec nacelle.');
  assert.equal(resolvePoseDescription({ productId: 'fenetre-1v', poseDescription: '' }), '', 'vide = pas de détail');
  assert.ok(resolvePoseDescription({ productId: 'fenetre-1v' }).startsWith('Fixation'));
});

run('désignation complète et lecture inverse du texte édité', () => {
  assert.equal(buildPoseDesignation('Pose fenêtre', 'Détail.'), 'Pose fenêtre\nDétail.');
  assert.equal(buildPoseDesignation('Pose fenêtre', ''), 'Pose fenêtre');
  assert.deepEqual(parsePoseDesignation('Pose fenêtre\nLigne 1\nLigne 2'), { poseLabel: 'Pose fenêtre', poseDescription: 'Ligne 1\nLigne 2' });
  assert.deepEqual(parsePoseDesignation('Pose fenêtre'), { poseLabel: 'Pose fenêtre', poseDescription: '' }, 'libellé seul = aucun détail voulu');
  assert.deepEqual(parsePoseDesignation(''), { poseLabel: '', poseDescription: null }, 'tout vide = textes automatiques');
});

console.log('Tous les tests de désignation de pose ont reussi.');
