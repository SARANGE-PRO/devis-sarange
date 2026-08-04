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
  rib: 'FR76 1010 7002 2500 0170 5433 705',
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

const drawHeader = (doc, { pageWidth, fontFamily, title, subtitle, badgeLabel, badgeValue }) => {
  doc.setFillColor(...COLORS.slate950);
  doc.rect(0, 0, pageWidth, 34, 'F');
  doc.setFillColor(...COLORS.brand);
  doc.rect(0, 0, 5, 34, 'F');

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...COLORS.white);
  drawText(doc, COMPANY.name, PAGE_MARGIN, 16.5);

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

  return 60;
};

// Filtre les lignes sans valeur AVANT tout calcul de hauteur : jamais de
// "-" ou de placeholder vide affiché, la carte se redimensionne simplement
// autour de ce qui est réellement renseigné.
const drawInfoCards = (doc, { pageWidth, fontFamily, cursorY, references, clientLines }) => {
  const filteredReferences = references.filter(([, value]) => Boolean(value));
  const filteredClientLines = clientLines.filter(([, value]) => Boolean(value));
  const cardWidth = (pageWidth - PAGE_MARGIN * 2 - 10) / 2;
  const rowHeight = 6;
  const cardHeight = 12 + Math.max(filteredReferences.length, filteredClientLines.length, 1) * rowHeight;

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

    rows.forEach(([label, value], index) => {
      const rowY = cursorY + 12 + index * rowHeight;
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(7.7);
      doc.setTextColor(...COLORS.slate500);
      drawText(doc, label, x + 4, rowY);
      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(8.6);
      doc.setTextColor(...COLORS.slate900);
      drawText(doc, value, x + 4, rowY + 3.6);
    });
  };

  drawOneCard(PAGE_MARGIN, 'Références', filteredReferences);
  drawOneCard(PAGE_MARGIN + cardWidth + 10, 'Client et chantier', filteredClientLines);

  return cursorY + cardHeight + 8;
};

const drawWorksTable = (doc, { pageWidth, pageHeight, fontFamily, cursorY, ouvrages }) => {
  let y = cursorY;
  drawSectionTitle(doc, 'OUVRAGES RÉCEPTIONNÉS', y, fontFamily);
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
  { pageWidth, pageHeight, fontFamily, cursorY, hasReserves, reserves, reserveLiftDelayDays, retentionEligible, hasKnownBalance }
) => {
  let y = cursorY;
  drawSectionTitle(doc, 'RÉCEPTION DES TRAVAUX', y, fontFamily);
  y += 6;

  const boxWidth = pageWidth - PAGE_MARGIN * 2;
  const leadLines = doc.splitTextToSize(
    sanitizePdfText(
      "Le client, maître d'ouvrage, après visite contradictoire des ouvrages désignés ci-dessus et réalisés conformément au devis référencé ci-dessus, prononce ce jour la réception des travaux."
    ),
    boxWidth - 8
  );

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
  drawText(doc, hasReserves ? 'Réception AVEC réserves :' : 'Réception SANS réserve.', PAGE_MARGIN + 4, textY);
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

  // Encart légal : garanties + (le cas échéant) retenue de garantie.
  const legalLines = [
    'Effets de la réception. À compter de la date ci-dessus commencent à courir la garantie de',
    "parfait achèvement (1 an), la garantie de bon fonctionnement des éléments d'équipement",
    'dissociables (2 ans) et la garantie décennale (10 ans).',
  ];
  // Le détail retenue/solde ne prend sens que si un montant de devis est
  // effectivement connu (flux lié à un devis) : la variante générale n'a pas
  // de total à référencer, ces phrases n'y apparaissent donc jamais.
  if (hasReserves && hasKnownBalance) {
    legalLines.push(
      retentionEligible
        ? "Conformément à la clause de retenue de garantie du devis d'origine (art. 4.5 des CGV), une"
        : "Le devis d'origine ne comporte pas de clause de retenue de garantie : le solde ci-dessous reste",
      retentionEligible
        ? "retenue de 5% du montant total du devis est conservée jusqu'à la levée des réserves ci-dessus,"
        : 'dû en totalité malgré les réserves ci-dessus.',
      retentionEligible ? 'libérée au plus tard un an après la présente réception.' : ''
    );
  }
  const legalBoxHeight = 8 + legalLines.filter(Boolean).length * 4;
  y = ensureSpace(doc, y, legalBoxHeight + 4, pageWidth, pageHeight);

  drawCard(doc, {
    x: PAGE_MARGIN,
    y,
    width: boxWidth,
    height: legalBoxHeight,
    fillColor: COLORS.amberSoft,
    borderColor: COLORS.amberBorder,
    radius: 5,
  });
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...[124, 58, 16]);
  let legalY = y + 6;
  legalLines.filter(Boolean).forEach((line) => {
    drawText(doc, line, PAGE_MARGIN + 4, legalY);
    legalY += 4;
  });

  return y + legalBoxHeight + 6;
};

const drawBalanceSection = (doc, { pageWidth, pageHeight, fontFamily, cursorY, balance, hasReserves, invoiceReference, quoteNumber }) => {
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

  const rows = [
    ['Total devis TTC', formatCurrency(balance.totalDevisTTC)],
    ['Acompte déjà réglé', `- ${formatCurrency(balance.acompteRecu)}`],
  ];
  if (hasReserves && balance.retenueGarantie > 0) {
    rows.push(['Retenue de garantie (5%)', `- ${formatCurrency(balance.retenueGarantie)}`]);
  }
  const totalLabel = hasReserves && balance.retenueGarantie > 0 ? 'Solde versé à réception' : 'Solde dû à réception';

  // Hauteur = somme réelle des éléments internes (titre 14, lignes 6 chacune,
  // total 10, bloc RIB 21) + marge basse : le texte ne doit JAMAIS déborder
  // sous la bordure de la carte (régression constatée : la mention de
  // référence chevauchait le bloc signature suivant).
  const boxHeight = 14 + rows.length * 6 + 10 + 21 + 3;
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

  let rowY = y + 14;
  rows.forEach(([label, value]) => {
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.6);
    doc.setTextColor(...COLORS.slate700);
    drawText(doc, label, PAGE_MARGIN + 4, rowY);
    drawText(doc, value, PAGE_MARGIN + boxWidth - 4, rowY, { align: 'right' });
    rowY += 6;
  });

  doc.setDrawColor(...COLORS.slate200);
  doc.line(PAGE_MARGIN + 4, rowY - 2, PAGE_MARGIN + boxWidth - 4, rowY - 2);
  rowY += 3;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.brand);
  drawText(doc, totalLabel, PAGE_MARGIN + 4, rowY);
  drawText(doc, formatCurrency(balance.soldeAPercevoir), PAGE_MARGIN + boxWidth - 4, rowY, { align: 'right' });
  rowY += 7;

  doc.setDrawColor(...COLORS.slate200);
  doc.line(PAGE_MARGIN + 4, rowY - 2, PAGE_MARGIN + boxWidth - 4, rowY - 2);
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
const drawSignatureSection = (doc, { pageWidth, pageHeight, fontFamily, cursorY, hasReserves, issueDateLabel, lieu }) => {
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

// Footer sur TOUTES les pages (avec numérotation dès qu'il y en a plusieurs),
// comme le PDF du devis, jamais uniquement sur la dernière.
const drawFooterOnAllPages = (doc, { pageWidth, pageHeight, fontFamily }) => {
  const pageCount = doc.internal.getNumberOfPages();
  const footerY = pageHeight - 14;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setDrawColor(...COLORS.slate200);
    doc.setLineWidth(0.2);
    doc.line(PAGE_MARGIN, footerY - 4, pageWidth - PAGE_MARGIN, footerY - 4);
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLORS.slate500);
    drawText(
      doc,
      `SARANGE - SIRET ${COMPANY.siret} - Capital ${COMPANY.capital} - TVA ${COMPANY.tva} - ${COMPANY.website} - ${COMPANY.email}`,
      PAGE_MARGIN,
      footerY
    );
    if (pageCount > 1) {
      drawText(doc, `Page ${pageNumber}/${pageCount}`, pageWidth - PAGE_MARGIN, footerY, { align: 'right' });
    }
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
export const buildCompletionPdfDocument = ({
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
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const fontFamily = getPreferredFont();
  const issueDateLabel = formatDate(issueDate);
  const hasKnownBalance = Number(balance?.totalDevisTTC) > 0;

  let cursorY = drawHeader(doc, {
    pageWidth,
    fontFamily,
    title: 'BON DE FIN DE CHANTIER',
    subtitle: 'Procès-verbal de réception des travaux (article 1792-6 du Code civil)',
    // Repli sur le numéro du bon lui-même quand aucune référence facture n'a
    // été saisie (variante générale) : jamais de "(à renseigner)" affiché.
    badgeLabel: invoiceReference ? 'Réf. facture' : 'N° document',
    badgeValue: invoiceReference || completionNumber,
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
      ['Réception', issueDateLabel],
      ['Lieu', lieu],
    ],
    clientLines: [
      ['Client', clientData?.nom || ''],
      ['Adresse', adresseChantier],
    ],
  });

  cursorY = drawWorksTable(doc, { pageWidth, pageHeight, fontFamily, cursorY, ouvrages });

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
  });

  const { cursorY: finalY, signatureAnchor } = drawSignatureSection(doc, {
    pageWidth,
    pageHeight,
    fontFamily,
    cursorY,
    hasReserves,
    issueDateLabel,
    lieu,
  });

  drawFooterOnAllPages(doc, { pageWidth, pageHeight, fontFamily });
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
