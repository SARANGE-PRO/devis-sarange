import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { calculateItemPrice, getItemPricingSummary, roundCurrency } from './products';
import { MenuiserieRenderer } from './MenuiserieRenderer';
import { WASTE_ICON_SVG, LOGO_NEGATIVE_SVG } from './assets';
import { generateDesignation } from './designation-generator';

let wasteIconDataUrlPromise = null;
let logoDataUrlPromise = null;
let footerLogoDataUrlPromise = null;

const getLogoDataUrl = () => {
  if (logoDataUrlPromise) {
    return logoDataUrlPromise;
  }

  if (typeof window === 'undefined') {
    logoDataUrlPromise = Promise.resolve(null);
    return logoDataUrlPromise;
  }

  logoDataUrlPromise = new Promise((resolve) => {
    try {
      const svgMarkup = LOGO_NEGATIVE_SVG;
      const svgBlob = new Blob([svgMarkup], {
        type: 'image/svg+xml;charset=utf-8',
      });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          // High resolution for PDF
          const targetWidth = 560;
          const targetHeight = 120;
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            URL.revokeObjectURL(url);
            resolve(null);
            return;
          }

          ctx.clearRect(0, 0, targetWidth, targetHeight);
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          const dataUrl = canvas.toDataURL('image/png');
          URL.revokeObjectURL(url);
          resolve(dataUrl);
        } catch {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };

      img.src = url;
    } catch {
      resolve(null);
    }
  });

  return logoDataUrlPromise;
};

const getFooterLogoDataUrl = () => {
  if (footerLogoDataUrlPromise) {
    return footerLogoDataUrlPromise;
  }

  if (typeof window === 'undefined') {
    footerLogoDataUrlPromise = Promise.resolve(null);
    return footerLogoDataUrlPromise;
  }

  footerLogoDataUrlPromise = new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          resolve({
            dataUrl,
            width: img.naturalWidth,
            height: img.naturalHeight,
            ratio: img.naturalWidth / img.naturalHeight,
          });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = '/logorgemadeinfrance.png';
    } catch {
      resolve(null);
    }
  });

  return footerLogoDataUrlPromise;
};

const getWasteIconDataUrl = () => {
  if (wasteIconDataUrlPromise) {
    return wasteIconDataUrlPromise;
  }

  if (typeof window === 'undefined') {
    wasteIconDataUrlPromise = Promise.resolve(null);
    return wasteIconDataUrlPromise;
  }

  wasteIconDataUrlPromise = new Promise((resolve) => {
    try {
      const svgMarkup = WASTE_ICON_SVG
        .replace('stroke="currentColor"', 'stroke="#16a34a"')
        .replace(/class="[^"]*"/g, '');

      const svgBlob = new Blob([svgMarkup], {
        type: 'image/svg+xml;charset=utf-8',
      });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const size = 256;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            URL.revokeObjectURL(url);
            resolve(null);
            return;
          }

          ctx.clearRect(0, 0, size, size);
          ctx.drawImage(img, 0, 0, size, size);
          const dataUrl = canvas.toDataURL('image/png');
          URL.revokeObjectURL(url);
          resolve(dataUrl);
        } catch {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };

      img.src = url;
    } catch {
      resolve(null);
    }
  });

  return wasteIconDataUrlPromise;
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
  greenSoft: [240, 253, 244],
  greenBorder: [134, 239, 172],
  amberSoft: [255, 247, 237],
  amberBorder: [253, 186, 116],
};

const COMPANY = {
  name: 'SARANGE',
  tagline: 'Fabrication et pose de menuiseries sur mesure',
  rge: 'N° RGE : E163143',
  address1: '28 rue Jean Rostand',
  address2: '77380 Combs-la-Ville',
  phone: '09 86 71 34 44',
  email: 'contact@sarange.fr',
  website: 'sarange.fr',
  siret: '82000101400027',
  capital: '30 000,00 €',
  tva: 'FR22820001014',
  insurance: 'BPCE IARD N° 194388251 R 002',
  rib: 'FR76 1010 7002 2500 0170 5433 705',
};

const CGV_SECTIONS = [
  {
    title: 'Préambule',
    text: "Les présentes conditions générales s'appliquent à toutes les ventes de menuiseries (PVC, aluminium, etc.) et prestations de fourniture, livraison et pose réalisées par la société SARANGE (SIRET : 82000101400027). Toute commande implique l'acceptation pleine et entière des présentes CGV, qui prévalent sur tout autre document de l'acheteur professionnel, sauf accord écrit et préalable de notre part.",
  },
  {
    title: 'Article 1 - Commande, fabrication sur-mesure et absence de droit de rétractation',
    text: "1.1. Engagement ferme : l'ensemble des menuiseries fournies par SARANGE étant fabriqué intégralement sur-mesure selon les spécifications techniques du Client, le droit de rétractation ne s'applique pas, conformément à l'article L. 221-28 3° du Code de la consommation. La commande est ferme et définitive dès la signature du devis. 1.2. Annulation : aucune annulation ou modification unilatérale de la commande n'est possible après signature. En cas de rupture unilatérale par le Client, l'acompte versé reste acquis à SARANGE à titre d'indemnité forfaitaire, sans préjudice de notre droit à réclamer l'exécution forcée du contrat ou le paiement intégral du prix. 1.3. Prise de côtes et métré : si le métré est réalisé par SARANGE, la validation définitive est subordonnée au relevé technique et peut donner lieu à un devis modificatif ou à une annulation sans pénalité si une impossibilité technique apparaît. Lorsque les côtes sont fournies par le Client, celui-ci en assume l'entière responsabilité ; en cas d'erreur, la menuiserie sur-mesure ne sera ni reprise, ni échangée, ni remboursée, et toute nouvelle fabrication fera l'objet d'un nouveau devis à sa charge.",
  },
  {
    title: 'Article 2 - Prix et conditions de paiement',
    text: "2.1. Prix : nos prix sont fermes pendant la durée de validité indiquée sur le devis, soit 30 jours par défaut. 2.2. Modalités : sauf mention contraire, le règlement s'effectue par un acompte de 50 % à la commande puis par le solde le jour de la réception des travaux, remis à nos poseurs ou justifié par un ordre de virement. Le règlement peut s'effectuer par virement bancaire, carte bancaire ou chèque. Aucun escompte n'est accordé pour paiement anticipé. 2.3. Retard de paiement : tout retard de paiement entraîne de plein droit, sans mise en demeure préalable, l'application de pénalités calculées au taux de refinancement de la BCE majoré de 10 points, l'exigibilité d'une indemnité forfaitaire de 40 € pour frais de recouvrement pour les clients professionnels, ainsi que la suspension immédiate de nos obligations jusqu'au règlement intégral.",
  },
  {
    title: 'Article 3 - Délais, livraison et force majeure',
    text: "3.1. Clients professionnels : les délais sont donnés à titre indicatif et un retard ne peut justifier l'annulation de la commande ni l'octroi de dommages et intérêts. 3.2. Clients consommateurs : en cas de manquement à son obligation d'exécution à la date indiquée, le Client consommateur peut résoudre le contrat selon les conditions prévues par l'article L. 216-6 du Code de la consommation. 3.3. Force majeure : aucune pénalité ou annulation ne sera recevable si le retard est lié à des causes indépendantes de notre volonté, incluant notamment les intempéries empêchant la sécurité ou la conformité de la pose, les défauts des supports, les grèves ou les ruptures d'approvisionnement imprévisibles.",
  },
  {
    title: 'Article 4 - Exécution des travaux et réception',
    text: "4.1. Préparation : le Client doit mettre à disposition des supports conformes aux normes en vigueur ; les travaux préparatoires non prévus au devis restent à sa charge exclusive. 4.2. Avenants : toute modification demandée en cours de chantier ou toute retouche liée à des supports défectueux fait l'objet d'un devis complémentaire facturé en supplément. 4.3. Réception : la réception des travaux intervient contradictoirement à la fin de l'installation par signature d'un procès-verbal. La signature sans réserve entraîne l'exigibilité immédiate du solde ; à défaut de réserves écrites, les travaux sont réputés acceptés sans vice apparent.",
  },
  {
    title: 'Article 5 - Réserve de propriété',
    text: "Les matériels et menuiseries fournis demeurent la propriété de SARANGE jusqu'au paiement intégral du prix en principal, frais et accessoires, en application de la loi n° 80-335 du 12 mai 1980. En cas de défaut de paiement, nous pourrons exiger leur restitution immédiate aux frais, risques et périls du client.",
  },
  {
    title: 'Article 6 - Garanties (conformité, vices cachés, décennale)',
    text: "Outre la garantie légale de conformité pendant 2 ans à compter de la livraison et la garantie des vices cachés, nos travaux d'installation bénéficient des garanties légales du bâtiment : garantie de parfait achèvement pendant 1 an, garantie de bon fonctionnement / biennale pendant 2 ans sur les éléments d'équipement dissociables, et garantie décennale pendant 10 ans pour les désordres compromettant la solidité de l'ouvrage ou le rendant impropre à sa destination. SARANGE est titulaire d'un contrat d'assurance de responsabilité de nature décennale BPCE IARD n° 194388251 R 002. Tous nos produits sont par ailleurs garantis 10 ans.",
  },
  {
    title: 'Article 7 - Règlement des litiges',
    text: "En cas de différend, les parties s'engagent à tenter une résolution amiable avant toute action judiciaire. Pour les clients professionnels, tout litige sera soumis à la compétence exclusive du Tribunal de Commerce de Melun. Pour les clients consommateurs, le consommateur pourra saisir, à son choix, outre l'une des juridictions territorialement compétentes en vertu du code de procédure civile, la juridiction du lieu où il demeurait au moment de la conclusion du contrat ou de la survenance du fait dommageable.",
  },
];

const PAYMENT_TERMS = [
  "Les matériels fournis, qu'ils soient posés ou non, demeurent la propriété de SARANGE jusqu'au paiement intégral du prix.",
  'Le règlement peut s\'effectuer par virement bancaire, carte bancaire ou chèque.',
  "Acompte de 50 % à la commande, puis solde à la réception des travaux ou à l'enlèvement.",
  'Coordonnées bancaires (RIB) : FR76 1010 7002 2500 0170 5433 705.',
  '!!**Tous nos produits sont garantis 10 ans.**!! Délais matériels indicatifs : 4/6 semaines.',
];

const LEGAL_NOTICE_COLUMNS = [
  {
    title: 'Garanties et assurances',
    items: [
      "L'entreprise d'assurance BPCE IARD atteste que SARANGE est titulaire d'un contrat d'assurance de responsabilité de nature décennale n° 194388251 R 002 pour la période du 01/01/2026 au 31/12/2026.",
      "La garantie de parfait achèvement, pendant un délai d'un an à compter de la réception, s'étend à la réparation de tous désordres signalés au procès-verbal ou notifiés par écrit après réception.",
    ],
  },
];

const PAGE_MARGIN = 16;
const FOOTER_RESERVED_HEIGHT = 22;
const CONTINUATION_HEADER_BOTTOM = 28;
const FIRST_PAGE_TABLE_START_Y = 110;

const PDF_SAFE_REPLACEMENTS = [
  // [/\u20AC/g, 'EUR'],
  [/\u00D7/g, 'x'],
  [/\u2022/g, '-'],
  [/\u2013|\u2014/g, '-'],
  [/\u2019|\u2018/g, "'"],
  [/\u201C|\u201D/g, '"'],
  [/\u2026/g, '...'],
  [/\u2116/g, 'N° '],
  [/\u00B0/g, '°'],
];


const sanitizePdfText = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  let nextValue = String(value);

  PDF_SAFE_REPLACEMENTS.forEach(([pattern, replacement]) => {
    nextValue = nextValue.replace(pattern, replacement);
  });

  if (typeof nextValue.normalize === 'function') {
    // nextValue = nextValue.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  return nextValue
    .replace(/[^\x20-\xFF\u20AC\n]/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ ]{2,}/g, ' ')
    .trimEnd();
};

const splitText = (doc, value, width) =>
  doc.splitTextToSize(sanitizePdfText(value), width);

const drawText = (doc, value, x, y, options) => {
  doc.text(sanitizePdfText(value), x, y, options);
};

const formatCurrency = (value) => {
  const rounded = roundCurrency(value).toFixed(2);
  const [intPart, decPart] = rounded.split('.');
  const withSeparators = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${withSeparators}.${decPart} €`;
};

const formatRate = (value) =>
  sanitizePdfText(
    new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(
      Number(value || 0)
    )
  ) + '%';

const formatDate = (date) =>
  new Intl.DateTimeFormat('fr-FR').format(date instanceof Date ? date : new Date(date));

const buildQuoteNumber = (date) => {
  const sourceDate = date instanceof Date ? date : new Date(date);

  // AA : 2 derniers chiffres de l'année (ex: 26)
  const year = String(sourceDate.getFullYear()).slice(-2);

  // JJJ : Jour de l'année de 1 à 366 (ex: 089 pour le 30 mars)
  const startOfYear = new Date(sourceDate.getFullYear(), 0, 0);
  const diff = sourceDate - startOfYear;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  const dayOfYearPadded = String(dayOfYear).padStart(3, '0');

  // HHmm : Heure et minutes actuelles (ex: 1054)
  const hours = String(sourceDate.getHours()).padStart(2, '0');
  const minutes = String(sourceDate.getMinutes()).padStart(2, '0');

  return `DV-${year}${dayOfYearPadded}${hours}${minutes}`;
};

const getPreferredFont = (doc) => {
  const fontList = doc.getFontList();

  if (fontList.Inter) {
    return 'Inter';
  }

  if (fontList.inter) {
    return 'inter';
  }

  return 'helvetica';
};

const drawCard = (doc, { x, y, width, height, fillColor, borderColor, radius = 4 }) => {
  doc.setFillColor(...fillColor);
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, width, height, radius, radius, 'FD');
};

const drawBulletList = (doc, items, x, y, width, fontFamily) => {
  let cursorY = y;

  items.forEach((item) => {
    doc.setFillColor(...COLORS.brand);
    doc.circle(x + 1.4, cursorY + 1.8, 0.65, 'F');

    const segments = item.split(/(\*\*.*?\*\*|!!.*?!!)/g);
    let currentX = x + 4;
    let maxLineHeight = 3.6;

    segments.forEach((segment) => {
      if (!segment) return;

      const isOrange = segment.startsWith('!!') && segment.endsWith('!!');
      let text = isOrange ? segment.slice(2, -2) : segment;
      const isBold = text.startsWith('**') && text.endsWith('**');
      if (isBold) text = text.slice(2, -2);

      doc.setFont(fontFamily, isBold ? 'bold' : 'normal');
      doc.setFontSize(isBold ? 8.5 : 8.2);
      doc.setTextColor(...(isOrange ? COLORS.brand : (isBold ? COLORS.slate900 : COLORS.slate700)));

      const words = text.split(' ');
      words.forEach((word, wordIndex) => {
        const wordWithSpace = word + (wordIndex < words.length - 1 ? ' ' : '');
        const wordWidth = doc.getTextWidth(wordWithSpace);

        if (currentX + wordWidth > x + width) {
          currentX = x + 4;
          cursorY += maxLineHeight + 0.5;
        }

        doc.text(wordWithSpace, currentX, cursorY + 3);
        currentX += wordWidth;
      });
    });

    cursorY += maxLineHeight + 2;
  });

  return cursorY;
};

const measureBulletList = (doc, items, width, fontFamily) => {
  let totalHeight = 0;

  items.forEach((item) => {
    const segments = item.split(/(\*\*.*?\*\*|!!.*?!!)/g);
    let currentX = 0;
    let itemHeight = 3.6 + 2;

    segments.forEach((segment) => {
      if (!segment) return;
      const isOrange = segment.startsWith('!!') && segment.endsWith('!!');
      let text = isOrange ? segment.slice(2, -2) : segment;
      const isBold = text.startsWith('**') && text.endsWith('**');
      if (isBold) text = text.slice(2, -2);

      doc.setFont(fontFamily, isBold ? 'bold' : 'normal');
      doc.setFontSize(isBold ? 8.5 : 8.2);

      const words = text.split(' ');
      words.forEach((word, wordIndex) => {
        const wordWithSpace = word + (wordIndex < words.length - 1 ? ' ' : '');
        const wordWidth = doc.getTextWidth(wordWithSpace);

        if (currentX + wordWidth > width - 6) {
          currentX = 0;
          itemHeight += 3.6 + 0.5;
        }
        currentX += wordWidth;
      });
    });
    totalHeight += itemHeight;
  });

  return totalHeight;
};

const computeTotals = (cartItems, tvaRate) => {
  let totalHT = 0;
  let originalTotalHT = 0;
  let totalQuantity = 0;
  let quantityWithPose = 0;

  cartItems.forEach((item) => {
    const calc = calculateItemPrice(item);
    const pricing = getItemPricingSummary(item, calc);
    totalHT += calc.totalLine;
    originalTotalHT += pricing.originalLineHT;
    totalQuantity += Number(item.quantity || 0);

    if (item.includePose) {
      quantityWithPose += Number(item.quantity || 0);
      totalHT += calc.posePrice * item.quantity;
      originalTotalHT += calc.posePrice * item.quantity;
    }
  });

  const totalHTRounded = roundCurrency(totalHT);
  const originalTotalHTRounded = roundCurrency(originalTotalHT);
  const discountTotal = roundCurrency(originalTotalHTRounded - totalHTRounded);
  const tva = roundCurrency(totalHTRounded * (Number(tvaRate || 0) / 100));
  const totalTTC = roundCurrency(totalHTRounded + tva);
  const acompte = roundCurrency(totalTTC * 0.5);
  const solde = roundCurrency(totalTTC - acompte);

  return {
    totalHT: totalHTRounded,
    originalTotalHT: originalTotalHTRounded,
    discountTotal,
    hasDiscount: discountTotal > 0,
    tva,
    totalTTC,
    acompte,
    solde,
    productLines: cartItems.length,
    totalQuantity,
    quantityWithPose,
  };
};


const drawStrikethroughValue = (doc, value, x, y, color = COLORS.slate500) => {
  const safeValue = sanitizePdfText(value);
  const textWidth = doc.getTextWidth(safeValue);

  drawText(doc, safeValue, x, y, { align: 'right' });
  doc.setDrawColor(...color);
  doc.setLineWidth(0.35);
  doc.line(x - textWidth, y - 1.3, x, y - 1.3);
};

const buildClientLines = (clientData) => {
  const fullName = [clientData?.prenom, clientData?.nom]
    .map((value) => sanitizePdfText(value))
    .filter(Boolean)
    .join(' ');

  const billingAddress = sanitizePdfText(clientData?.adresse);
  const billingCity = [sanitizePdfText(clientData?.codePostal), sanitizePdfText(clientData?.ville)]
    .filter(Boolean)
    .join(' ');

  const billingLines = [
    fullName || 'À définir',
    billingAddress || 'À définir',
    billingCity || 'À définir',
    clientData?.telephone ? `Tél. : ${sanitizePdfText(clientData.telephone)}` : 'Tél. : À définir',
    clientData?.email ? `E-mail : ${sanitizePdfText(clientData.email)}` : 'E-mail : À définir',
  ];

  let jobSiteLines = [];
  if (!clientData?.memeAdresseChantier) {
    const chantierAddress = sanitizePdfText(clientData?.adresseChantier);
    const chantierCity = [sanitizePdfText(clientData?.codePostalChantier), sanitizePdfText(clientData?.villeChantier)]
      .filter(Boolean)
      .join(' ');
    jobSiteLines = [
      fullName || 'À définir',
      chantierAddress || 'À définir',
      chantierCity || 'À définir',
    ];
  } else {
    jobSiteLines = [
      ...billingLines.slice(0, 3)
    ]; // Same physical address
  }

  return { billingLines, jobSiteLines };
};

const buildConfigurationText = (item, calc, pricing) => {
  // ── Gestion des déchets ─────────────────────────────────────────────────────
  if (item.productId === 'gestion-dechets') {
    return [
      `Poids estimé : ${calc.weight?.toFixed(0) || 0} kg`,
      'Gestion des menuiseries usagées – tri sélectif – valorisation écologique.',
    ].join('\n');
  }

  // ── Produit hors catalogue ──────────────────────────────────────────────────
  if (item.productId === 'custom-product') {
    return item.customDescription || '';
  }

  // ── Produits catalogue : délégation au générateur de désignations ───────────
  const designation = generateDesignation(item, calc, pricing);
  return designation !== null ? sanitizePdfText(designation) : '';
};

const buildUnitPriceText = (calc, pricing) => {
  const lines = [formatCurrency(calc.unitPriceAfterDiscount)];

  if (pricing.hasDiscount) {
    lines.push(`Avant remise : ${formatCurrency(pricing.originalUnitHT)}`);
  }

  return lines.join('\n');
};

const buildMenuiserieConfig = (item) => {
  const sheetName = item.sheetName || '';
  const w = parseInt(item.widthMm) || 1200;
  const h = parseInt(item.heightMm) || 1250;
  const type = sheetName.startsWith('Volet') ? 'volet' : (sheetName.includes('Coulissant') ? 'coulissant' : 'frappe');

  let sashes = [];
  let panelType = null;
  let solarPanel = false;

  if (type === 'volet') {
    solarPanel = item.productId === 'volet-solaire';
  } else if (sheetName.startsWith('Porte Entr')) {
    sashes = [{ ratio: 1, symbols: ['triangle-right'], handle: 'right' }];
    if (item.panneauDecoratif) panelType = 'deco';
  } else if (sheetName === 'Fen\u00eatre 1V' || sheetName === 'Porte-Fen\u00eatre 1V') {
    sashes = [{ ratio: 1, symbols: ['triangle-left'], handle: 'left' }];
  } else if (sheetName === 'Fen\u00eatre 2V' || sheetName === 'Porte-Fen\u00eatre 2V') {
    sashes = [
      { ratio: 0.5, symbols: ['triangle-right'], handle: null },
      { ratio: 0.5, symbols: ['triangle-left'], handle: 'left' }
    ];
  } else if (sheetName === 'Fenêtre 3V') {
    sashes = [
      { ratio: 0.33, symbols: ['triangle-right'], handle: null },
      { ratio: 0.33, symbols: ['triangle-left'], handle: 'left' },
      { ratio: 0.34, symbols: ['triangle-left'], handle: 'left' }
    ];
  } else if (sheetName === 'Fen\u00eatre 4V') {
    sashes = [
      { ratio: 0.25, symbols: ['triangle-right'], handle: null },
      { ratio: 0.25, symbols: ['triangle-left'], handle: 'left' },
      { ratio: 0.25, symbols: ['triangle-right'], handle: null },
      { ratio: 0.25, symbols: ['triangle-left'], handle: 'left' }
    ];
  } else if (sheetName === 'Fen\u00eatre 2V+1F' || sheetName === 'Porte-Fen\u00eatre 2V+1F') {
    sashes = [
      { ratio: 0.33, symbols: [], handle: null },
      { ratio: 0.33, symbols: ['triangle-right'], handle: null },
      { ratio: 0.34, symbols: ['triangle-left'], handle: 'left' }
    ];
  } else if (sheetName === 'Fen\u00eatre 2V+2F' || sheetName === 'Porte-Fen\u00eatre 2V+2F') {
    sashes = [
      { ratio: 0.25, symbols: [], handle: null },
      { ratio: 0.25, symbols: ['triangle-right'], handle: null },
      { ratio: 0.25, symbols: ['triangle-left'], handle: 'left' },
      { ratio: 0.25, symbols: [], handle: null }
    ];
  } else if (sheetName === 'Fen\u00eatre Fixe') {
    sashes = [{ ratio: 1, symbols: ['cross'], handle: null }];
  } else if (sheetName === 'Fen\u00eatre Soufflet') {
    sashes = [{ ratio: 1, symbols: ['triangle-up'], handle: 'top' }];
  } else if (sheetName === 'Coulissant 2 vantaux 2 rails') {
    sashes = [
      { ratio: 0.5, symbols: ['arrow-right-outline'], handle: 'left' },
      { ratio: 0.5, symbols: ['arrow-left'], handle: 'right' }
    ];
  }

  if (item.sashOptions) {
    sashes = sashes.map((sash, index) => {
      const opts = item.sashOptions[index];
      if (!opts) return sash;
      const newSash = { ...sash };
      if (opts.ob && !newSash.symbols.includes('triangle-up')) {
        newSash.symbols = [...newSash.symbols, 'triangle-up'];
      }
      if (opts.vent) newSash.hasVentilation = true;
      return newSash;
    });
  }

  // Invert visual direction if requested
  if (item.openingDirection === 'inverse') {
    sashes = sashes.slice().reverse().map(sash => {
      const newSash = { ...sash };
      if (newSash.handle === 'left') newSash.handle = 'right';
      else if (newSash.handle === 'right') newSash.handle = 'left';

      newSash.symbols = newSash.symbols.map(sym => {
        if (sym === 'triangle-left') return 'triangle-right';
        if (sym === 'triangle-right') return 'triangle-left';
        if (sym === 'arrow-left') return 'arrow-right';
        if (sym === 'arrow-right-outline') return 'arrow-left-outline';
        return sym;
      });
      return newSash;
    });
  }

  let frameColor = item.svgColor || '#FFFFFF';

  return {
    width: w,
    height: h,
    type,
    sashes,
    panelType,
    solarPanel,
    frameColor,
    sousBassement: item.hasSousBassement ? item.sousBassementHeight : 0
  };
};

const renderMenuiserieToDataURL = (item) => {
  if (!item.sheetName) return null;
  try {
    const config = buildMenuiserieConfig(item);
    const canvas = document.createElement('canvas');
    canvas.width = config.width;
    canvas.height = config.height;
    const renderer = new MenuiserieRenderer(canvas);
    renderer.draw(config);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
};

let currentPdfRowMapping = [];

const buildTableBody = (cartItems) => {
  currentPdfRowMapping = [];

  if (cartItems.length === 0) {
    return [
      [
        {
          content: 'Aucune prestation séléctionnée',
          colSpan: 6,
          styles: {
            halign: 'center',
            textColor: COLORS.slate500,
            fontStyle: 'italic',
          },
        },
      ],
    ];
  }

  const rows = [];

  cartItems.forEach((item) => {
    const calc = calculateItemPrice(item);
    const pricing = getItemPricingSummary(item, calc);

    let fullText = '';
    let title = sanitizePdfText(item.productLabel || item.sheetName || 'Prestation');

    if (item.productId === 'gestion-dechets') {
      fullText = 'Évacuation, tri et recyclage (Centre BIG BENNES 77)\n' +
        `Poids estimé : ${calc.weight?.toFixed(0) || 0} kg\n` +
        'Gestion des menuiseries usagées – tri sélectif – valorisation écologique.';
    } else {
      if (item.customDescription) {
        fullText = sanitizePdfText(item.customDescription);
      } else if (item.productId === 'custom-product') {
        fullText = sanitizePdfText(item.productLabel || item.customLabel || 'Produit sur mesure');
      } else {
        const designation = generateDesignation(item, calc, pricing);
        fullText = designation !== null ? sanitizePdfText(designation) : '';
      }

      if (item.repere) {
        fullText = `Repère : ${sanitizePdfText(item.repere)}\n${fullText}`;
      }
    }

    // Normal Product Row
    rows.push([
      {
        content: '',
        styles: { cellWidth: 18, minCellHeight: 18 },
      },
      {
        content: fullText,
        styles: { textColor: COLORS.slate700 },
        // Custom property for didDrawCell
        isDesignation: true,
      },
      {
        content: sanitizePdfText(item.quantity || 1),
        styles: { halign: 'center', fontStyle: 'bold' },
      },
      {
        content: sanitizePdfText(buildUnitPriceText(calc, pricing)),
        styles: { halign: 'right' },
      },
      {
        content: formatCurrency(calc.totalLine),
        styles: { halign: 'right', fontStyle: 'bold', textColor: COLORS.slate900 },
      },
    ]);
    currentPdfRowMapping.push(item);

    // Pose Row
    if (item.includePose) {
      rows.push([
        {
          content: '',
          styles: { cellWidth: 18 },
        },
        {
          content: 'Pose ' + title.toLowerCase(),
          styles: { textColor: COLORS.slate900, fontStyle: 'bold' },
        },
        {
          content: sanitizePdfText(item.quantity || 1),
          styles: { halign: 'center', fontStyle: 'bold' },
        },
        {
          content: formatCurrency(calc.posePrice),
          styles: { halign: 'right' },
        },
        {
          content: formatCurrency(calc.posePrice * item.quantity),
          styles: { halign: 'right', fontStyle: 'bold', textColor: COLORS.slate900 },
        },
      ]);
      currentPdfRowMapping.push(null); // No visual for the pose row
    }
  });

  return rows;
};

const drawQuoteFirstPageHeader = (doc, context) => {
  const { pageWidth, fontFamily, quoteNo, issueDateLabel, tvaRate, clientLines, clientData } = context;
  const rightCardX = PAGE_MARGIN + 72;
  const rightCardWidth = pageWidth - PAGE_MARGIN - rightCardX;
  const topCardsY = 57;

  doc.setFillColor(...COLORS.slate950);
  doc.rect(0, 0, pageWidth, 34, 'F');
  doc.setFillColor(...COLORS.brand);
  doc.rect(0, 0, 5, 34, 'F');

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.slate300);

  const logoDataUrl = context.logoDataUrl;
  if (logoDataUrl) {
    const logoWidth = 56;
    const logoHeight = (logoWidth * 60) / 280;
    doc.addImage(logoDataUrl, 'PNG', PAGE_MARGIN, 10.5, logoWidth, logoHeight);
  } else {
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(23);
    doc.setTextColor(...COLORS.white);
    drawText(doc, COMPANY.name, PAGE_MARGIN, 16.5);
  }

  drawText(doc, COMPANY.tagline, PAGE_MARGIN, 22.3);

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.white);

  [
    COMPANY.rge,
    COMPANY.address1,
    COMPANY.address2,
    `Tel : ${COMPANY.phone}`,
    COMPANY.email,
  ].forEach((line, index) => {
    drawText(doc, line, pageWidth - PAGE_MARGIN, 11 + index * 4.1, { align: 'right' });
  });

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(25);
  doc.setTextColor(...COLORS.brand);
  drawText(doc, 'DEVIS', PAGE_MARGIN, 47);

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9.6);
  doc.setTextColor(...COLORS.slate500);
  drawText(doc, 'Offre commerciale détaillée - menuiseries et services associés', PAGE_MARGIN, 53);

  drawCard(doc, {
    x: pageWidth - PAGE_MARGIN - 56,
    y: 39,
    width: 56,
    height: 14,
    fillColor: COLORS.brandSoft,
    borderColor: COLORS.amberBorder,
    radius: 4,
  });
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.4);
  doc.setTextColor(...COLORS.brand);
  drawText(doc, quoteNo, pageWidth - PAGE_MARGIN - 28, 47.6, { align: 'center' });

  drawCard(doc, {
    x: PAGE_MARGIN,
    y: topCardsY,
    width: 68,
    height: 35,
    fillColor: COLORS.white,
    borderColor: COLORS.slate200,
    radius: 5,
  });

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.slate500);
  drawText(doc, 'REFERENCES DEVIS', PAGE_MARGIN + 4, topCardsY + 7);

  const labelX = PAGE_MARGIN + 4;
  const valueX = PAGE_MARGIN + 25;
  const infoRows = [
    ['Numéro', quoteNo],
    ['Réf. Devis', sanitizePdfText(clientData?.referenceDevis) || '-'],
    ['Émission', issueDateLabel],
    ['Validité', '30 jours'],
  ];

  infoRows.forEach(([label, value], index) => {
    const rowY = topCardsY + 12 + index * 6;
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(7.7);
    doc.setTextColor(...COLORS.slate500);
    drawText(doc, label, labelX, rowY);

    if (value) {
      doc.setFont(fontFamily, 'bold');
      doc.setTextColor(...COLORS.slate900);
      drawText(doc, value, valueX, rowY);
    }
  });

  drawCard(doc, {
    x: rightCardX,
    y: topCardsY,
    width: rightCardWidth,
    height: 35,
    fillColor: COLORS.white,
    borderColor: COLORS.slate200,
    radius: 5,
  });

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.slate500);
  drawText(doc, 'CLIENT (FACTURATION)', rightCardX + 4, topCardsY + 7);

  const jobSiteHeaderX = rightCardX + rightCardWidth / 2 + 2;
  // Vertical separator
  doc.setDrawColor(...COLORS.slate200);
  doc.setLineWidth(0.3);
  doc.line(rightCardX + rightCardWidth / 2, topCardsY + 4, rightCardX + rightCardWidth / 2, topCardsY + 31);

  drawText(doc, 'ADRESSE DU CHANTIER', jobSiteHeaderX, topCardsY + 7);

  const { billingLines, jobSiteLines } = buildClientLines(clientData);

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.slate900);
  drawText(doc, billingLines[0], rightCardX + 4, topCardsY + 14);
  drawText(doc, jobSiteLines[0], jobSiteHeaderX, topCardsY + 14);

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.slate700);

  const remainingBilling = billingLines.slice(1).join('\n');
  const renderedBilling = splitText(doc, remainingBilling, (rightCardWidth / 2) - 8);
  doc.text(renderedBilling, rightCardX + 4, topCardsY + 19);

  const remainingJobSite = jobSiteLines.slice(1).join('\n');
  const renderedJobSite = splitText(doc, remainingJobSite, (rightCardWidth / 2) - 8);
  doc.text(renderedJobSite, jobSiteHeaderX, topCardsY + 19);

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLORS.slate900);
  drawText(doc, 'DÉTAIL DES PRESTATIONS', PAGE_MARGIN, 104);
};

const drawQuoteContinuationHeader = (doc, context) => {
  const { pageWidth, fontFamily, quoteNo, issueDateLabel } = context;

  doc.setFillColor(...COLORS.slate950);
  doc.rect(0, 0, pageWidth, 18, 'F');
  doc.setFillColor(...COLORS.brand);
  doc.rect(0, 0, 4, 18, 'F');

  const logoDataUrl = context.logoDataUrl;
  if (logoDataUrl) {
    const logoWidth = 32;
    const logoHeight = (logoWidth * 60) / 280;
    doc.addImage(logoDataUrl, 'PNG', PAGE_MARGIN, 8.5, logoWidth, logoHeight);
  } else {
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(11.2);
    doc.setTextColor(...COLORS.white);
    drawText(doc, COMPANY.name, PAGE_MARGIN, 11.1);
  }

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.3);
  drawText(doc, `Devis ${quoteNo} - ${issueDateLabel}`, pageWidth - PAGE_MARGIN, 11.1, {
    align: 'right',
  });

  doc.setDrawColor(...COLORS.slate200);
  doc.setLineWidth(0.2);
  doc.line(PAGE_MARGIN, 22, pageWidth - PAGE_MARGIN, 22);
};

const addQuotePage = (doc, context, quotePages) => {
  doc.addPage();
  const currentPage = doc.getNumberOfPages();
  quotePages.add(currentPage);
  drawQuoteContinuationHeader(doc, context);
  return CONTINUATION_HEADER_BOTTOM;
};

const ensureQuoteSpace = (doc, currentY, requiredHeight, context, quotePages) => {
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxY = pageHeight - FOOTER_RESERVED_HEIGHT - 2;

  if (currentY + requiredHeight <= maxY) {
    return currentY;
  }

  return addQuotePage(doc, context, quotePages);
};

const drawCommercialAndTotals = (doc, context, startY) => {
  const { pageWidth, fontFamily, totals, tvaRate } = context;
  const rightWidth = 76;
  const gap = 8;
  const leftWidth = pageWidth - PAGE_MARGIN * 2 - rightWidth - gap;
  const leftX = PAGE_MARGIN;
  const rightX = leftX + leftWidth + gap;
  const summaryRows = [];

  if (totals.hasDiscount) {
    summaryRows.push({
      label: 'Avant remise',
      value: formatCurrency(totals.originalTotalHT),
      variant: 'strikethrough',
    });
    summaryRows.push({
      label: 'Remise',
      value: `- ${formatCurrency(totals.discountTotal)}`,
      variant: 'accent',
    });
  }

  summaryRows.push(
    { label: 'Total HT', value: formatCurrency(totals.totalHT), variant: 'default' },
    { label: `TVA (${formatRate(tvaRate)})`, value: formatCurrency(totals.tva), variant: 'default' }
  );

  const summaryStartY = startY + 13;
  const summaryGap = 5.2;
  const panelY = summaryStartY + summaryRows.length * summaryGap + 2;
  const scheduleStartY = panelY + 16;
  const notesHeight = Math.max(
    48,
    13 + measureBulletList(doc, PAYMENT_TERMS, leftWidth - 8, fontFamily)
  );
  const cardHeight = Math.max(notesHeight, scheduleStartY - startY + 11);

  drawCard(doc, {
    x: leftX,
    y: startY,
    width: leftWidth,
    height: cardHeight,
    fillColor: COLORS.white,
    borderColor: COLORS.slate200,
    radius: 5,
  });

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.slate900);
  drawText(doc, 'Conditions de règlement', leftX + 4, startY + 8);

  drawBulletList(doc, PAYMENT_TERMS, leftX + 4, startY + 12, leftWidth - 8, fontFamily);

  drawCard(doc, {
    x: rightX,
    y: startY,
    width: rightWidth,
    height: cardHeight,
    fillColor: COLORS.white,
    borderColor: COLORS.slate200,
    radius: 5,
  });

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.slate900);
  drawText(doc, 'Synthèse', rightX + 4, startY + 8);

  summaryRows.forEach((row, index) => {
    const rowY = summaryStartY + index * summaryGap;
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...(row.variant === 'accent' ? COLORS.brand : COLORS.slate500));
    drawText(doc, row.label, rightX + 4, rowY);

    doc.setFont(fontFamily, 'bold');
    doc.setTextColor(...(row.variant === 'accent' ? COLORS.brand : COLORS.slate900));

    if (row.variant === 'strikethrough') {
      drawStrikethroughValue(doc, row.value, rightX + rightWidth - 4, rowY);
    } else {
      drawText(doc, row.value, rightX + rightWidth - 4, rowY, { align: 'right' });
    }
  });

  doc.setFillColor(...COLORS.brand);
  doc.roundedRect(rightX + 3, panelY, rightWidth - 6, 13, 3, 3, 'F');
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...COLORS.white);
  drawText(doc, 'MONTANT TTC', rightX + 6, panelY + 7.4);
  drawText(doc, formatCurrency(totals.totalTTC), rightX + rightWidth - 6, panelY + 7.4, {
    align: 'right',
  });

  const scheduleRows = [
    ['Acompte 50%', formatCurrency(totals.acompte)],
    ['Solde', formatCurrency(totals.solde)],
  ];

  scheduleRows.forEach(([label, value], index) => {
    const rowY = scheduleStartY + index * 5.5;
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.slate500);
    drawText(doc, label, rightX + 4, rowY);

    doc.setFont(fontFamily, 'bold');
    doc.setTextColor(...COLORS.slate900);
    drawText(doc, value, rightX + rightWidth - 4, rowY, { align: 'right' });
  });

  return startY + cardHeight;
};

const drawLegalNoticeCards = (doc, context, startY) => {
  const { pageWidth, fontFamily } = context;
  const numColumns = LEGAL_NOTICE_COLUMNS.length;
  const gap = 8;
  const totalWidth = pageWidth - PAGE_MARGIN * 2;
  const columnWidth = numColumns > 1 ? (totalWidth - gap) / 2 : totalWidth;
  const leftX = PAGE_MARGIN;
  const rightX = leftX + columnWidth + gap;

  const heights = LEGAL_NOTICE_COLUMNS.map((column) =>
    Math.max(32, 11 + measureBulletList(doc, column.items, columnWidth - 8, fontFamily))
  );
  const cardHeight = Math.max(...heights);

  LEGAL_NOTICE_COLUMNS.forEach((column, index) => {
    const cardX = index === 0 ? leftX : rightX;

    drawCard(doc, {
      x: cardX,
      y: startY,
      width: columnWidth,
      height: cardHeight,
      fillColor: COLORS.white,
      borderColor: COLORS.slate200,
      radius: 5,
    });

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(9.1);
    doc.setTextColor(...COLORS.slate900);
    drawText(doc, column.title, cardX + 4, startY + 8);

    drawBulletList(doc, column.items, cardX + 4, startY + 12, columnWidth - 8, fontFamily);
  });

  return startY + cardHeight;
};

const drawVatBlock = (doc, context, startY) => {
  const { pageWidth, fontFamily, tvaRate } = context;
  const blockX = PAGE_MARGIN;
  const blockWidth = pageWidth - PAGE_MARGIN * 2;

  if (Number(tvaRate) > 0 && Number(tvaRate) < 20) {
    const blockHeight = 29;
    drawCard(doc, {
      x: blockX,
      y: startY,
      width: blockWidth,
      height: blockHeight,
      fillColor: COLORS.greenSoft,
      borderColor: COLORS.greenBorder,
      radius: 5,
    });

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...COLORS.slate900);
    drawText(doc, 'Mention obligatoire à cocher par le client pour TVA réduite', blockX + 5, startY + 8);

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(7.7);
    doc.setTextColor(...COLORS.slate700);
    const text =
      "Je certifie que les travaux realises concernent un local a usage d'habitation acheve depuis plus de deux ans et qu'ils remplissent les conditions d'eligibilite au taux reduit de TVA conformement aux dispositions en vigueur. Je reconnais etre informe que toute fausse declaration m'expose a un redressement fiscal.";
    doc.text(splitText(doc, text, blockWidth - 18), blockX + 11, startY + 14);

    doc.setDrawColor(...COLORS.slate700);
    doc.rect(blockX + 5, startY + 12, 3.8, 3.8);

    return startY + blockHeight;
  }

  if (Number(tvaRate) === 0) {
    const blockHeight = 11;
    drawCard(doc, {
      x: blockX,
      y: startY,
      width: blockWidth,
      height: blockHeight,
      fillColor: COLORS.amberSoft,
      borderColor: COLORS.amberBorder,
      radius: 4,
    });

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(...COLORS.brand);
    drawText(
      doc,
      'Autoliquidation de la TVA - Article 283-2 du CGI. TVA due par le preneur.',
      blockX + 5,
      startY + 7.2
    );

    return startY + blockHeight;
  }

  return startY;
};

const drawSignatureSection = (doc, context, startY) => {
  const { pageWidth, fontFamily } = context;
  const cardWidth = pageWidth - PAGE_MARGIN * 2;

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10.2);
  doc.setTextColor(...COLORS.slate900);
  drawText(doc, 'Bon pour accord', PAGE_MARGIN, startY + 1);

  drawCard(doc, {
    x: PAGE_MARGIN,
    y: startY + 5,
    width: cardWidth,
    height: 52,
    fillColor: COLORS.white,
    borderColor: COLORS.slate200,
    radius: 5,
  });

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.slate700);
  drawText(
    doc,
    'Faire précéder la signature de la mention "Bon pour accord"',
    PAGE_MARGIN + 6,
    startY + 12
  );

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.slate900);
  drawText(doc, 'Le :', PAGE_MARGIN + 6, startY + 24);

  doc.setDrawColor(...COLORS.slate300);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN + 14, startY + 24.2, PAGE_MARGIN + 60, startY + 24.2);

  const signBoxWidth = 85;
  const signBoxX = PAGE_MARGIN + cardWidth - signBoxWidth - 6;
  const signBoxY = startY + 16;
  const signBoxHeight = 35;

  drawCard(doc, {
    x: signBoxX,
    y: signBoxY,
    width: signBoxWidth,
    height: signBoxHeight,
    fillColor: COLORS.slate50,
    borderColor: COLORS.slate200,
    radius: 4,
  });

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.slate900);
  drawText(doc, 'Signature du client (et cachet)', signBoxX + 4, signBoxY + 6);

};

const startCgvPage = (doc, context, cgvPages) => {
  const { pageWidth, fontFamily } = context;

  doc.addPage();
  cgvPages.add(doc.getNumberOfPages());

  doc.setFillColor(...COLORS.slate950);
  doc.rect(0, 0, pageWidth, 20, 'F');
  doc.setFillColor(...COLORS.brand);
  doc.rect(0, 0, 5, 20, 'F');

  const logoDataUrl = context.logoDataUrl;
  if (logoDataUrl) {
    const logoWidth = 35;
    const logoHeight = (logoWidth * 60) / 280;
    doc.addImage(logoDataUrl, 'PNG', PAGE_MARGIN, 8.5, logoWidth, logoHeight);
  } else {
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...COLORS.white);
    drawText(doc, 'Conditions générales de vente et de règlement', PAGE_MARGIN, 11.8);
  }

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.slate300);
  drawText(
    doc,
    "La signature du devis emporte acceptation des prix, prestations et conditions ci-dessous.",
    PAGE_MARGIN,
    16.3
  );
};

const getCompactCgvSectionHeight = (doc, section, width, fontFamily, style) => {
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(style.titleFontSize);
  const titleLines = splitText(doc, section.title, width - 7);

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(style.bodyFontSize);
  const bodyLines = splitText(doc, section.text, width - 7);

  return (
    style.paddingTop +
    titleLines.length * style.titleLeading +
    1.4 +
    bodyLines.length * style.bodyLeading +
    style.paddingBottom
  );
};

const getCompactCgvLayout = (doc, fontFamily, columnWidth, maxHeight) => {
  const styles = [
    { titleFontSize: 8.8, bodyFontSize: 7.8, titleLeading: 3.8, bodyLeading: 3.1, paddingTop: 2.8, paddingBottom: 2.4, gap: 3.2 },
    { titleFontSize: 8.3, bodyFontSize: 7.3, titleLeading: 3.5, bodyLeading: 2.9, paddingTop: 2.6, paddingBottom: 2.2, gap: 2.8 },
    { titleFontSize: 7.8, bodyFontSize: 6.8, titleLeading: 3.3, bodyLeading: 2.7, paddingTop: 2.4, paddingBottom: 2.0, gap: 2.4 },
    { titleFontSize: 7.2, bodyFontSize: 6.2, titleLeading: 3.1, bodyLeading: 2.5, paddingTop: 2.2, paddingBottom: 1.8, gap: 2.0 },
  ];

  for (const style of styles) {
    const sectionData = CGV_SECTIONS.map(section => ({
      section,
      height: getCompactCgvSectionHeight(doc, section, columnWidth, fontFamily, style)
    }));

    const totalHeight = sectionData.reduce((acc, curr) => acc + curr.height + style.gap, 0);
    const targetColumnHeight = totalHeight / 2;

    const columns = [[], []];
    let currentColumn = 0;
    let currentHeight = 0;
    let fits = true;

    for (let i = 0; i < sectionData.length; i++) {
      const item = sectionData[i];
      // Force Article 4 (index 4) to be the start of the second column
      if (i === 4 && currentColumn === 0) {
        currentColumn = 1;
        currentHeight = 0;
      }

      // If we are in the first column and adding this item would make it significantly
      // larger than the target height OR if it exceeds maxHeight, try switching to column 2
      // (as long as we haven't already hit index 4, which forces the switch anyway).
      if (currentColumn === 0 && (currentHeight + item.height > Math.max(targetColumnHeight, maxHeight * 0.8) || currentHeight + item.height > maxHeight)) {
        if (columns[1].length === 0 && i !== 4) {
          // If the user wants Article 3 on the left, we shouldn't dynamically break before index 4!
          // We will ONLY switch columns if we absolutely must due to maxHeight, to respect user intent.
          if (currentHeight + item.height > maxHeight) {
            currentColumn = 1;
            currentHeight = 0;
          }
        }
      }

      if (currentHeight + item.height > maxHeight) {
        fits = false;
        break;
      }

      columns[currentColumn].push(item);
      currentHeight += item.height + style.gap;
    }

    // Ensure we used both columns if there were multiple items
    if (fits && (columns[0].length > 0 && columns[1].length > 0)) {
      return { style, columns };
    }
  }

  // Fallback: simplified split
  const fallbackStyle = styles[styles.length - 1];
  return {
    style: fallbackStyle,
    columns: [
      CGV_SECTIONS.slice(0, Math.ceil(CGV_SECTIONS.length / 2)).map((section) => ({
        section,
        height: getCompactCgvSectionHeight(doc, section, columnWidth, fontFamily, fallbackStyle),
      })),
      CGV_SECTIONS.slice(Math.ceil(CGV_SECTIONS.length / 2)).map((section) => ({
        section,
        height: getCompactCgvSectionHeight(doc, section, columnWidth, fontFamily, fallbackStyle),
      })),
    ],
  };
};

const drawCompactCgvSection = (doc, section, x, y, width, height, fontFamily, style) => {
  drawCard(doc, {
    x,
    y,
    width,
    height,
    fillColor: COLORS.white,
    borderColor: COLORS.slate200,
    radius: 3,
  });

  doc.setDrawColor(...COLORS.brand);
  doc.setLineWidth(0.7);
  doc.line(x + 1.8, y + 2, x + 1.8, y + height - 2);

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(style.titleFontSize);
  doc.setTextColor(...COLORS.brand);
  const titleLines = splitText(doc, section.title, width - 7);
  doc.text(titleLines, x + 4.6, y + style.paddingTop + style.titleLeading - 0.2);

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(style.bodyFontSize);
  doc.setTextColor(...COLORS.slate700);
  const bodyLines = splitText(doc, section.text, width - 7);
  doc.text(
    bodyLines,
    x + 4.6,
    y + style.paddingTop + titleLines.length * style.titleLeading + 1.4 + style.bodyLeading - 0.1
  );
};

const drawCgvPages = (doc, context, cgvPages) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const columnGap = 7;
  const columnWidth = (pageWidth - PAGE_MARGIN * 2 - columnGap) / 2;
  const columnX = [PAGE_MARGIN, PAGE_MARGIN + columnWidth + columnGap];
  const contentTop = 25;
  const contentBottom = pageHeight - FOOTER_RESERVED_HEIGHT - 2;
  const maxColumnHeight = contentBottom - contentTop;

  startCgvPage(doc, context, cgvPages);
  const layout = getCompactCgvLayout(doc, context.fontFamily, columnWidth, maxColumnHeight);

  layout.columns.forEach((column, columnIndex) => {
    let currentY = contentTop;

    column.forEach(({ section, height }) => {
      drawCompactCgvSection(
        doc,
        section,
        columnX[columnIndex],
        currentY,
        columnWidth,
        height,
        context.fontFamily,
        layout.style
      );

      currentY += height + layout.style.gap;
    });
  });
};

const drawFooter = (doc, pageNumber, totalPages, context) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const { footerLogoDataUrl } = context;

  doc.setDrawColor(...COLORS.slate200);
  doc.setLineWidth(0.2);
  doc.line(PAGE_MARGIN, pageHeight - 17, pageWidth - PAGE_MARGIN, pageHeight - 17);

  doc.setFont('helvetica', 'normal');
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

  // Logo RGE / Made in France
  if (footerLogoDataUrl?.dataUrl) {
    const footerMaxHeight = 13.0; // Previous 10.4 * 1.25
    const footerMaxWidth = 50;
    let imgH = footerMaxHeight;
    let imgW = imgH * footerLogoDataUrl.ratio;

    if (imgW > footerMaxWidth) {
      imgW = footerMaxWidth;
      imgH = imgW / footerLogoDataUrl.ratio;
    }

    // Centered vertically with the address lines
    // Address lines go from y=-12.4 to y=-4.6. Center is -8.5.
    // 35mm to the left of pagination (Initial 15 + 20)
    const imgX = pageWidth - PAGE_MARGIN - imgW - 35; 
    const imgY = pageHeight - 8.5 - (imgH / 2);
    
    doc.addImage(footerLogoDataUrl.dataUrl, 'PNG', imgX, imgY, imgW, imgH);
  }

  drawText(doc, `Page ${pageNumber}/${totalPages}`, pageWidth - PAGE_MARGIN, pageHeight - 12.4, {
    align: 'right',
  });
};

export const generateQuotePDF = async (clientData, cartItems, tvaRate) => {
  const issueDate = new Date();
  const quoteNo = buildQuoteNumber(issueDate);
  const issueDateLabel = formatDate(issueDate);
  const totals = computeTotals(cartItems, tvaRate);
  const quotePages = new Set([1]);
  const cgvPages = new Set();

  // Pre-fetch assets
  const [logoDataUrl, wasteIconDataUrl, footerLogoDataUrl] = await Promise.all([
    getLogoDataUrl(),
    getWasteIconDataUrl(),
    getFooterLogoDataUrl(),
  ]);

  const doc = new jsPDF({
    format: 'a4',
    orientation: 'portrait',
    unit: 'mm',
    compress: true,
    putOnlyUsedFonts: true,
  });

  const fontFamily = getPreferredFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setProperties({
    title: sanitizePdfText(`Devis ${quoteNo} - ${COMPANY.name}`),
    subject: 'Devis menuiseries',
    author: COMPANY.name,
    creator: 'Devis Sarange',
    keywords: 'devis, menuiserie, sarange, pdf',
  });
  doc.setDisplayMode('fullwidth', 'continuous');
  doc.setFont(fontFamily, 'normal');

  const context = {
    pageWidth,
    fontFamily,
    quoteNo,
    issueDateLabel,
    tvaRate,
    totals,
    clientLines: buildClientLines(clientData),
    clientData,
    logoDataUrl,
    footerLogoDataUrl,
  };

  drawQuoteFirstPageHeader(doc, context);

  const deferredIconRenders = [];

  autoTable(doc, {
    startY: FIRST_PAGE_TABLE_START_Y,
    margin: {
      top: CONTINUATION_HEADER_BOTTOM,
      right: PAGE_MARGIN,
      bottom: FOOTER_RESERVED_HEIGHT,
      left: PAGE_MARGIN,
    },
    head: [['', 'Désignation & Configuration', 'Qte', 'PU HT', 'Total HT']],
    body: buildTableBody(cartItems),
    showHead: 'everyPage',
    pageBreak: 'auto',
    rowPageBreak: 'avoid',
    theme: 'plain',
    tableLineWidth: 0,
    styles: {
      font: fontFamily,
      fontSize: 8.4,
      textColor: COLORS.slate700,
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
      overflow: 'linebreak',
      lineColor: COLORS.slate200,
      lineWidth: { bottom: 0.18 },
      valign: 'top',
    },
    headStyles: {
      fillColor: COLORS.slate900,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: { top: 4, right: 3, bottom: 4, left: 3 },
      lineWidth: 0,
    },
    alternateRowStyles: {
      fillColor: COLORS.slate50,
    },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 92, fontSize: 7.8 },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 26, halign: 'right', fontSize: 7.9 },
      4: { cellWidth: 28, halign: 'right' },
    },
    willDrawPage: (data) => {
      const currentPage = data.doc.getNumberOfPages();
      quotePages.add(currentPage);

      if (currentPage > 1) {
        drawQuoteContinuationHeader(data.doc, context);
      }
    },
    didDrawCell: (data) => {
      // Column 0: Visual Image
      if (data.section === 'body' && data.column.index === 0) {
        const item = currentPdfRowMapping[data.row.index];
        if (!item) {
          return;
        }

        const cellW = data.cell.width;
        const cellH = data.cell.height;
        const pad = 1.5;
        const maxW = cellW - pad * 2;
        const maxH = cellH - pad * 2;

        if (item.productId === 'gestion-dechets') {
          const iconSize = Math.min(maxW, maxH) * 0.7;
          const iconX = data.cell.x + (cellW - iconSize) / 2;
          const iconY = data.cell.y + (cellH - iconSize) / 2;
          const renderTask = getWasteIconDataUrl()
            .then((iconDataUrl) => {
              if (!iconDataUrl) return;
              data.doc.addImage(iconDataUrl, 'PNG', iconX, iconY, iconSize, iconSize);
            })
            .catch(() => null);
          deferredIconRenders.push(renderTask);
          return;
        }

        if (item.productId === 'custom-product') {
          if (item.customImage) {
            const imgW = maxW;
            const imgH = maxH;
            const imgX = data.cell.x + (cellW - imgW) / 2;
            const imgY = data.cell.y + (cellH - imgH) / 2;
            try {
              data.doc.addImage(item.customImage, 'PNG', imgX, imgY, imgW, imgH);
            } catch (e) {
              console.error('Error adding custom image to PDF:', e);
            }
          }
          return;
        }

        const imgData = renderMenuiserieToDataURL(item);
        if (imgData) {
          const config = buildMenuiserieConfig(item);
          const ratio = config.width / config.height;
          let imgW, imgH;
          if (ratio >= 1) {
            imgW = Math.min(maxW, maxH * ratio);
            imgH = imgW / ratio;
          } else {
            imgH = Math.min(maxH, maxW / ratio);
            imgW = imgH * ratio;
          }
          const imgX = data.cell.x + (cellW - imgW) / 2;
          const imgY = data.cell.y + (cellH - imgH) / 2;
          data.doc.addImage(imgData, 'PNG', imgX, imgY, imgW, imgH);
        }
      }

      // Column 1: Custom formatting for product designation
      if (data.section === 'body' && data.column.index === 1 && data.cell.raw && data.cell.raw.isDesignation) {
        const doc = data.doc;
        const cell = data.cell;
        const fullText = cell.raw.content;
        const padding = 3; // cellPadding

        // Clear the cell background again to "erase" the automatic text
        const fillColor = cell.styles.fillColor || COLORS.white;
        if (Array.isArray(fillColor)) {
          doc.setFillColor(...fillColor);
        } else {
          doc.setFillColor(fillColor);
        }
        doc.rect(cell.x, cell.y, cell.width, cell.height, 'F');

        // Draw border if needed
        if (cell.styles.lineWidth) {
          const lineColor = cell.styles.lineColor || COLORS.slate200;
          if (Array.isArray(lineColor)) {
            doc.setDrawColor(...lineColor);
          } else {
            doc.setDrawColor(lineColor);
          }
          doc.setLineWidth(cell.styles.lineWidth.bottom || 0.18);
          doc.line(cell.x, cell.y + cell.height, cell.x + cell.width, cell.y + cell.height);
        }

        const fontSizePt = cell.styles.fontSize || 7.8;
        doc.setFontSize(fontSizePt);

        const FONT_ROW_RATIO = 1.15;
        const lineHeightMm = fontSizePt * FONT_ROW_RATIO * 25.4 / 72;
        const titleX = cell.x + padding;

        let currentY = cell.y + padding + (fontSizePt * 25.4 / 72);

        const logicalLines = fullText.split('\n');

        logicalLines.forEach((lLine, index) => {
          const wrappedLines = doc.splitTextToSize(lLine, cell.width - padding * 2);

          if (index === 0) {
            // First line (Title) is Bold
            doc.setFont(fontFamily, 'bold');
            doc.setTextColor(...COLORS.slate900);
          } else if (lLine.includes('Remise') && (lLine.includes('%') || lLine.includes('gain'))) {
            // Remise is Bold Orange
            doc.setFont(fontFamily, 'bold');
            doc.setTextColor(...COLORS.brand);
          } else if (lLine.startsWith('--') && lLine.includes('--')) {
            doc.setFont(fontFamily, 'bold');
            doc.setTextColor(...COLORS.slate900);
          } else {
            // Normal lines
            doc.setFont(fontFamily, 'normal');
            doc.setTextColor(...COLORS.slate700);
          }

          wrappedLines.forEach(wLine => {
            doc.text(wLine, titleX, currentY);
            currentY += lineHeightMm;
          });
        });
      }
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) {
        data.cell.styles.textColor = COLORS.slate900;
      }

      if (data.section === 'body' && data.column.index === 3 && String(data.cell.raw || '').includes('\n')) {
        data.cell.styles.fontSize = 7.7;
      }
    },
  });

  if (deferredIconRenders.length > 0) {
    await Promise.allSettled(deferredIconRenders);
  }

  let cursorY = doc.lastAutoTable.finalY + 10;
  cursorY = ensureQuoteSpace(doc, cursorY, 66, context, quotePages);
  cursorY = drawCommercialAndTotals(doc, context, cursorY);

  cursorY += 4;
  cursorY = ensureQuoteSpace(doc, cursorY, 74, context, quotePages);
  cursorY = drawLegalNoticeCards(doc, context, cursorY);

  const reducedVat = Number(tvaRate) > 0 && Number(tvaRate) < 20;
  const zeroVat = Number(tvaRate) === 0;

  if (reducedVat || zeroVat) {
    cursorY += 4;
    cursorY = ensureQuoteSpace(doc, cursorY, reducedVat ? 32 : 14, context, quotePages);
    cursorY = drawVatBlock(doc, context, cursorY);
  }

  cursorY += 5;
  cursorY = ensureQuoteSpace(doc, cursorY, 82, context, quotePages);
  drawSignatureSection(doc, context, cursorY);

  drawCgvPages(doc, context, cgvPages);

  const totalPages = doc.getNumberOfPages();

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    doc.setPage(pageNumber);
    drawFooter(doc, pageNumber, totalPages, context);
  }

  const quoteNumberOnly = quoteNo.replace('DV-', '');
  const clientLastName = (clientData?.nom || '').toUpperCase();
  const clientFirstName = (clientData?.prenom || '').toUpperCase();
  const quoteRef = (clientData?.referenceDevis || '').toUpperCase();

  const filenameParts = [
    'DEVIS',
    quoteNumberOnly,
    clientLastName,
    clientFirstName,
    quoteRef
  ];

  const filename = filenameParts.filter(Boolean).join(' ').trim().replace(/ +/g, ' ') + '.pdf';
  doc.save(filename);
};


