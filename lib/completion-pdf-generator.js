/**
 * completion-pdf-generator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Générateur du PDF du bon de fin de chantier (PV de réception des travaux,
 * art. 1792-6 du Code civil), référencé au devis d'origine.
 *
 * Volontairement un module SÉPARÉ de lib/pdf-generator.js plutôt qu'une
 * extension de ce fichier : pdf-generator.js est le moteur du devis
 * (119 Ko, pagination complexe pilotée par le tableau de prestations,
 * composites, échéancier…), un document au cœur du chiffre d'affaires. Le
 * bon de fin de chantier est un document plus simple, à cycle de vie séparé
 * (généré après signature, pas avant) : le coupler au moteur devis aurait
 * fait peser un risque de régression sur ce dernier pour un gain de
 * factorisation marginal. Les constantes partagées (identité SARANGE,
 * palette) sont donc dupliquées ICI À L'IDENTIQUE plutôt qu'importées.
 *
 * Comme le devis, la position du bloc de signature est capturée PENDANT le
 * rendu (elle dépend du nombre de réserves, donc de la hauteur du document)
 * et exposée en retour pour l'overlay pdf-lib (lib/completion-signature-
 * service.js), via le même module générique lib/pdf-signature-anchors.mjs.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { jsPDF } from 'jspdf';

// Textes juridiques et lignes de règlement du document : centralisés dans le
// module pur lib/completion-certificate.mjs (partagés avec les tests — ce
// fichier-ci n'est pas importable par le runner Node, faute de champ "type"
// module dans package.json). Seules les constantes VISUELLES restent
// dupliquées ici (voir note ci-dessus).
import {
  buildCompletionBalanceDisplay,
  getDocTypeTexts,
  getReceptionReservesPaymentText,
} from './completion-certificate.mjs';

// Logo « Fabrication française / Qualibat RGE » du pied de page, lu depuis
// public/ UNIQUEMENT côté serveur (le bon est généré dans les routes API).
// Chemin en segments LITTÉRAUX pour que le traçage de fichiers de Next
// embarque bien le PNG dans le bundle serverless. Best-effort : sans le
// fichier, le footer sort simplement sans logo.
let footerLogoDataUrlPromise = null;
const getFooterLogoDataUrl = async () => {
  if (typeof window !== 'undefined') return null;
  if (!footerLogoDataUrlPromise) {
    footerLogoDataUrlPromise = (async () => {
      try {
        const { readFile } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const buffer = await readFile(join(process.cwd(), 'public', 'logorgemadeinfrance.png'));
        return `data:image/png;base64,${buffer.toString('base64')}`;
      } catch {
        return null;
      }
    })();
  }
  return footerLogoDataUrlPromise;
};

const COMPANY = {
  name: 'SARANGE',
  tagline: 'Fabrication et pose de menuiseries sur mesure',
  rge: 'N° RGE : E163143',
  address1: '5 rue Gaspard Monge',
  address2: '77380 Combs-la-Ville',
  phone: '09 86 71 34 44',
  email: 'contact@sarange.fr',
  website: 'sarange.fr',
  siret: '82000101400035',
  capital: '30 000,00 €',
  tva: 'FR22820001014',
  insurance: 'BPCE IARD n° 194388251 R 002',
  rib: 'FR76 1010 7002 2500 0170 5433 705',
};

// Wordmark « SARANGE. » : le point orange fait partie de l'identité (voir
// LOGO_NEGATIVE_SVG dans lib/assets.js) — reproduit typographiquement, le
// rendu serveur n'ayant pas de canvas pour rasteriser le SVG.
const drawWordmark = (doc, fontFamily, x, y, fontSize) => {
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(fontSize);
  doc.setTextColor(...COLORS.white);
  drawText(doc, COMPANY.name, x, y);
  const nameWidth = doc.getTextWidth(COMPANY.name);
  doc.setTextColor(...COLORS.brand);
  drawText(doc, '.', x + nameWidth + 0.4, y);
};

const COLORS = {
  brand: [249, 115, 22],
  brandSoft: [255, 237, 213],
  slate950: [2, 6, 23],
  slate900: [15, 23, 42],
  slate700: [51, 65, 85],
  slate500: [100, 116, 139],
  slate300: [203, 213, 225],
  slate200: [226, 232, 240],
  slate100: [241, 245, 249],
  slate50: [248, 250, 252],
  white: [255, 255, 255],
  amberSoft: [255, 247, 237],
  amberBorder: [253, 186, 116],
};

const PAGE_MARGIN = 16;

const PDF_SAFE_REPLACEMENTS = [
  [/’/g, "'"],
  [/[–—]/g, '-'],
  [/…/g, '...'],
];

const sanitizePdfText = (value) => {
  if (value === null || value === undefined) return '';
  let next = String(value);
  PDF_SAFE_REPLACEMENTS.forEach(([pattern, replacement]) => {
    next = next.replace(pattern, replacement);
  });
  return next
    .replace(/[^\x20-\xFF€\n]/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ ]{2,}/g, ' ')
    .trimEnd();
};

const drawText = (doc, value, x, y, options) => {
  doc.text(sanitizePdfText(value), x, y, options);
};

const getPreferredFont = () => 'helvetica';

const drawCard = (doc, { x, y, width, height, fillColor, borderColor, radius = 4 }) => {
  doc.setFillColor(...fillColor);
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, width, height, radius, radius, 'FD');
};

// Titre de section : pastille orange + libellé, même langage visuel que les
// titres de cartes du devis.
const drawSectionTitle = (doc, label, y, fontFamily) => {
  doc.setFillColor(...COLORS.brand);
  doc.rect(PAGE_MARGIN, y - 2.6, 1.4, 3.4, 'F');
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.slate500);
  drawText(doc, label, PAGE_MARGIN + 3.4, y);
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);

const formatDate = (date) =>
  new Intl.DateTimeFormat('fr-FR').format(date instanceof Date ? date : new Date(date));

/**
 * Ajoute une page si la position verticale `cursorY` dépasse la limite basse
 * utilisable, et renvoie le curseur (inchangé ou remis en haut de la nouvelle
 * page). Pas d'en-tête répété sur les pages suivantes (document court par
 * nature : quelques ouvrages au maximum) — à revoir si l'usage réel montre
 * des bons de plus de 2 pages.
 */
const ensureSpace = (doc, cursorY, neededHeight, pageWidth, pageHeight) => {
  // Limite basse : marge de page + zone réservée au footer (ligne à
  // pageHeight-18), pour que le contenu ne chevauche jamais le pied de page.
  const bottomLimit = pageHeight - PAGE_MARGIN - 8;
  if (cursorY + neededHeight <= bottomLimit) {
    return cursorY;
  }
  doc.addPage();
  return PAGE_MARGIN + 6;
};

const drawHeader = (doc, { pageWidth, fontFamily, title, subtitle, badgeLabel, badgeValue, completionNumber }) => {
  doc.setFillColor(...COLORS.slate950);
  doc.rect(0, 0, pageWidth, 34, 'F');
  doc.setFillColor(...COLORS.brand);
  doc.rect(0, 0, 5, 34, 'F');

  drawWordmark(doc, fontFamily, PAGE_MARGIN, 16.5, 23);

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.slate300);
  drawText(doc, COMPANY.tagline, PAGE_MARGIN, 22.3);

  doc.setFontSize(8);
  doc.setTextColor(...COLORS.white);
  [COMPANY.rge, COMPANY.address1, COMPANY.address2, `Tel : ${COMPANY.phone}`, COMPANY.email].forEach(
    (line, index) => {
      drawText(doc, line, pageWidth - PAGE_MARGIN, 11 + index * 4.1, { align: 'right' });
    }
  );

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...COLORS.brand);
  drawText(doc, title, PAGE_MARGIN, 45);

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9.6);
  doc.setTextColor(...COLORS.slate500);
  drawText(doc, subtitle, PAGE_MARGIN, 50.6);

  drawCard(doc, {
    x: pageWidth - PAGE_MARGIN - 56,
    y: 37,
    width: 56,
    height: 14,
    fillColor: COLORS.brandSoft,
    borderColor: COLORS.amberBorder,
    radius: 4,
  });
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.4);
  doc.setTextColor(...COLORS.brand);
  drawText(doc, badgeValue, pageWidth - PAGE_MARGIN - 28, 43.6, { align: 'center' });
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.brand);
  drawText(doc, badgeLabel, pageWidth - PAGE_MARGIN - 28, 48.3, { align: 'center' });

  // N° de bon sous le badge : visible dès l'en-tête, même quand le badge
  // affiche la référence facture (le badge bascule déjà sur le n° de bon
  // quand aucune référence facture n'existe — pas de doublon dans ce cas).
  if (completionNumber && badgeValue !== completionNumber) {
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLORS.slate500);
    drawText(doc, `Bon n° ${completionNumber}`, pageWidth - PAGE_MARGIN - 28, 55, { align: 'center' });
  }

  return 60;
};

// Bandeau de rappel sur les pages de CONTINUATION (2..n) : même identité que
// la page 1 en version compacte, avec le n° de bon toujours visible. Dessiné
// en post-passe une fois le nombre de pages connu.
const drawContinuationHeaders = (doc, { pageWidth, fontFamily, completionNumber, docLabel = 'Bon de fin de chantier' }) => {
  const pageCount = doc.internal.getNumberOfPages();
  for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setFillColor(...COLORS.slate950);
    doc.rect(0, 0, pageWidth, 12, 'F');
    doc.setFillColor(...COLORS.brand);
    doc.rect(0, 0, 5, 12, 'F');

    drawWordmark(doc, fontFamily, PAGE_MARGIN, 7.8, 11);

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.slate300);
    drawText(
      doc,
      `${docLabel}${completionNumber ? ` — n° ${completionNumber}` : ''}`,
      pageWidth - PAGE_MARGIN,
      7.8,
      { align: 'right' }
    );
  }
};

// Filtre les lignes sans valeur AVANT tout calcul de hauteur : jamais de
// "-" ou de placeholder vide affiché, la carte se redimensionne simplement
// autour de ce qui est réellement renseigné. Label et valeur sur la MÊME
// ligne (libellé gris à gauche, valeur en gras), comme la carte
// « RÉFÉRENCES DEVIS » du devis.
const drawInfoCards = (doc, { pageWidth, fontFamily, cursorY, references, clientLines }) => {
  const filteredReferences = references.filter(([, value]) => Boolean(value));
  const filteredClientLines = clientLines.filter(([, value]) => Boolean(value));
  const cardWidth = (pageWidth - PAGE_MARGIN * 2 - 10) / 2;
  const labelColumnWidth = 24;
  const rowGap = 5.4;

  // Hauteur par carte : la colonne valeur peut replier sur plusieurs lignes
  // (adresse longue) — on mesure AVANT de dessiner.
  const measureRows = (rows) =>
    rows.map(([label, value]) => {
      doc.setFontSize(8.4);
      const lines = doc.splitTextToSize(sanitizePdfText(String(value)), cardWidth - labelColumnWidth - 8);
      return { label, lines, height: Math.max(1, lines.length) * 3.9 + (rowGap - 3.9) };
    });

  const referenceRows = measureRows(filteredReferences);
  const clientRows = measureRows(filteredClientLines);
  const contentHeight = (rows) => rows.reduce((sum, row) => sum + row.height, 0);
  const cardHeight = 13 + Math.max(contentHeight(referenceRows), contentHeight(clientRows), rowGap) + 2;

  const drawOneCard = (x, title, rows) => {
    drawCard(doc, {
      x,
      y: cursorY,
      width: cardWidth,
      height: cardHeight,
      fillColor: COLORS.white,
      borderColor: COLORS.slate200,
      radius: 5,
    });
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.slate500);
    drawText(doc, title.toUpperCase(), x + 4, cursorY + 7);

    let rowY = cursorY + 13;
    rows.forEach((row) => {
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(7.7);
      doc.setTextColor(...COLORS.slate500);
      drawText(doc, row.label, x + 4, rowY);

      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(8.4);
      doc.setTextColor(...COLORS.slate900);
      let lineY = rowY;
      row.lines.forEach((line) => {
        drawText(doc, line, x + 4 + labelColumnWidth, lineY);
        lineY += 3.9;
      });
      rowY += row.height;
    });
  };

  drawOneCard(PAGE_MARGIN, 'Références', referenceRows);
  drawOneCard(PAGE_MARGIN + cardWidth + 10, 'Client et chantier', clientRows);

  return cursorY + cardHeight + 8;
};

const drawWorksTable = (doc, { pageWidth, pageHeight, fontFamily, cursorY, ouvrages, texts }) => {
  let y = cursorY;
  drawSectionTitle(doc, texts.worksTitle, y, fontFamily);
  y += 6;

  const tableWidth = pageWidth - PAGE_MARGIN * 2;
  const colDesig = tableWidth * 0.6;
  const colRepere = tableWidth * 0.28;
  const colQte = tableWidth * 0.12;

  const headerHeight = 7;
  y = ensureSpace(doc, y, headerHeight, pageWidth, pageHeight);
  doc.setFillColor(...COLORS.slate900);
  doc.rect(PAGE_MARGIN, y, tableWidth, headerHeight, 'F');
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.white);
  drawText(doc, 'Désignation', PAGE_MARGIN + 3, y + 4.8);
  drawText(doc, 'Repère', PAGE_MARGIN + colDesig + 3, y + 4.8);
  drawText(doc, 'Qté', PAGE_MARGIN + colDesig + colRepere + colQte - 3, y + 4.8, { align: 'right' });
  y += headerHeight;

  ouvrages.forEach((item, index) => {
    const designationLines = doc.splitTextToSize(sanitizePdfText(item.designation || ''), colDesig - 6);
    const subText = item.sub || item.dimensions || '';
    const subLines = subText ? doc.splitTextToSize(sanitizePdfText(subText), colDesig - 6) : [];
    const rowHeight = 4.2 * designationLines.length + 3.6 * subLines.length + 5;

    y = ensureSpace(doc, y, rowHeight, pageWidth, pageHeight);

    if (index % 2 === 1) {
      doc.setFillColor(...COLORS.slate50);
      doc.rect(PAGE_MARGIN, y, tableWidth, rowHeight, 'F');
    }

    let textY = y + 5;
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.slate900);
    designationLines.forEach((line) => {
      drawText(doc, line, PAGE_MARGIN + 3, textY);
      textY += 4.2;
    });
    if (subLines.length) {
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(7.6);
      doc.setTextColor(...COLORS.slate500);
      subLines.forEach((line) => {
        drawText(doc, line, PAGE_MARGIN + 3, textY);
        textY += 3.6;
      });
    }

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.slate700);
    if (item.repere) drawText(doc, item.repere, PAGE_MARGIN + colDesig + 3, y + 5);
    drawText(doc, String(item.qte ?? 1), PAGE_MARGIN + colDesig + colRepere + colQte - 3, y + 5, {
      align: 'right',
    });

    doc.setDrawColor(...COLORS.slate200);
    doc.setLineWidth(0.2);
    doc.line(PAGE_MARGIN, y + rowHeight, PAGE_MARGIN + tableWidth, y + rowHeight);

    y += rowHeight;
  });

  return y + 6;
};

const drawReceptionSection = (
  doc,
  { pageWidth, pageHeight, fontFamily, cursorY, hasReserves, reserves, reserveLiftDelayDays, retentionEligible, hasKnownBalance, texts }
) => {
  let y = cursorY;
  drawSectionTitle(doc, texts.sectionTitle, y, fontFamily);
  y += 6;

  const boxWidth = pageWidth - PAGE_MARGIN * 2;
  const leadLines = doc.splitTextToSize(sanitizePdfText(texts.lead), boxWidth - 8);

  const reserveLines = hasReserves
    ? reserves.flatMap((reserve, index) =>
        doc.splitTextToSize(
          sanitizePdfText(`${index + 1}. ${reserve.description} (délai de levée convenu : ${reserve.delaiJours || reserveLiftDelayDays} jours)`),
          boxWidth - 12
        )
      )
    : [];

  const boxHeight = 6 + leadLines.length * 4 + 6 + (hasReserves ? reserveLines.length * 4 + 6 : 4);
  y = ensureSpace(doc, y, boxHeight + 4, pageWidth, pageHeight);

  drawCard(doc, {
    x: PAGE_MARGIN,
    y,
    width: boxWidth,
    height: boxHeight,
    fillColor: COLORS.white,
    borderColor: COLORS.slate200,
    radius: 5,
  });

  let textY = y + 6;
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.slate700);
  leadLines.forEach((line) => {
    drawText(doc, line, PAGE_MARGIN + 4, textY);
    textY += 4;
  });
  textY += 2;

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.slate900);
  drawText(doc, hasReserves ? texts.withReserves : texts.withoutReserves, PAGE_MARGIN + 4, textY);
  textY += 5;

  if (hasReserves) {
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.slate700);
    reserveLines.forEach((line) => {
      drawText(doc, line, PAGE_MARGIN + 6, textY);
      textY += 4;
    });
  }

  y += boxHeight + 6;

  // Garanties et effets : LISTE À PUCES ORANGES dans une carte blanche, même
  // langage que les cartes « Conditions de règlement » / « Garanties » du
  // devis. Contenu selon le type de document (travaux vs produits).
  const bullets = [...texts.guarantees];
  // Le détail des échéances ne prend sens que si un montant de devis est
  // effectivement connu (flux lié à un devis) : la variante générale n'a pas
  // de total à référencer, ces phrases n'y apparaissent donc jamais.
  if (hasReserves && hasKnownBalance) {
    bullets.push(getReceptionReservesPaymentText(retentionEligible));
  }

  const bulletTextWidth = boxWidth - 14;
  const bulletBlocks = bullets.map((text) => doc.splitTextToSize(sanitizePdfText(text), bulletTextWidth));
  const bulletsHeight = bulletBlocks.reduce((sum, lines) => sum + lines.length * 3.9 + 2.2, 0);
  const guaranteeBoxHeight = 12 + bulletsHeight + 2;
  y = ensureSpace(doc, y, guaranteeBoxHeight + 4, pageWidth, pageHeight);

  drawCard(doc, {
    x: PAGE_MARGIN,
    y,
    width: boxWidth,
    height: guaranteeBoxHeight,
    fillColor: COLORS.white,
    borderColor: COLORS.slate200,
    radius: 5,
  });
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.slate500);
  drawText(doc, texts.guaranteesTitle, PAGE_MARGIN + 4, y + 7);

  let bulletY = y + 13;
  bulletBlocks.forEach((lines) => {
    doc.setFillColor(...COLORS.brand);
    doc.circle(PAGE_MARGIN + 5.4, bulletY - 1.1, 0.7, 'F');
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...COLORS.slate700);
    lines.forEach((line) => {
      drawText(doc, line, PAGE_MARGIN + 8.5, bulletY);
      bulletY += 3.9;
    });
    bulletY += 2.2;
  });

  return y + guaranteeBoxHeight + 6;
};

const drawBalanceSection = (doc, { pageWidth, pageHeight, fontFamily, cursorY, balance, hasReserves, invoiceReference, quoteNumber, texts }) => {
  let y = cursorY;
  const boxWidth = pageWidth - PAGE_MARGIN * 2;

  // « Garder avec le suivant » : le solde et le bloc signature forment un
  // ensemble visuel — si les deux ne tiennent pas sur la page en cours, ils
  // passent ENSEMBLE sur la suivante (jamais une signature isolée en haut
  // d'une page vide).
  const SIGNATURE_BLOCK_HEIGHT = 46;

  // Aucun montant connu (variante générale, sans devis lié) : jamais de
  // 0,00 € affiché ni de RIB pour un solde qui n'existe pas dans l'outil,
  // juste une mention de principe.
  if (!(Number(balance?.totalDevisTTC) > 0)) {
    y = ensureSpace(doc, y, 12 + SIGNATURE_BLOCK_HEIGHT, pageWidth, pageHeight);
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.slate500);
    drawText(doc, 'Le solde du devis est dû dès la signature du présent bon.', PAGE_MARGIN, y + 5);
    return y + 12;
  }

  // Lignes, libellé de bande et note d'exigibilité : données pures calculées
  // dans lib/completion-certificate.mjs (testées telles quelles) — ce bloc ne
  // fait que les dessiner.
  const display = buildCompletionBalanceDisplay({ balance, hasReserves, soldeLabel: texts.soldeLabel });
  const rows = display.rows.map(({ label, amount, isDeduction }) => [
    label,
    `${isDeduction ? '- ' : ''}${formatCurrency(amount)}`,
  ]);
  const totalLabel = display.totalLabel;
  const noteHeight = display.note ? 5 : 0;

  // Hauteur = titre 13 + lignes 6 chacune + bande orange 11 + note éventuelle
  // + bloc RIB 20 + marge : le texte ne doit JAMAIS déborder sous la bordure
  // de la carte.
  const boxHeight = 13 + rows.length * 6 + 3 + 11 + noteHeight + 4 + 20;
  y = ensureSpace(doc, y, boxHeight + 8 + SIGNATURE_BLOCK_HEIGHT, pageWidth, pageHeight);

  drawCard(doc, {
    x: PAGE_MARGIN,
    y,
    width: boxWidth,
    height: boxHeight,
    fillColor: COLORS.white,
    borderColor: COLORS.slate200,
    radius: 5,
  });

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.slate500);
  drawText(doc, 'SOLDE À RÉGLER', PAGE_MARGIN + 4, y + 7);

  let rowY = y + 13;
  rows.forEach(([label, value]) => {
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.6);
    doc.setTextColor(...COLORS.slate700);
    drawText(doc, label, PAGE_MARGIN + 4, rowY);
    drawText(doc, value, PAGE_MARGIN + boxWidth - 4, rowY, { align: 'right' });
    rowY += 6;
  });

  // Bande orange pleine largeur, même langage que « MONTANT TTC » sur la
  // synthèse du devis : libellé blanc à gauche, montant blanc en gras à droite.
  rowY += 1;
  doc.setFillColor(...COLORS.brand);
  doc.roundedRect(PAGE_MARGIN + 4, rowY - 4.5, boxWidth - 8, 11, 2, 2, 'F');
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.white);
  drawText(doc, totalLabel, PAGE_MARGIN + 8, rowY + 2);
  doc.setFontSize(11.5);
  drawText(doc, formatCurrency(display.totalAmount), PAGE_MARGIN + boxWidth - 8, rowY + 2, { align: 'right' });
  rowY += 11;

  // Note d'exigibilité de l'échéance finale, directement sous le calcul.
  if (display.note) {
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.slate500);
    drawText(doc, display.note, PAGE_MARGIN + 4, rowY + 3.5);
    rowY += noteHeight;
  }

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.slate500);
  drawText(doc, 'RÈGLEMENT PAR VIREMENT (RIB SARANGE)', PAGE_MARGIN + 4, rowY + 4);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.slate900);
  drawText(doc, COMPANY.rib, PAGE_MARGIN + 4, rowY + 9);
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.slate500);
  drawText(
    doc,
    `Merci d'indiquer la référence ${invoiceReference} en libellé du virement.`,
    PAGE_MARGIN + 4,
    rowY + 14
  );

  return y + boxHeight + 8;
};

/**
 * Bloc mention + signature. Le rectangle `signatureBox` (mm, repere
 * haut-gauche) est renvoyé tel quel dans `signatureAnchor` pour l'overlay
 * pdf-lib ulterieur (lib/completion-signature-service.js), avec son propre
 * numero de page — voir lib/pdf-signature-anchors.mjs.
 */
const drawSignatureSection = (doc, { pageWidth, pageHeight, fontFamily, cursorY, hasReserves, issueDateLabel, lieu, mentionText }) => {
  const blockHeight = 48;
  const y = ensureSpace(doc, cursorY, blockHeight, pageWidth, pageHeight);
  const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;

  drawSectionTitle(doc, 'SIGNATURE', y, fontFamily);

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.slate700);
  drawText(doc, `Fait à ${lieu || 'Combs-la-Ville'}, le ${issueDateLabel}, en deux exemplaires.`, PAGE_MARGIN, y + 8);
  drawText(doc, 'Mention enregistrée lors de la signature électronique :', PAGE_MARGIN, y + 13.5);
  doc.setFont(fontFamily, 'bold');
  drawText(
    doc,
    mentionText ||
      `Bon pour réception des travaux, ${hasReserves ? 'avec les réserves ci-dessus' : 'sans réserve'}`,
    PAGE_MARGIN,
    y + 18.5
  );

  const signatureBox = {
    x: pageWidth - PAGE_MARGIN - 64,
    y: y + 4,
    width: 64,
    height: 30,
    padding: 4,
  };

  // Zone de signature ENCADRÉE (carte claire), pas une simple ligne : la
  // signature tamponnée par pdf-lib atterrit dans un cadre net.
  drawCard(doc, {
    x: signatureBox.x,
    y: signatureBox.y,
    width: signatureBox.width,
    height: signatureBox.height,
    fillColor: COLORS.slate50,
    borderColor: COLORS.slate200,
    radius: 4,
  });
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...COLORS.slate500);
  drawText(doc, 'SIGNATURE DU CLIENT', signatureBox.x + signatureBox.width / 2, signatureBox.y + 4.6, {
    align: 'center',
  });

  return {
    cursorY: y + blockHeight,
    signatureAnchor: { pageNumber, signatureBox },
  };
};

// Footer sur TOUTES les pages, REPRIS À L'IDENTIQUE du devis (drawFooter
// dans lib/pdf-generator.js) : trois lignes d'identité à gauche, logo
// Fabrication française / Qualibat RGE, numérotation à droite.
const FOOTER_LOGO_RATIO = 1487 / 618;

const drawFooterOnAllPages = (doc, { pageWidth, pageHeight, fontFamily, footerLogoDataUrl }) => {
  const pageCount = doc.internal.getNumberOfPages();

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setDrawColor(...COLORS.slate200);
    doc.setLineWidth(0.2);
    doc.line(PAGE_MARGIN, pageHeight - 17, pageWidth - PAGE_MARGIN, pageHeight - 17);

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...COLORS.slate500);
    drawText(doc, `SARANGE : ${COMPANY.address1} ${COMPANY.address2}`, PAGE_MARGIN, pageHeight - 12.4);
    drawText(
      doc,
      `SIRET : ${COMPANY.siret} - CAPITAL : ${COMPANY.capital} - N° TVA Intracommunautaire : ${COMPANY.tva}`,
      PAGE_MARGIN,
      pageHeight - 8.5
    );
    drawText(
      doc,
      `Tel fixe : ${COMPANY.phone} - Mail : ${COMPANY.email} - Site : ${COMPANY.website}`,
      PAGE_MARGIN,
      pageHeight - 4.6
    );

    if (footerLogoDataUrl) {
      const footerMaxHeight = 13.0;
      const footerMaxWidth = 50;
      let imgH = footerMaxHeight;
      let imgW = imgH * FOOTER_LOGO_RATIO;
      if (imgW > footerMaxWidth) {
        imgW = footerMaxWidth;
        imgH = imgW / FOOTER_LOGO_RATIO;
      }
      const imgX = pageWidth - PAGE_MARGIN - imgW - 35;
      const imgY = pageHeight - 8.5 - imgH / 2;
      // Alias fixe : l'image n'est embarquée QU'UNE fois dans le PDF même
      // répétée sur chaque page ; 'FAST' compresse le bitmap (sans quoi
      // jsPDF le stocke décompressé : ~2,7 Mo pour ce logo).
      doc.addImage(footerLogoDataUrl, 'PNG', imgX, imgY, imgW, imgH, 'sarange-footer-logo', 'FAST');
    }

    drawText(doc, `Page ${pageNumber}/${pageCount}`, pageWidth - PAGE_MARGIN, pageHeight - 12.4, {
      align: 'right',
    });
  }
};

/**
 * @param {object} params
 * @param {string} params.quoteNumber          Numero du devis d'origine (DV-...)
 * @param {string} params.invoiceReference      Reference facture saisie manuellement
 * @param {object} params.clientData            { nom, adresseChantier, codePostalChantier, villeChantier }
 * @param {Array}  params.ouvrages              [{ designation, sub, repere, qte }]
 * @param {boolean} params.hasReserves
 * @param {Array}  params.reserves              [{ description, delaiJours }]
 * @param {number} params.reserveLiftDelayDays
 * @param {object} params.balance               computeCompletionBalance(...) result
 * @param {boolean} params.retentionEligible
 * @param {string} params.completionNumber
 * @param {Date}   params.issueDate
 */
export const buildCompletionPdfDocument = async ({
  docType = 'reception',
  quoteNumber = '',
  invoiceReference = '',
  clientData = {},
  ouvrages = [],
  hasReserves = false,
  reserves = [],
  reserveLiftDelayDays = 30,
  balance = { totalDevisTTC: 0, acompteRecu: 0, soldeAPercevoir: 0, retenueGarantie: 0 },
  retentionEligible = false,
  completionNumber = '',
  issueDate = new Date(),
} = {}) => {
  const footerLogoDataUrl = await getFooterLogoDataUrl();
  const texts = getDocTypeTexts(docType);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const fontFamily = getPreferredFont();
  const issueDateLabel = formatDate(issueDate);
  const hasKnownBalance = Number(balance?.totalDevisTTC) > 0;

  let cursorY = drawHeader(doc, {
    pageWidth,
    fontFamily,
    title: texts.title,
    subtitle: texts.subtitle,
    // Repli sur le numéro du bon lui-même quand aucune référence facture n'a
    // été saisie (variante générale) : jamais de "(à renseigner)" affiché.
    badgeLabel: invoiceReference ? 'Réf. facture' : 'N° document',
    badgeValue: invoiceReference || completionNumber,
    completionNumber,
  });

  const lieu = clientData?.villeChantier || clientData?.ville || '';
  const adresseChantier = [clientData?.adresseChantier, clientData?.codePostalChantier, clientData?.villeChantier]
    .filter(Boolean)
    .join(', ');

  cursorY = drawInfoCards(doc, {
    pageWidth,
    fontFamily,
    cursorY,
    references: [
      ['N° de bon', completionNumber],
      ["Devis d'origine", quoteNumber],
      [texts.dateLabel, issueDateLabel],
      ['Lieu', lieu],
    ],
    clientLines: [
      ['Client', clientData?.nom || ''],
      ['Adresse', adresseChantier],
    ],
  });

  cursorY = drawWorksTable(doc, { pageWidth, pageHeight, fontFamily, cursorY, ouvrages, texts });

  cursorY = drawReceptionSection(doc, {
    pageWidth,
    pageHeight,
    fontFamily,
    cursorY,
    hasReserves,
    reserves,
    reserveLiftDelayDays,
    retentionEligible,
    hasKnownBalance,
    texts,
  });

  cursorY = drawBalanceSection(doc, {
    pageWidth,
    pageHeight,
    fontFamily,
    cursorY,
    balance,
    hasReserves,
    invoiceReference,
    quoteNumber,
    texts,
  });

  const { cursorY: finalY, signatureAnchor } = drawSignatureSection(doc, {
    pageWidth,
    pageHeight,
    fontFamily,
    cursorY,
    hasReserves,
    issueDateLabel,
    lieu,
    mentionText: texts.mention(hasReserves),
  });

  drawContinuationHeaders(doc, {
    pageWidth,
    fontFamily,
    completionNumber,
    docLabel: texts.title.charAt(0) + texts.title.slice(1).toLowerCase(),
  });
  drawFooterOnAllPages(doc, { pageWidth, pageHeight, fontFamily, footerLogoDataUrl });
  void finalY;

  const blob = doc.output('blob');
  const filename = `${completionNumber || 'bon-fin-chantier'}.pdf`;

  return {
    doc,
    blob,
    arrayBuffer: doc.output('arraybuffer'),
    filename,
    completionNumber,
    issueDate,
    signatureAnchor,
  };
};

/**
 * PV DE LEVÉE DES RÉSERVES : document court signé après correction des
 * réserves du bon d'origine. Clôt la garantie de parfait achèvement sur ces
 * points et rend exigible l'éventuelle échéance finale de 5 % prévue au
 * devis (art. 4.5 des CGV).
 */
export const buildReservesLiftPdfDocument = async ({
  liftNumber = '',
  completionNumber = '',
  quoteNumber = '',
  clientData = {},
  reserves = [],
  retentionWasApplied = false,
  // Montant restant à percevoir à la levée (échéance finale de 5 %,
  // reliquat...), saisi/confirmé par l'utilisateur dans la modale d'envoi.
  // 0 → aucun bloc de règlement sur le document.
  amountDue = 0,
  paymentReference = '',
  issueDate = new Date(),
} = {}) => {
  const footerLogoDataUrl = await getFooterLogoDataUrl();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const fontFamily = getPreferredFont();
  const issueDateLabel = formatDate(issueDate);

  let cursorY = drawHeader(doc, {
    pageWidth,
    fontFamily,
    title: 'PV DE LEVÉE DES RÉSERVES',
    subtitle: 'Constat contradictoire de levée des réserves (article 1792-6 du Code civil)',
    badgeLabel: 'N° document',
    badgeValue: liftNumber,
    completionNumber: '',
  });

  const lieu = clientData?.villeChantier || clientData?.ville || '';
  const adresseChantier = [clientData?.adresseChantier, clientData?.codePostalChantier, clientData?.villeChantier]
    .filter(Boolean)
    .join(', ');

  cursorY = drawInfoCards(doc, {
    pageWidth,
    fontFamily,
    cursorY,
    references: [
      ["Bon d'origine", completionNumber],
      ["Devis d'origine", quoteNumber],
      ['Levée le', issueDateLabel],
      ['Lieu', lieu],
    ],
    clientLines: [
      ['Client', clientData?.nom || ''],
      ['Adresse', adresseChantier],
    ],
  });

  drawSectionTitle(doc, 'RÉSERVES LEVÉES', cursorY, fontFamily);
  cursorY += 6;

  const boxWidth = pageWidth - PAGE_MARGIN * 2;
  const leadLines = doc.splitTextToSize(
    sanitizePdfText(
      `Le client, maître d'ouvrage, constate contradictoirement que les réserves formulées lors de la réception des travaux (bon n° ${completionNumber}) ont été levées ce jour :`
    ),
    boxWidth - 8
  );
  const reserveLines = reserves.flatMap((reserve, index) =>
    doc.splitTextToSize(sanitizePdfText(`${index + 1}. ${reserve.description}`), boxWidth - 12)
  );
  const boxHeight = 6 + leadLines.length * 4 + 4 + reserveLines.length * 4 + 6;
  cursorY = ensureSpace(doc, cursorY, boxHeight + 4, pageWidth, pageHeight);

  drawCard(doc, {
    x: PAGE_MARGIN,
    y: cursorY,
    width: boxWidth,
    height: boxHeight,
    fillColor: COLORS.white,
    borderColor: COLORS.slate200,
    radius: 5,
  });

  let textY = cursorY + 6;
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.slate700);
  leadLines.forEach((line) => {
    drawText(doc, line, PAGE_MARGIN + 4, textY);
    textY += 4;
  });
  textY += 2;
  doc.setFontSize(8.5);
  reserveLines.forEach((line) => {
    drawText(doc, line, PAGE_MARGIN + 6, textY);
    textY += 4;
  });
  cursorY += boxHeight + 6;

  const legalLines = [
    'La garantie de parfait achèvement est purgée pour les points listés ci-dessus.',
    ...(retentionWasApplied
      ? ["L'échéance finale de 5 % prévue au devis (article 4.5 des CGV), non exigible à la réception,", 'devient exigible à compter de la présente levée des réserves.']
      : []),
    'Les autres garanties légales (bon fonctionnement, décennale) continuent de courir depuis la', 'date de réception initiale.',
  ];
  const legalBoxHeight = 8 + legalLines.length * 4;
  cursorY = ensureSpace(doc, cursorY, legalBoxHeight + 4, pageWidth, pageHeight);
  drawCard(doc, {
    x: PAGE_MARGIN,
    y: cursorY,
    width: boxWidth,
    height: legalBoxHeight,
    fillColor: COLORS.amberSoft,
    borderColor: COLORS.amberBorder,
    radius: 5,
  });
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...[124, 58, 16]);
  let legalY = cursorY + 6;
  legalLines.forEach((line) => {
    drawText(doc, line, PAGE_MARGIN + 4, legalY);
    legalY += 4;
  });
  cursorY += legalBoxHeight + 8;

  // Bloc de règlement : uniquement si un montant reste à percevoir à la
  // levée (échéance finale de 5 % devenue exigible, reliquat impayé...),
  // confirmé par l'utilisateur à l'envoi — jamais un calcul silencieux.
  if (Number(amountDue) > 0) {
    const payBoxHeight = 13 + 11 + 4 + 20;
    cursorY = ensureSpace(doc, cursorY, payBoxHeight + 8 + 48, pageWidth, pageHeight);
    drawCard(doc, {
      x: PAGE_MARGIN,
      y: cursorY,
      width: boxWidth,
      height: payBoxHeight,
      fillColor: COLORS.white,
      borderColor: COLORS.slate200,
      radius: 5,
    });
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.slate500);
    drawText(doc, 'SOLDE À RÉGLER', PAGE_MARGIN + 4, cursorY + 7);

    let payY = cursorY + 13;
    doc.setFillColor(...COLORS.brand);
    doc.roundedRect(PAGE_MARGIN + 4, payY - 4.5, boxWidth - 8, 11, 2, 2, 'F');
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.white);
    drawText(doc, 'SOLDE DÛ À LA LEVÉE', PAGE_MARGIN + 8, payY + 2);
    doc.setFontSize(11.5);
    drawText(doc, formatCurrency(amountDue), PAGE_MARGIN + boxWidth - 8, payY + 2, { align: 'right' });
    payY += 11;

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.slate500);
    drawText(doc, 'RÈGLEMENT PAR VIREMENT (RIB SARANGE)', PAGE_MARGIN + 4, payY + 4);
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLORS.slate900);
    drawText(doc, COMPANY.rib, PAGE_MARGIN + 4, payY + 9);
    if (paymentReference) {
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...COLORS.slate500);
      drawText(
        doc,
        `Merci d'indiquer la référence ${paymentReference} en libellé du virement.`,
        PAGE_MARGIN + 4,
        payY + 14
      );
    }
    cursorY += payBoxHeight + 8;
  }

  const { signatureAnchor } = drawSignatureSection(doc, {
    pageWidth,
    pageHeight,
    fontFamily,
    cursorY,
    hasReserves: false,
    issueDateLabel,
    lieu,
    mentionText: 'Bon pour levée des réserves',
  });

  drawContinuationHeaders(doc, {
    pageWidth,
    fontFamily,
    completionNumber: liftNumber,
    docLabel: 'PV de levée des réserves',
  });
  drawFooterOnAllPages(doc, { pageWidth, pageHeight, fontFamily, footerLogoDataUrl });

  const filename = `${liftNumber || 'pv-levee-reserves'}.pdf`;
  return {
    doc,
    arrayBuffer: doc.output('arraybuffer'),
    filename,
    liftNumber,
    issueDate,
    signatureAnchor,
  };
};
