/**
 * pdf-signature-anchors.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Conversion de coordonnées et résolution de page pour l'overlay de signature
 * (lib/quote-signature-service.js, `applySignatureToPdf`).
 *
 * pdf-generator.js (jsPDF) travaille en millimètres, origine en HAUT-GAUCHE,
 * Y croissant vers le BAS. pdf-lib travaille en points PDF, origine en
 * BAS-GAUCHE, Y croissant vers le HAUT. Toute coordonnée mémorisée pendant la
 * génération (mm, repère haut) doit passer par `toPdfPoints`/`topMmToPdfY`
 * avant d'être utilisée avec pdf-lib.
 *
 * Un devis répartit son contenu sur un nombre de pages VARIABLE selon sa
 * longueur (nombre de lignes, échéancier, CGV) : un repère (case à cocher,
 * tampon…) peut donc se trouver sur une page différente de la zone de
 * signature. Chaque repère porte son PROPRE numéro de page, capturé au
 * moment exact où il a été dessiné — `resolveAnchorPage` le respecte
 * toujours plutôt que de supposer la page de la signature.
 *
 * Module pur (aucun import interne au projet) : testable par le runner Node
 * avec pdf-lib seul.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const MM_TO_PT = 72 / 25.4;

export const toPdfPoints = (mm) => Number(mm || 0) * MM_TO_PT;

export const topMmToPdfY = (pageHeight, topMm) => pageHeight - toPdfPoints(topMm);

/**
 * Résout la page pdf-lib réellement associée à un repère. Retombe sur
 * `fallbackPage` si le numéro est absent, non numérique ou hors bornes
 * (anciens repères antérieurs à ce champ, ou données corrompues) — un défaut
 * d'annotation ne doit jamais empêcher la signature.
 *
 * @param {import('pdf-lib').PDFDocument} pdfDocument
 * @param {number} pageNumber  numéro de page 1-indexé mémorisé sur le repère
 * @param {import('pdf-lib').PDFPage} fallbackPage
 */
export const resolveAnchorPage = (pdfDocument, pageNumber, fallbackPage) => {
  const index = Number(pageNumber);
  if (Number.isFinite(index) && index >= 1 && index <= pdfDocument.getPageCount()) {
    return pdfDocument.getPage(index - 1);
  }
  return fallbackPage;
};

/**
 * Rectangle (mm, repère haut-gauche) → deux segments de croix en points PDF
 * (repère bas-gauche), relatifs à la page fournie. Pure conversion, aucun
 * dessin : l'appelant décide comment tracer les segments retournés.
 */
export const buildCheckmarkSegments = (pageHeight, box) => {
  const left = toPdfPoints(box?.x);
  const top = toPdfPoints(box?.y);
  const size = toPdfPoints(box?.width);
  const bottomY = pageHeight - (top + size);
  const topY = pageHeight - top;

  return [
    { start: { x: left, y: bottomY }, end: { x: left + size, y: topY } },
    { start: { x: left + size, y: bottomY }, end: { x: left, y: topY } },
  ];
};
