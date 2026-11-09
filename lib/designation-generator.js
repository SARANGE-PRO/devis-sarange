import {
  flattenCompositeModules,
  formatCompositeModules,
  getItemThermalMetrics,
  getCompositeFrameModules,
  getProductById,
  normalizeCompositeFrame,
  COLOR_OPTIONS,
  SPARE_PART_PRODUCT_IDS,
} from '@/lib/products';
import { getGlazingOptions } from '@/lib/glazing';
import { formatPetitsBoisTypeLabel } from '@/lib/petits-bois.mjs';
import { getHandleHeightDescription } from '@/lib/handle-height';
import { describeCintrageLines, normalizeCintrage } from '@/lib/cintrage.mjs';
import { buildVoletMonoblocDesignationLines } from '@/lib/volet-monobloc.mjs';
import { formatTraverseLabel, getTraverseHeights } from '@/lib/traverses.mjs';
import { describeOpeningDirection } from '@/lib/menuiserie';
import {
  describeDoorCompositeFrame,
  describeDoorCompositeParts,
  doorCompositeSuffix,
  summarizeDoorComposite,
} from '@/lib/door-composite.mjs';

// Ligne « Sens d'ouverture : … » d'un article, en mots de fabricant (tirant
// droit / gauche, vantail principal, vantail de service…), déduite du schéma.
// Toujours présente quand le produit a un sens, comme chez les fabricants :
// « ouverture inversée » seul ne disait pas de quel côté la menuiserie ouvre.
const buildOpeningDirectionLine = (item) =>
  describeOpeningDirection({
    sheetName: item.sheetName || getProductById(item.productId)?.sheet || '',
    openingDirection: item.openingDirection,
  })?.line || null;

/**
 * designation-generator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Générateur de désignations produits PVC pour le PDF de devis SARANGE.
 *
 * Produits gérés :
 *   • Fenêtres PVC Schüco (toutes configurations)
 *   • Portes-Fenêtres PVC Schüco
 *   • Coulissants PVC Schüco
 *   • Portes d'Entrée Schüco (PVC / Hybride Premium à panneau décoratif)
 *   • Volets Roulants (Filaire / Radio / Solaire / Manuel)
 *
 * Règles clés :
 *   • 1 ligne = 1 idée
 *   • max ~80 caractères par ligne
 *   • options adaptatives (≤3 / 4-5 / ≥6)
 *   • sortie = texte simple avec \n
 *   • aucune information inventée, aucune valeur modifiée
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formate un montant en euros HT.
 * @param {number} value
 * @returns {string}
 */
const fmtCurrency = (value) => {
  const rounded = (Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100).toFixed(2);
  const [intPart, decPart] = rounded.split('.');
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${withSep}.${decPart} €`;
};

/**
 * Gestion adaptative des options.
 * Renvoie 1 ou 2 lignes selon le nombre d'éléments.
 *
 * ≤3 options  → 1 ligne  : "A – B – C"
 * 4-5 options → 2 lignes : lignes équilibrées
 * ≥6 options  → 2 lignes : "A – B – C\nOptions : D – E – ..."
 *
 * @param {string[]} opts  - liste d'options non vides
 * @returns {string[]}     - tableau de lignes (1 ou 2)
 */
const buildOptionsLines = (opts) => {
  const items = opts.filter(Boolean);
  if (items.length === 0) return [];

  if (items.length <= 3) {
    return [items.join(' – ')];
  }

  if (items.length <= 5) {
    // Split roughly in half, first half slightly larger
    const mid = Math.ceil(items.length / 2);
    const line1 = items.slice(0, mid).join(' – ');
    const line2 = items.slice(mid).join(' – ');
    return [line1, line2];
  }

  // ≥6 : first 3 on line 1, rest prefixed "Options :"
  const line1 = items.slice(0, 3).join(' – ');
  const line2 = 'Options : ' + items.slice(3).join(' – ');
  return [line1, line2];
};

/**
 * Extrait et nettoie le texte de finition depuis marketingFinition.
 * Supprime les préfixes "Finition " redondants.
 * @param {string|undefined} raw
 * @returns {string}
 */
const cleanFinition = (raw) => {
  if (!raw) return '';
  return raw
    .replace(/^Finition\s*[:\-]?\s*/i, '')
    .replace(/^\s*-\s*/, '')
    .trim();
};

/**
 * Détermine si l'article est une menuiserie aluminium (gammes Schüco
 * AWS 60 / ASS 41 SC) à partir du matériau, de l'identifiant ou de la feuille.
 * @param {object} item
 * @returns {boolean}
 */
// Ligne profilé d'une porte d'entrée alu seule et d'un châssis composé alu.
const ALU_PROFILE_LINE = 'Profilé aluminium Schüco - rupture de pont thermique - double joint';

const isAluminiumItem = (item = {}) =>
  item.material === 'alu' ||
  /-alu$/i.test(item.productId || '') ||
  /\bALU\b/i.test(item.sheetName || '');

/**
 * Ligne de prix du fixe cintré en imposte (menuiseries cintrées, cf.
 * lib/cintrage.mjs). Vide hors imposte ou sans prix saisi.
 * @param {object} item
 * @returns {string[]}
 */
const buildCintragePriceLines = (item = {}) => {
  const cintrage = normalizeCintrage(item);
  if (cintrage?.type === 'imposte' && cintrage.impostePriceHt > 0) {
    return [`Fixe cintré en imposte : +${fmtCurrency(cintrage.impostePriceHt)} HT`];
  }
  return [];
};

const getPetitsBoisConfig = (item = {}) => {
  const legacyValue = Math.max(0, Number.parseInt(item.petitsBois, 10) || 0);
  const petitsBoisH = Math.max(0, Number.parseInt(item.petitsBoisH, 10) || 0);
  const petitsBoisV = Math.max(
    0,
    Number.parseInt(item.petitsBoisV ?? (item.petitsBoisH == null ? legacyValue : 0), 10) || 0
  );

  return { petitsBoisH, petitsBoisV, petitsBoisType: item.petitsBoisType };
};

/**
 * Détermine le type de produit à partir du productId et du sheetName.
 * @param {object} item
 * @returns {'composite'|'porte-composee'|'fenetre'|'porte-fenetre'|'coulissant'|'porte'|'volet'|'other'}
 */
const resolveProductKind = (item) => {
  const id = item.productId || '';
  const sheet = item.sheetName || '';

  // Porte d'entrée avec tierce et/ou imposte (lib/door-composite.mjs) : un
  // composé construit automatiquement, désigné comme une porte.
  if (item.isComposite) return item.doorComposite ? 'porte-composee' : 'composite';
  if (id.startsWith('volet-') || sheet.startsWith('Volet')) return 'volet';
  if (id.startsWith('porte-reno') || id.startsWith('porte-neuf') || sheet.startsWith('Porte Entrée')) return 'porte';
  if (id.startsWith('pf-') || sheet.startsWith('Porte-Fenêtre')) return 'porte-fenetre';
  if (
    id.startsWith('coulissant') ||
    id.startsWith('galandage') ||
    sheet.startsWith('Coulissant') ||
    sheet.startsWith('Galandage')
  ) {
    return 'coulissant';
  }
  if (id.startsWith('fenetre') || sheet.startsWith('Fenêtre')) return 'fenetre';
  return 'other';
};

/**
 * Détermine le titre formaté pour les fenêtres et portes-fenêtres.
 * @param {object} item
 * @returns {string}
 */
const resolveTitreFenetre = (item) => {
  const sheet = item.sheetName || '';
  const isPF = sheet.startsWith('Porte-Fenêtre');
  const materialLabel = isAluminiumItem(item) ? 'Aluminium' : 'PVC';
  const cintreLabel = normalizeCintrage(item) ? ' cintrée' : '';
  const typeFenetre = `${isPF ? 'Porte-Fenêtre' : 'Fenêtre'} ${materialLabel}${cintreLabel}`;

  let nbVantauxText = '';
  const mixMatch = sheet.match(/(\d+)V\+(\d+)F/);
  const vMatch = sheet.match(/(\d+)V/);

  if (mixMatch) {
    const nv = parseInt(mixMatch[1], 10);
    nbVantauxText = `${nv} ${nv > 1 ? 'Vantaux' : 'Vantail'} + ${mixMatch[2]} Fixe(s) `;
  } else if (vMatch) {
    const n = parseInt(vMatch[1], 10);
    nbVantauxText = `${n} ${n > 1 ? 'Vantaux' : 'Vantail'} `;
  }

  const hasOB = item.sashOptions && Object.values(item.sashOptions).some((s) => s && s.ob);

  let ouverture = 'Ouvrant à la française';
  if (sheet.includes('Fixe')) ouverture = 'Châssis fixe';
  else if (sheet.includes('Soufflet')) ouverture = 'Soufflet basculant';
  else if (hasOB) ouverture = 'OB';

  return `${typeFenetre} ${nbVantauxText}– ${ouverture}`;
};

/**
 * Détermine la motorisation pour les volets.
 * @param {string} productId
 * @returns {{ label: string, lines: string[] }}
 */
const resolveMotorisation = (productId) => {
  switch (productId) {
    case 'volet-solaire':
      return {
        label: 'Solaire',
        lines: [
          'Motorisation solaire autonome avec panneau photovoltaïque et batterie intégrée',
          'Sans raccordement électrique',
        ],
      };
    case 'volet-radio':
      return {
        label: 'Radio',
        lines: ['Motorisation radio avec télécommande'],
      };
    case 'volet-filaire':
      return {
        label: 'Filaire',
        lines: ['Motorisation filaire (commande murale)'],
      };
    case 'volet-manuel':
      return {
        label: 'Manuel',
        lines: ['Manoeuvre à manivelle'],
      };
    default:
      return {
        label: 'Filaire',
        lines: ['Motorisation filaire (commande murale)'],
      };
  }
};

/**
 * Lignes de désignation pour l'option « Volet roulant monobloc intégré »,
 * ajoutées aux fenêtres / portes-fenêtres / coulissants qui l'embarquent
 * (texte dans lib/volet-monobloc.mjs). Quand le prix du volet est séparé,
 * elles quittent la menuiserie pour la sous-ligne « volet » du devis.
 * @param {object} item
 * @returns {string[]}
 */
const buildMonoblocLines = (item) =>
  item.voletMonoblocSeparate ? [] : buildVoletMonoblocDesignationLines(item);

// ─── Générateurs par type ─────────────────────────────────────────────────────

/**
 * Génère la désignation pour une fenêtre PVC Schüco.
 */
const buildFenetreDesignation = (item, pricing) => {
  const lines = [];

  // ── 1. Produit + ouverture ──────────────────────────────────────────────────
  lines.push(resolveTitreFenetre(item));

  // ── 2. Dimensions ───────────────────────────────────────────────────────────
  lines.push(`${item.widthMm} x ${item.heightMm} L*H mm`);

  // ── 2 bis. Cintrage (Formes spéciales) ─────────────────────────────────────
  describeCintrageLines(item).forEach((l) => lines.push(l));

  // ── 2 ter. Sens d'ouverture ────────────────────────────────────────────────
  const openingLine = buildOpeningDirectionLine(item);
  if (openingLine) lines.push(openingLine);

  // ── 3. Technique (toujours 1 seule ligne) ──────────────────────────────────
  const sheet = item.sheetName || '';
  if (isAluminiumItem(item)) {
    lines.push('Profilé aluminium 60 mm Schüco – rupture de pont thermique');
  } else if (sheet.includes('Coulissant')) {
    lines.push('Profilé PVC Schüco – 5 chambres – renforts acier – double joint');
  } else {
    lines.push('Profilé 70 mm PVC Schüco – 5 chambres – renforts acier – double joint');
  }

  // ── 4. Finition ─────────────────────────────────────────────────────────────
  const finition = cleanFinition(item.marketingFinition);
  if (finition) {
    lines.push(`Finition : ${finition}`);
  }

  // ── 5. Vitrage ──────────────────────────────────────────────────────────────
  if (item.glazingOption?.label) {
    lines.push(item.glazingOption.label);
  }

  // ── 6. Options (adaptatives) ────────────────────────────────────────────────
  const opts = [];

  // Poignée (toujours présente sauf volet/porte/châssis fixe, qui n'a aucun
  // vantail ouvrant donc aucune quincaillerie) + hauteur de pose
  if (!sheet.includes('Fixe')) {
    const handleHeightLabel = getHandleHeightDescription(item.handleHeightMm, item.heightMm, item.allegeHeightMm);
    if (item.hasLockingHandle) {
      opts.push(`Poignée Schüco Euro verrouillable à clé – ${handleHeightLabel}`);
    } else {
      opts.push(`Poignée Schüco Euro – ${handleHeightLabel}`);
    }
  }

  // Grille de ventilation
  if (item.sashOptions && Object.values(item.sashOptions).some((s) => s && s.vent)) {
    opts.push('Grille de ventilation');
  }

  // Soubassement et/ou traverses ajoutées (les deux peuvent coexister)
  const traverseLabel = formatTraverseLabel(getTraverseHeights(item));
  if (item.hasSousBassement && item.sousBassementHeight) {
    opts.push(`Soubassement ${item.sousBassementHeight} mm`);
  }
  if (traverseLabel) {
    opts.push(traverseLabel);
  }

  // Petits bois — on n'affiche PAS le nombre comme demandé dans le brief
  const petitsBois = getPetitsBoisConfig(item);
  if (petitsBois.petitsBoisH || petitsBois.petitsBoisV) {
    const parts = [];
    if (petitsBois.petitsBoisH) parts.push(`${petitsBois.petitsBoisH} H`);
    if (petitsBois.petitsBoisV) parts.push(`${petitsBois.petitsBoisV} V`);
    const petitsBoisType = formatPetitsBoisTypeLabel(petitsBois.petitsBoisType);
    opts.push(`Petits bois ${parts.join(' / ')}${petitsBoisType ? ` ${petitsBoisType}` : ''}`);
  }

  const optLines = buildOptionsLines(opts);
  optLines.forEach((l) => lines.push(l));

  // ── 6 bis. Volet roulant monobloc intégré (option) ─────────────────────────
  buildMonoblocLines(item).forEach((l) => lines.push(l));

  // ── 7. Performances ─────────────────────────────────────────────────────────
  if (item.showThermalData !== false && item.thermalUw !== null && item.thermalUw !== undefined) {
    lines.push(`Uw = ${item.thermalUw} W/m²K – Sw = ${item.thermalSw}`);
  }

  // ── 8. Prix ─────────────────────────────────────────────────────────────────
  if (item.glazingExtra && item.glazingExtra > 0) {
    lines.push(`Surcoût vitrage : +${fmtCurrency(item.glazingExtra)} HT`);
  }
  buildCintragePriceLines(item).forEach((l) => lines.push(l));


  lines.push(''); // Espacement entre blocs
  return lines.join('\n');
};

/**
 * Génère la désignation pour un coulissant PVC Schüco.
 * Même logique que fenêtre mais sans poignée par défaut.
 */
const buildCoulissantDesignation = (item, pricing) => {
  const lines = [];

  const isAlu = isAluminiumItem(item);

  // ── 1. Produit + ouverture ──────────────────────────────────────────────────
  const sheetGeom = (item.sheetName || '').replace(/\s*ALU\s*$/i, '');
  const isGalandage = /Galandage/i.test(sheetGeom);
  const vantauxMatch = sheetGeom.match(/(\d+)\s*vant/i);
  const vantauxCount = vantauxMatch ? Number.parseInt(vantauxMatch[1], 10) : 2;
  const vantauxLabel = `${vantauxCount} ${vantauxCount > 1 ? 'vantaux' : 'vantail'}`;
  const materialLabel = isAlu ? 'aluminium Schüco' : 'PVC';

  let coulissantTitle;
  if (isGalandage) {
    coulissantTitle = `Coulissant à galandage ${materialLabel} – ${vantauxLabel}`;
  } else if (vantauxCount === 2 && /2\s*rails/i.test(sheetGeom)) {
    coulissantTitle = `Coulissant ${materialLabel} – 2 vantaux 2 rails`;
  } else {
    coulissantTitle = `Coulissant ${materialLabel} – ${vantauxLabel}`;
  }
  lines.push(coulissantTitle);

  // ── 2. Dimensions ───────────────────────────────────────────────────────────
  lines.push(`${item.widthMm} x ${item.heightMm} L*H mm`);

  // ── 2 bis. Sens d'ouverture ────────────────────────────────────────────────
  const openingLine = buildOpeningDirectionLine(item);
  if (openingLine) lines.push(openingLine);

  // ── 3. Technique ────────────────────────────────────────────────────────────
  lines.push(
    isAlu
      ? 'Profilé aluminium Schüco – rupture de pont thermique'
      : 'Profilé PVC Schüco – 5 chambres – renforts acier – double joint'
  );

  // ── 4. Finition ─────────────────────────────────────────────────────────────
  const finition = cleanFinition(item.marketingFinition);
  if (finition) {
    lines.push(`Finition : ${finition}`);
  }

  // ── 5. Vitrage ──────────────────────────────────────────────────────────────
  if (item.glazingOption?.label) {
    lines.push(item.glazingOption.label);
  }

  // ── 6. Options ──────────────────────────────────────────────────────────────
  const opts = [];
  opts.push(`Poignée – ${getHandleHeightDescription(item.handleHeightMm, item.heightMm, item.allegeHeightMm)}`);
  if (item.sashOptions && Object.values(item.sashOptions).some((s) => s && s.vent)) {
    opts.push('Grille de ventilation');
  }
  const traverseLabel = formatTraverseLabel(getTraverseHeights(item));
  if (item.hasSousBassement && item.sousBassementHeight) {
    opts.push(`Soubassement ${item.sousBassementHeight} mm`);
  }
  if (traverseLabel) {
    opts.push(traverseLabel);
  }
  const optLines = buildOptionsLines(opts);
  optLines.forEach((l) => lines.push(l));

  // ── 6 bis. Volet roulant monobloc intégré (option) ─────────────────────────
  buildMonoblocLines(item).forEach((l) => lines.push(l));

  // ── 7. Performances ─────────────────────────────────────────────────────────
  if (item.showThermalData !== false && item.thermalUw !== null && item.thermalUw !== undefined) {
    lines.push(`Uw = ${item.thermalUw} W/m²K – Sw = ${item.thermalSw}`);
  }

  // ── 8. Prix ─────────────────────────────────────────────────────────────────
  if (item.glazingExtra && item.glazingExtra > 0) {
    lines.push(`Surcoût vitrage : +${fmtCurrency(item.glazingExtra)} HT`);
  }
  

  return lines.join('\n');
};

/**
 * Génère la désignation pour une porte d'entrée Schüco.
 *
 * Deux cas, qui ne diffèrent QUE par le remplissage (panneau vs vitrage) :
 *   • Panneau décoratif PVC → « Porte d'entrée Hybride Premium (Aluminium / PVC) »
 *   • Sinon                 → « Porte d'entrée PVC » ou « Porte d'entrée Aluminium »
 * Aucune mention Réno / Neuf (réservée au configurateur pour la grille tarifaire).
 * Le panneau réel choisi à la signature est tamponné en aval par le PDF
 * (ligne « Panneau decoratif : … »), indépendamment de cette désignation ;
 * un panneau déjà choisi sur le site (`item.panelChoice`) est nommé ici.
 */
const buildPorteLines = (item, pricing, { titleSuffix = '', dimensionLines = null } = {}) => {
  const lines = [];
  const isAlu = isAluminiumItem(item);
  const isDeco = Boolean(item.panneauDecoratif);
  const materialLabel = isAlu ? 'Aluminium' : 'PVC';
  const finition = cleanFinition(item.marketingFinition) || 'Blanc';
  const cintreLabel = normalizeCintrage(item) ? ' cintrée' : '';

  // ── 1. Titre + 2. Dimensions ────────────────────────────────────────────────
  // Hybride = panneau alu sur encadrement PVC : jamais quand l'aluminium est choisi.
  let title = `Porte d'entrée ${materialLabel}${cintreLabel}`;
  if (isAlu) {
    title = `Porte d'entrée${cintreLabel}${isDeco ? ' Premium' : ''} aluminium Schüco`;
  } else if (isDeco) {
    title = `Porte d'entrée${cintreLabel} Hybride Premium (Aluminium / PVC)`;
  }
  lines.push(`${title}${titleSuffix}`);
  // Porte avec parties fixes : cotes hors tout puis détail des parties, à la
  // place de la seule cote de la porte.
  (Array.isArray(dimensionLines) ? dimensionLines : [`${item.widthMm} x ${item.heightMm} L*H mm`]).forEach(
    (line) => lines.push(line)
  );
  describeCintrageLines(item).forEach((line) => lines.push(line));
  const openingLine = buildOpeningDirectionLine(item);
  if (openingLine) lines.push(openingLine);

  // ── 3. Descriptif technique (bénéfice + technique, 1 idée par ligne) ─────────
  if (isDeco) {
    lines.push(
      isAlu
        ? 'Conception : Panneau décoratif aluminium 28 mm (âme isolante) et encadrement en profilé aluminium Schüco 60 mm à rupture de pont thermique.'
        : 'Conception : Panneau décoratif aluminium 28 mm (âme isolante) et encadrement PVC Schüco 70 mm renforts acier à 5 chambres.'
    );
  } else {
    const remplissage = item.glazingOption?.label || 'Double vitrage feuilleté Satinato 33.2';
    lines.push(
      isAlu
        ? 'Conception : Vantail et encadrement en profilé aluminium Schüco 60 mm à rupture de pont thermique.'
        : 'Conception : Vantail PVC Schüco 70 mm renforts acier à 5 chambres et encadrement renforcé.'
    );
    lines.push(`Remplissage : ${remplissage}.`);
  }

  lines.push(
    'Sécurité renforcée : Serrure ROTO 5 points avec galets anti-décrochage et seuil plat PMR.'
  );

  if (isDeco) {
    lines.push(
      isAlu
        ? "Vitrage protecteur : Double vitrage feuilleté retardateur d'effraction (Satinato 33.2/4 mm), selon le modèle de panneau choisi."
        : "Vitrage protecteur : Double vitrage feuilleté retardateur d'effraction (Satinato 33.2/4mm)."
    );
  }

  lines.push(
    'Performances : Haute isolation thermique avec un coefficient global Ud = 1,5 W/m²K.'
  );

  const traverseLabel = formatTraverseLabel(getTraverseHeights(item));
  if (item.hasSousBassement && item.sousBassementHeight) {
    lines.push(`Soubassement ${item.sousBassementHeight} mm`);
  }
  if (traverseLabel) {
    lines.push(traverseLabel);
  }

  // Panneau déjà choisi par le client (configurateur du site) : on le nomme.
  const chosenPanel = isDeco
    ? [item.panelChoice?.panelName || item.panelChoice?.panelRef, item.panelChoice?.croisillon]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(', ')
    : '';
  lines.push(
    isDeco
      ? `Finitions : ${finition} – Poignée Schüco classique – ${chosenPanel ? `Panneau ${chosenPanel}` : 'Modèle de panneau au choix'}`
      : `Finitions : ${finition} – Poignée Schüco classique`
  );

  // ── 4. Prix ─────────────────────────────────────────────────────────────────
  if (item.glazingExtra && item.glazingExtra > 0) {
    lines.push(`Surcoût vitrage : +${fmtCurrency(item.glazingExtra)} HT`);
  }
  buildCintragePriceLines(item).forEach((line) => lines.push(line));

  return lines;
};

const buildPorteDesignation = (item, pricing) => {
  const lines = buildPorteLines(item, pricing);
  // Ligne profilé de la porte alu seule (dans un composé, elle vient du composé).
  if (isAluminiumItem(item)) lines.push(ALU_PROFILE_LINE);
  lines.push(''); // Espacement
  return lines.join('\n');
};

/**
 * Génère la désignation pour un volet roulant aluminium.
 */
const buildVoletDesignation = (item, pricing) => {
  const lines = [];
  const motorisation = resolveMotorisation(item.productId);

  // ── 1. Produit + motorisation ───────────────────────────────────────────────
  lines.push(`Volet roulant aluminium – ${motorisation.label}`);

  // ── 2. Dimensions ───────────────────────────────────────────────────────────
  lines.push(`${item.widthMm} x ${item.heightMm} L*H mm`);

  // ── 3. Coffre ───────────────────────────────────────────────────────────────
  lines.push('Coffre isolant thermique haute performance');

  // ── 4. Tablier + coulisses ──────────────────────────────────────────────────
  lines.push('Tablier aluminium double paroi isolé mousse PU');
  lines.push('Coulisses aluminium avec joints anti-bruit – lame finale avec joint néoprène');

  // ── 5. Ligne motorisation (détail) ─────────────────────────────────────────
  motorisation.lines.forEach((l) => lines.push(l));

  // ── 6. Finition ──────────────────────────────────────────────────────────────
  const finition = cleanFinition(item.marketingFinition);
  if (finition) {
    lines.push(`Finition : ${finition}`);
  } else if (item.colorOption?.label && item.colorOption.label !== 'Blanc') {
    lines.push(`Finition : ${item.colorOption.label}`);
  } else {
    lines.push('Finition : Blanc');
  }

  // ── 7. Performances thermiques ──────────────────────────────────────────────
  if (item.showThermalData !== false) {
    lines.push('\u0394R > 0.22 m\u00B2.K/W');
  }

  // ── 8. Prix ─────────────────────────────────────────────────────────────────
  

  lines.push(''); // Espacement
  return lines.join('\n');
};

// ─── Point d'entrée principal ─────────────────────────────────────────────────

/**
 * Génère la désignation complète d'un article de panier.
 *
 * @param {object} item     - Article du panier (CartItem)
 * @param {object} calc     - Résultat de calculateItemPrice(item)
 * @param {object} pricing  - Résultat de getItemPricingSummary(item, calc)
 * @returns {string}        - Désignation texte avec \n comme séparateur de lignes
 */
const buildCompositeDesignation = (item, pricing) => {
  const lines = [];

  const compositeModules = flattenCompositeModules(
    item.compositionTree ?? item.composition,
    item.modules
  );
  const allModules = compositeModules.length ? compositeModules : item.modules || [];
  const isAlu =
    item.material === 'alu' ||
    allModules.some((module) => /-alu$/i.test(module?.productId || ''));

  lines.push(
    isAlu
      ? 'Chassis compose aluminium Schuco sur mesure'
      : 'Chassis compose PVC sur mesure'
  );
  lines.push(`${item.widthMm} x ${item.heightMm} L*H mm`);

  if (item.compositeFrame) {
    // Modèle « ossature » : descriptif complet de CHAQUE châssis (comme une menuiserie simple).
    // On privilégie item.modules (déjà enrichi à l'ajout au panier avec la finition
    // détaillée par châssis, ex. « Gris 7016 2 faces ») et on ne retombe sur un
    // recalcul brut depuis compositeFrame que pour les anciens devis qui n'ont pas
    // ce champ.
    const modules = item.modules?.length
      ? item.modules
      : getCompositeFrameModules(normalizeCompositeFrame(item.compositeFrame));
    if (modules.length) {
      const glazings = getGlazingOptions();
      lines.push('Composition :');
      modules.forEach((module) => {
        const product = getProductById(module.productId);
        const options = module.options || {};
        const hasColor = options.colorOptionId && options.colorOptionId !== 'blanc';
        // Finition détaillée (ex. « Gris 7016 2 faces ») plutôt que le libellé
        // générique de COLOR_OPTIONS (« Bicoloration » / « Coloration 2 faces »).
        const finitionText = hasColor
          ? cleanFinition(module.marketingFinition) ||
            COLOR_OPTIONS.find((c) => c.id === options.colorOptionId)?.label
          : '';

        // Porte à panneau décoratif : on déroule la désignation COMPLÈTE de la porte
        // (comme une porte seule) au sein du châssis composé, pour que le client sache
        // exactement ce qu'il signe et quel panneau il personnalise.
        const isDecoDoor =
          /^porte-/.test(module.productId || '') && options.panneauDecoratif === true;
        if (isDecoDoor) {
          const doorItem = {
            productId: module.productId,
            sheetName: product?.sheet,
            material: isAlu ? 'alu' : 'pvc',
            widthMm: module.widthMm,
            heightMm: module.heightMm,
            panneauDecoratif: true,
            marketingFinition: module.marketingFinition || item.marketingFinition,
            hasSousBassement: options.hasSousBassement,
            sousBassementHeight: options.sousBassementHeight,
            openingDirection: options.openingDirection,
          };
          buildPorteLines(doorItem, pricing).forEach((line, index) => {
            lines.push(index === 0 ? `- ${line}` : `  ${line}`);
          });
          return;
        }

        const parts = [
          `${product?.label || product?.shortLabel || module.productId} ${module.widthMm}x${module.heightMm} mm`,
        ];
        if (finitionText) parts.push(finitionText);
        const glazing = glazings.find((g) => g.id === options.glazingId);
        if (glazing) parts.push(glazing.shortLabel || glazing.label);
        if (options.petitsBoisH || options.petitsBoisV) {
          const petitsBoisType = formatPetitsBoisTypeLabel(options.petitsBoisType);
          parts.push(
            `petits bois ${options.petitsBoisH || 0}H/${options.petitsBoisV || 0}V${petitsBoisType ? ` ${petitsBoisType}` : ''}`
          );
        }
        if (options.hasSousBassement) {
          parts.push(`soubassement ${options.sousBassementHeight || 400} mm`);
        }
        if (options.hasTraverse) {
          parts.push(formatTraverseLabel(getTraverseHeights(options), { lowercase: true }));
        }
        const opening = describeOpeningDirection({
          sheetName: product?.sheet,
          openingDirection: options.openingDirection,
        });
        if (opening) parts.push(opening.short);
        lines.push(`- ${parts.join(' - ')}`);
      });
    }
  } else if (item.compositionTree || item.composition?.length || item.modules?.length) {
    lines.push(
      formatCompositeModules(item.compositionTree ?? item.composition ?? item.modules, ' - ')
    );
  }

  lines.push(
    isAlu ? ALU_PROFILE_LINE : 'Profile 70 mm PVC Schuco - 5 chambres - renforts acier - double joint'
  );

  const finition = cleanFinition(item.marketingFinition);
  if (finition) {
    lines.push(`Finition : ${finition}`);
  }

  if (item.glazingOption?.label) {
    lines.push(item.glazingOption.label);
  }

  if (item.showThermalData !== false && item.thermalUw !== null && item.thermalUw !== undefined) {
    lines.push(`Uw = ${item.thermalUw} W/m²K – Sw = ${item.thermalSw}`);
  }

  if (item.glazingExtra && item.glazingExtra > 0) {
    lines.push(`Surcout vitrage : +${fmtCurrency(item.glazingExtra)} HT`);
  }

  // Volet roulant monobloc intégré couvrant tout le châssis (option)
  buildMonoblocLines(item).forEach((l) => lines.push(l));

  lines.push('');
  return lines.join('\n');
};

/**
 * Porte d'entrée avec tierce et/ou imposte : la désignation COMPLÈTE de la
 * porte (titre « avec tierce et imposte », descriptif, finitions, panneau),
 * les cotes hors tout et de chaque partie, puis une ligne par partie fixe avec
 * son vitrage. Retombe sur la désignation de composé si l'ossature n'a plus
 * la forme attendue (retouchée dans le constructeur).
 */
const buildDoorCompositeDesignation = (item, pricing) => {
  const frame = item.compositeFrame ? normalizeCompositeFrame(item.compositeFrame) : null;
  const structure = frame ? describeDoorCompositeFrame(frame) : null;
  if (!structure) return buildCompositeDesignation(item, pricing);

  const marker = item.doorComposite || summarizeDoorComposite(structure);
  const modules = item.modules?.length ? item.modules : getCompositeFrameModules(frame);
  const moduleOf = (placement) =>
    modules.find((module) => module?.id === placement?.id) || null;
  const doorModule = moduleOf(structure.door);
  const doorOptions = doorModule?.options || structure.door.options || {};
  const isAlu = structure.material === 'alu';
  const glazings = getGlazingOptions();
  const glazingOf = (placement) => {
    const glazingId = moduleOf(placement)?.options?.glazingId || placement?.options?.glazingId;
    return glazings.find((glazing) => glazing.id === glazingId) || null;
  };

  const doorItem = {
    productId: structure.door.productId,
    sheetName: getProductById(structure.door.productId)?.sheet,
    material: structure.material,
    widthMm: structure.doorWidthMm,
    heightMm: structure.doorHeightMm,
    panneauDecoratif: Boolean(doorOptions.panneauDecoratif),
    marketingFinition: doorModule?.marketingFinition || item.marketingFinition,
    glazingOption: doorOptions.panneauDecoratif ? null : glazingOf(structure.door),
    hasSousBassement: doorOptions.hasSousBassement,
    sousBassementHeight: doorOptions.sousBassementHeight,
    hasTraverse: doorOptions.hasTraverse,
    traverseHeights: doorOptions.traverseHeights,
    openingDirection: doorOptions.openingDirection,
    panelChoice: item.panelChoice || structure.door.options?.panelChoice || null,
  };
  const suffix = doorCompositeSuffix(marker);
  const lines = buildPorteLines(doorItem, pricing, {
    titleSuffix: suffix ? ` ${suffix}` : '',
    dimensionLines: [
      `${item.widthMm} x ${item.heightMm} L*H mm hors tout`,
      `Composition : ${describeDoorCompositeParts(marker, { withDoor: true })}`,
    ],
  });

  // ── Parties fixes ──────────────────────────────────────────────────────────
  const fixeLine = (label, placement, widthMm, heightMm) => {
    const glazing = glazingOf(placement);
    return `${label} ${widthMm} x ${heightMm} mm${glazing ? ` : ${glazing.label}` : ''}`;
  };
  if (structure.tierce) {
    lines.push(
      fixeLine(
        `Tierce fixe à ${structure.tierceSide === 'left' ? 'gauche' : 'droite'}`,
        structure.tierce,
        structure.tierceWidthMm,
        structure.doorHeightMm
      )
    );
  }
  if (structure.imposte) {
    lines.push(fixeLine('Imposte fixe', structure.imposte, structure.overallWidthMm, structure.imposteHeightMm));
  }
  lines.push(
    isAlu
      ? ALU_PROFILE_LINE
      : 'Parties fixes : profilé 70 mm PVC Schüco - 5 chambres - renforts acier - double joint'
  );

  if (item.showThermalData !== false && item.thermalUw !== null && item.thermalUw !== undefined) {
    lines.push(`Parties vitrées : Uw = ${item.thermalUw} W/m²K – Sw = ${item.thermalSw}`);
  }

  lines.push('');
  return lines.join('\n');
};

export const generateDesignation = (item, calc, pricing) => {
  // Cas spéciaux gérés en amont dans pdf-generator.js
  if (item.productId === 'gestion-dechets') return null;
  if (item.productId === 'custom-product') return null;
  if (item.productId === 'remise-commerciale') {
    return item.customDescription || 'Remise exceptionnelle déduite du total HT du devis.';
  }
  if (item.productId === 'text-only') return null;
  if (item.productId === 'metrage-technique-validation') {
    return item.customDescription || item.productLabel || 'Métrage technique de validation';
  }
  if (item.productId === 'volet-box-domotique') {
    return item.customDescription || item.productLabel || 'Box domotique';
  }
  if (SPARE_PART_PRODUCT_IDS.has(item.productId)) {
    return item.customDescription || item.productLabel || 'Pièce détachée';
  }

  const resolvedItem = {
    ...item,
    ...(getItemThermalMetrics(item) || {}),
  };
  const kind = resolveProductKind(resolvedItem);

  switch (kind) {
    case 'composite':
      return buildCompositeDesignation(resolvedItem, pricing);

    case 'porte-composee':
      return buildDoorCompositeDesignation(resolvedItem, pricing);

    case 'volet':
      return buildVoletDesignation(resolvedItem, pricing);

    case 'porte':
      return buildPorteDesignation(resolvedItem, pricing);

    case 'coulissant':
      return buildCoulissantDesignation(resolvedItem, pricing);

    case 'fenetre':
    case 'porte-fenetre':
    default:
      return buildFenetreDesignation(resolvedItem, pricing);
  }
};
