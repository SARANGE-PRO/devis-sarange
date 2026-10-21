import assert from 'node:assert/strict';
import {
  VOLET_MONOBLOC_COULEURS,
  buildVoletMonoblocDesignationLines,
  getVoletMonoblocCouleurHex,
  getVoletMonoblocCouleurLabel,
  getVoletMonoblocCouleurOptions,
  getVoletMonoblocLineDesignation,
  getVoletMonoblocManoeuvreSurcharge,
  isPresetVoletMonoblocCouleur,
  normalizeVoletMonoblocCouleur,
  normalizeVoletMonoblocPriceOverride,
  splitVoletMonoblocPricing,
} from '../lib/volet-monobloc.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('couleurs proposées : celles de l’app de métrage', () => {
  assert.deepEqual([...VOLET_MONOBLOC_COULEURS], ['Blanc', 'Gris 7016', 'Chêne doré', 'Noir']);
});

run('normalisation : liste, texte libre nettoyé, vide = ton menuiserie', () => {
  assert.equal(normalizeVoletMonoblocCouleur('Gris 7016'), 'Gris 7016');
  assert.equal(normalizeVoletMonoblocCouleur(''), '');
  assert.equal(normalizeVoletMonoblocCouleur(undefined), '');
  // « Autre » : texte libre conservé, espaces repliés, longueur bornée.
  assert.equal(normalizeVoletMonoblocCouleur('  RAL 5003   bleu nuit '), 'RAL 5003 bleu nuit');
  assert.equal(normalizeVoletMonoblocCouleur('x'.repeat(80)).length, 60);
  assert.equal(isPresetVoletMonoblocCouleur('Noir'), true);
  assert.equal(isPresetVoletMonoblocCouleur('RAL 5003'), false);
  assert.equal(isPresetVoletMonoblocCouleur(''), false);
  assert.equal(getVoletMonoblocCouleurLabel(''), 'ton menuiserie');
  assert.equal(getVoletMonoblocCouleurLabel('Noir'), 'Noir');
  assert.equal(getVoletMonoblocCouleurLabel('RAL 5003'), 'RAL 5003');
});

run('teinte de dessin : mêmes correspondances que le croquis de métrage', () => {
  assert.equal(getVoletMonoblocCouleurHex('Blanc'), '#FFFFFF');
  assert.equal(getVoletMonoblocCouleurHex('Gris 7016'), '#4A4A4A');
  assert.equal(getVoletMonoblocCouleurHex('Chêne doré'), '#8B5A2B');
  assert.equal(getVoletMonoblocCouleurHex('Noir'), '#2F2F2F');
  // Ton menuiserie : le rendu reprend la couleur du profilé.
  assert.equal(getVoletMonoblocCouleurHex(''), null);
  // Texte libre : mot-clé reconnu, sinon couleur du profilé.
  assert.equal(getVoletMonoblocCouleurHex('gris anthracite RAL 7016'), '#4A4A4A');
  assert.equal(getVoletMonoblocCouleurHex('RAL 5003 bleu nuit'), null);
});

run('options du sélecteur : ton menuiserie en premier', () => {
  const options = getVoletMonoblocCouleurOptions();
  assert.equal(options[0].id, '');
  assert.equal(options[0].label, 'Ton menuiserie');
  assert.equal(options.length, 5);
  assert.ok(options.slice(1).every((option) => option.hex));
});

/* ─── Prix du volet : manœuvre et prix saisi ─────────────────────────────── */

run('surcoût de manœuvre : même barème que les volets seuls (× 1,25)', () => {
  assert.equal(getVoletMonoblocManoeuvreSurcharge('manuel'), 0);
  assert.equal(getVoletMonoblocManoeuvreSurcharge('filaire'), 0);
  assert.equal(getVoletMonoblocManoeuvreSurcharge('radio'), 62.5);
  assert.equal(getVoletMonoblocManoeuvreSurcharge('solaire'), 300);
  assert.equal(getVoletMonoblocManoeuvreSurcharge(undefined), 0);
});

run('prix saisi : vide = grille, 0 = offert, jamais négatif, arrondi au centime', () => {
  assert.equal(normalizeVoletMonoblocPriceOverride(''), null);
  assert.equal(normalizeVoletMonoblocPriceOverride(null), null);
  assert.equal(normalizeVoletMonoblocPriceOverride(undefined), null);
  assert.equal(normalizeVoletMonoblocPriceOverride('abc'), null);
  assert.equal(normalizeVoletMonoblocPriceOverride(-5), null);
  assert.equal(normalizeVoletMonoblocPriceOverride(0), 0);
  assert.equal(normalizeVoletMonoblocPriceOverride('412,5'), 412.5);
  assert.equal(normalizeVoletMonoblocPriceOverride(199.999), 200);
});

/* ─── Désignation du volet ───────────────────────────────────────────────── */

run('désignation : manœuvre, coloris s’il diffère, coffre et tablier', () => {
  assert.deepEqual(buildVoletMonoblocDesignationLines({ voletMonobloc: false }), []);
  const manuel = buildVoletMonoblocDesignationLines({ voletMonobloc: true });
  assert.equal(manuel.length, 2);
  assert.equal(manuel[0], 'Volet roulant monobloc intégré – manœuvre manuelle (manivelle)');
  assert.ok(manuel[1].startsWith('Coffre isolé intégré'));
  const radio = buildVoletMonoblocDesignationLines({
    voletMonobloc: true,
    voletMonoblocManoeuvre: 'radio',
    voletMonoblocCouleur: 'Gris 7016',
  });
  assert.equal(radio[0], 'Volet roulant monobloc intégré – manœuvre radio (télécommande) – coloris Gris 7016');
});

run('sous-ligne « volet » : titre seul en 1re ligne, détail dessous', () => {
  const text = getVoletMonoblocLineDesignation({
    voletMonobloc: true,
    voletMonoblocManoeuvre: 'solaire',
    voletMonoblocCouleur: 'Noir',
  });
  const lines = text.split('\n');
  assert.equal(lines[0], 'Volet roulant monobloc intégré');
  assert.equal(lines[1], 'Manœuvre solaire (sans raccordement) – coloris Noir');
  assert.ok(lines[2].startsWith('Coffre isolé intégré'));
  assert.equal(getVoletMonoblocLineDesignation({ voletMonobloc: false }), '');
});

/* ─── Prix séparé : répartition menuiserie / volet ───────────────────────── */

run('prix séparé : la menuiserie et le volet se partagent exactement la ligne, remise comprise', () => {
  const item = { voletMonobloc: true, voletMonoblocSeparate: true, quantity: 2, remise: 20 };
  const calc = { unitPriceAfterDiscount: 800, totalLine: 1600, voletMonoblocUnitPrice: 300 };
  const pricing = { originalUnitHT: 1000, originalLineHT: 2000 };
  const split = splitVoletMonoblocPricing(item, calc, pricing);
  assert.equal(split.unitPrice, 300);
  // Volet : 300 avant remise, 240 après, × 2.
  assert.deepEqual(split.volet, {
    unitPriceAfterDiscount: 240,
    originalUnitHT: 300,
    totalLine: 480,
    originalLineHT: 600,
    discountLineHT: 120,
    hasDiscount: true,
  });
  // Menuiserie : le reste de la ligne.
  assert.deepEqual(split.menuiserie, {
    unitPriceAfterDiscount: 560,
    originalUnitHT: 700,
    totalLine: 1120,
    originalLineHT: 1400,
    discountLineHT: 280,
    hasDiscount: true,
  });
  assert.equal(split.menuiserie.totalLine + split.volet.totalLine, calc.totalLine);
});

run('prix séparé : rien à répartir sans volet, sans l’option, ou sans calcul de volet', () => {
  const calc = { unitPriceAfterDiscount: 800, totalLine: 800, voletMonoblocUnitPrice: 300 };
  assert.equal(splitVoletMonoblocPricing({ voletMonobloc: false, voletMonoblocSeparate: true }, calc, {}), null);
  assert.equal(splitVoletMonoblocPricing({ voletMonobloc: true, voletMonoblocSeparate: false }, calc, {}), null);
  assert.equal(
    splitVoletMonoblocPricing({ voletMonobloc: true, voletMonoblocSeparate: true }, { unitPriceAfterDiscount: 800, totalLine: 800 }, {}),
    null,
    'ligne spéciale sans part volet'
  );
  // Sans résumé de prix (pas de remise) : les prix barrés valent les prix nets.
  const plain = splitVoletMonoblocPricing({ voletMonobloc: true, voletMonoblocSeparate: true, quantity: 1 }, calc, {});
  assert.equal(plain.volet.originalUnitHT, 300);
  assert.equal(plain.volet.hasDiscount, false);
  assert.equal(plain.menuiserie.totalLine, 500);
  // Volet offert (0 €) : sous-ligne à 0, menuiserie = toute la ligne.
  const offered = splitVoletMonoblocPricing({ voletMonobloc: true, voletMonoblocSeparate: true, quantity: 1 }, { ...calc, voletMonoblocUnitPrice: 0 }, {});
  assert.equal(offered.volet.totalLine, 0);
  assert.equal(offered.menuiserie.totalLine, 800);
  // Prix saisi aberrant (plus que la ligne) : plafonné à la ligne, jamais de menuiserie négative.
  const capped = splitVoletMonoblocPricing({ voletMonobloc: true, voletMonoblocSeparate: true, quantity: 1 }, { ...calc, voletMonoblocUnitPrice: 5000 }, {});
  assert.equal(capped.volet.totalLine, 800);
  assert.equal(capped.menuiserie.totalLine, 0);
});

console.log('Tous les tests du volet monobloc ont reussi.');
