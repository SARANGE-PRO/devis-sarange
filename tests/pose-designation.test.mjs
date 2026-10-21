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

run('menuiserie sans volet : pose, calfeutrement, réglages, contrôle', () => {
  const text = buildPoseDescription({ productId: 'fenetre-1v', sheetName: 'Fenêtre 1V' });
  assert.equal(
    text,
    'Pose et fixation de la menuiserie, calfeutrement et étanchéité.\nRéglage des ouvrants, contrôle du bon fonctionnement.'
  );
  assert.ok(!text.includes('volet'));
});

run('menuiserie avec volet monobloc : une seule intervention, mise en service selon la manœuvre', () => {
  const radio = buildPoseDescription({ productId: 'fenetre-2v', voletMonobloc: true, voletMonoblocManoeuvre: 'radio' });
  assert.ok(radio.startsWith('Pose et fixation de la menuiserie et du volet roulant monobloc intégré en une seule intervention, calfeutrement'));
  assert.ok(radio.includes('Volet : raccordement du moteur sur alimentation en attente, appairage de la télécommande'));
  assert.ok(!radio.includes('chiffrés séparément'));
  const manuel = buildPoseDescription({ productId: 'fenetre-2v', voletMonobloc: true });
  assert.ok(manuel.includes('Volet : réglage de la manœuvre manuelle, contrôle du bon fonctionnement.'));
  const solaire = buildPoseDescription({ productId: 'fenetre-2v', voletMonobloc: true, voletMonoblocManoeuvre: 'solaire' });
  assert.ok(solaire.includes('sans raccordement électrique'));
});

run('volet chiffré séparément : la pose rappelle qu’elle couvre les deux', () => {
  const text = buildPoseDescription({
    productId: 'pf-1v',
    voletMonobloc: true,
    voletMonoblocSeparate: true,
    voletMonoblocManoeuvre: 'filaire',
  });
  assert.ok(text.includes('en une seule intervention (menuiserie et volet chiffrés séparément ci-dessus)'));
  assert.ok(text.includes('raccordement de la commande filaire'));
});

run('volet roulant seul : coffre, coulisses, manœuvre d’après le produit', () => {
  const radio = buildPoseDescription({ productId: 'volet-radio', productLabel: 'Volet roulant radio' });
  assert.equal(radio.split('\n')[0], 'Pose et fixation du coffre et des coulisses, calfeutrement.');
  assert.ok(radio.includes('Raccordement du moteur sur alimentation en attente, appairage de la télécommande'));
  assert.ok(buildPoseDescription({ productId: 'volet-manuel' }).includes('Réglage de la manœuvre manuelle'));
  assert.ok(buildPoseDescription({ productId: 'volet-solaire' }).includes('Mise en service de la motorisation solaire'));
});

run('porte d’entrée : rénovation sur dormant existant ou dormant neuf', () => {
  const reno = buildPoseDescription({ productId: 'porte-reno', sheetName: 'Porte Entrée RENO' });
  assert.ok(reno.startsWith('Pose en rénovation sur le dormant existant'));
  assert.ok(reno.includes('Réglage des paumelles et de la serrure'));
  const neuf = buildPoseDescription({ productId: 'porte-neuf-alu', sheetName: 'Porte Entrée NEUF ALU' });
  assert.ok(neuf.startsWith('Pose du bloc-porte avec dormant neuf'));
});

run('châssis composé : l’ensemble, avec le nombre de châssis', () => {
  assert.ok(buildPoseDescription({ isComposite: true }, { moduleCount: 3 }).startsWith("Pose et fixation de l'ensemble composé (3 châssis), calfeutrement"));
  assert.ok(buildPoseDescription({ isComposite: true }).startsWith("Pose et fixation de l'ensemble composé, calfeutrement"));
  const withVolet = buildPoseDescription({ isComposite: true, voletMonobloc: true, voletMonoblocManoeuvre: 'radio' }, { moduleCount: 2 });
  assert.ok(withVolet.includes("de l'ensemble composé (2 châssis) et du volet roulant monobloc intégré"));
});

run('produit libre et box domotique', () => {
  assert.equal(buildPoseDescription({ productId: 'custom-product' }), "Dépose éventuelle, pose et raccordement d'étanchéité par nos équipes.");
  assert.ok(buildPoseDescription({ productId: 'volet-box-domotique' }).startsWith('Installation et paramétrage de la box domotique'));
});

run('texte saisi : prioritaire, nettoyé et borné ; null = automatique ; vide = aucun détail', () => {
  assert.equal(normalizePoseDescription(null), null);
  assert.equal(normalizePoseDescription(undefined), null);
  assert.equal(normalizePoseDescription('  Pose spéciale \r\n avec nacelle  '), 'Pose spéciale\n avec nacelle');
  assert.equal(normalizePoseDescription('x'.repeat(700)).length, POSE_DESCRIPTION_MAX_LENGTH);
  assert.equal(resolvePoseDescription({ productId: 'fenetre-1v', poseDescription: 'Avec nacelle.' }), 'Avec nacelle.');
  assert.equal(resolvePoseDescription({ productId: 'fenetre-1v', poseDescription: '' }), '', 'vide = pas de détail');
  assert.ok(resolvePoseDescription({ productId: 'fenetre-1v' }).startsWith('Pose et fixation'));
});

run('désignation complète et lecture inverse du texte édité', () => {
  assert.equal(buildPoseDesignation('Pose fenêtre', 'Détail.'), 'Pose fenêtre\nDétail.');
  assert.equal(buildPoseDesignation('Pose fenêtre', ''), 'Pose fenêtre');
  assert.deepEqual(parsePoseDesignation('Pose fenêtre\nLigne 1\nLigne 2'), { poseLabel: 'Pose fenêtre', poseDescription: 'Ligne 1\nLigne 2' });
  assert.deepEqual(parsePoseDesignation('Pose fenêtre'), { poseLabel: 'Pose fenêtre', poseDescription: '' }, 'libellé seul = aucun détail voulu');
  assert.deepEqual(parsePoseDesignation(''), { poseLabel: '', poseDescription: null }, 'tout vide = textes automatiques');
});

console.log('Tous les tests de désignation de pose ont reussi.');
