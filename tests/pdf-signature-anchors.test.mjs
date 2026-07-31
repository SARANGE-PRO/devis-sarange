import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  buildCheckmarkSegments,
  resolveAnchorPage,
  toPdfPoints,
  topMmToPdfY,
} from '../lib/pdf-signature-anchors.mjs';

const run = async (name, fn) => {
  try {
    await fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

const MM_TO_PT = 72 / 25.4;

run('toPdfPoints convertit des millimètres en points PDF', () => {
  assert.equal(toPdfPoints(25.4), 72);
  assert.equal(toPdfPoints(0), 0);
  assert.equal(toPdfPoints(undefined), 0);
  assert.equal(toPdfPoints(null), 0);
});

run("topMmToPdfY retourne le Y pdf-lib (bas-gauche) d'un repère haut-gauche", () => {
  const pageHeight = 297 * MM_TO_PT; // hauteur A4 en points
  // Un repère à 0mm du haut correspond au sommet de la page (Y = pageHeight).
  assert.equal(topMmToPdfY(pageHeight, 0), pageHeight);
  // Un repère à 297mm du haut (bas de la page) correspond à Y = 0.
  assert.equal(Math.round(topMmToPdfY(pageHeight, 297)), 0);
});

run('buildCheckmarkSegments produit une croix dans le carré, coordonnées bas-gauche', () => {
  const pageHeight = 297 * MM_TO_PT;
  const box = { x: 20, y: 12, width: 3.8 };
  const segments = buildCheckmarkSegments(pageHeight, box);

  assert.equal(segments.length, 2);
  const left = toPdfPoints(20);
  const size = toPdfPoints(3.8);
  const topY = pageHeight - toPdfPoints(12);
  const bottomY = pageHeight - toPdfPoints(12 + 3.8);

  // Diagonale 1 : coin bas-gauche -> coin haut-droit du carré.
  assert.deepEqual(segments[0], {
    start: { x: left, y: bottomY },
    end: { x: left + size, y: topY },
  });
  // Diagonale 2 : coin bas-droit -> coin haut-gauche.
  assert.deepEqual(segments[1], {
    start: { x: left + size, y: bottomY },
    end: { x: left, y: topY },
  });
  // La croix reste bien DANS le carré déclaré (bas ≤ haut).
  assert.ok(bottomY < topY);
});

await run(
  'resolveAnchorPage cible la page du repère, PAS forcément la page de signature (régression)',
  async () => {
    const pdfDocument = await PDFDocument.create();
    const page1 = pdfDocument.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
    const page2 = pdfDocument.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
    const page3 = pdfDocument.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);

    // Cas réel du bug rapporté : la case TVA réduite vit sur la page 2 (fin
    // des conditions commerciales / CGV), tandis que le bloc « Bon pour
    // accord » a débordé sur la page 3 (échéancier plus long). La croix doit
    // suivre la page 2 du repère, jamais la page 3 de la signature.
    const signaturePage = page3; // ce que `page` vaut dans applySignatureToPdf
    const resolved = resolveAnchorPage(pdfDocument, 2, signaturePage);

    assert.equal(resolved, page2, 'doit résoudre la page du repère (2), pas celle de la signature (3)');
    assert.notEqual(resolved, page3);

    // Repère et signature sur la MÊME page : comportement inchangé.
    assert.equal(resolveAnchorPage(pdfDocument, 3, signaturePage), page3);
    assert.equal(resolveAnchorPage(pdfDocument, 1, signaturePage), page1);
  }
);

await run(
  'resolveAnchorPage retombe sur la page de secours si le numéro est invalide',
  async () => {
    const pdfDocument = await PDFDocument.create();
    const page1 = pdfDocument.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
    const fallback = pdfDocument.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);

    // Ancien repère sans pageNumber (champ ajouté après coup), NaN, hors bornes.
    assert.equal(resolveAnchorPage(pdfDocument, undefined, fallback), fallback);
    assert.equal(resolveAnchorPage(pdfDocument, NaN, fallback), fallback);
    assert.equal(resolveAnchorPage(pdfDocument, 0, fallback), fallback);
    assert.equal(resolveAnchorPage(pdfDocument, -1, fallback), fallback);
    assert.equal(resolveAnchorPage(pdfDocument, 99, fallback), fallback);
    // Valeur valide : résout normalement (page 1), pas de faux repli.
    assert.equal(resolveAnchorPage(pdfDocument, 1, fallback), page1);
  }
);

await run(
  "la croix reste dans les bornes de SA page même si celle-ci a un format différent",
  async () => {
    // Une page de CGV en fin de devis peut avoir une hauteur différente
    // (repli lors d'une fusion multi-variantes) : la conversion doit utiliser
    // la hauteur de la page CIBLE, jamais celle de la page de signature.
    const pdfDocument = await PDFDocument.create();
    const signaturePage = pdfDocument.addPage([210 * MM_TO_PT, 400 * MM_TO_PT]); // page 1, très haute
    const checkboxPageRaw = pdfDocument.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]); // page 2, A4 standard

    const resolved = resolveAnchorPage(pdfDocument, 2, signaturePage);
    assert.equal(resolved, checkboxPageRaw);

    const box = { x: 21.6, y: 12, width: 3.8 }; // repère proche du bord droit A4 (largeur 210mm)
    const segments = buildCheckmarkSegments(resolved.getHeight(), box);

    // Les deux segments doivent tomber dans le rectangle de la page A4 (2970
    // pt de haut), pas dans celui de la page de signature (400mm ≈ 1134pt).
    const a4HeightPt = 297 * MM_TO_PT;
    segments.forEach((segment) => {
      [segment.start.y, segment.end.y].forEach((y) => {
        assert.ok(y >= 0 && y <= a4HeightPt, `Y=${y} doit rester dans la page A4 (0..${a4HeightPt})`);
      });
    });
  }
);

console.log('Tous les tests des repères de signature PDF ont reussi.');
