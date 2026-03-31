import { formatCompositeModules } from '@/lib/products';

/**
 * designation-generator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Générateur de désignations produits PVC pour le PDF de devis SARANGE.
 *
 * Produits gérés :
 *   • Fenêtres PVC Schüco (toutes configurations)
 *   • Portes-Fenêtres PVC Schüco
 *   • Coulissants PVC Schüco
 *   • Portes d'Entrée PVC Schüco (Réno / Neuf)
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

const getPetitsBoisConfig = (item = {}) => {
  const legacyValue = Math.max(0, Number.parseInt(item.petitsBois, 10) || 0);
  const petitsBoisH = Math.max(0, Number.parseInt(item.petitsBoisH, 10) || 0);
  const petitsBoisV = Math.max(
    0,
    Number.parseInt(item.petitsBoisV ?? (item.petitsBoisH == null ? legacyValue : 0), 10) || 0
  );

  return { petitsBoisH, petitsBoisV };
};

/**
 * Détermine le type de produit à partir du productId et du sheetName.
 * @param {object} item
 * @returns {'composite'|'fenetre'|'porte-fenetre'|'coulissant'|'porte'|'volet'|'other'}
 */
const resolveProductKind = (item) => {
  const id = item.productId || '';
  const sheet = item.sheetName || '';

  if (item.isComposite) return 'composite';
  if (id.startsWith('volet-') || sheet.startsWith('Volet')) return 'volet';
  if (id.startsWith('porte-reno') || id.startsWith('porte-neuf') || sheet.startsWith('Porte Entrée')) return 'porte';
  if (id.startsWith('pf-') || sheet.startsWith('Porte-Fenêtre')) return 'porte-fenetre';
  if (id.startsWith('coulissant') || sheet.startsWith('Coulissant')) return 'coulissant';
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
  const typeFenetre = isPF ? 'Porte-Fenêtre PVC' : 'Fenêtre PVC';

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

  // ── 3. Technique (toujours 1 seule ligne) ──────────────────────────────────
  const sheet = item.sheetName || '';
  if (sheet.includes('Coulissant')) {
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

  // Poignée (toujours présente sauf volet/porte)
  if (item.hasLockingHandle) {
    opts.push('Poignée Schüco Euro verrouillable à clé');
  } else {
    opts.push('Poignée Schüco Euro');
  }

  // Grille de ventilation
  if (item.sashOptions && Object.values(item.sashOptions).some((s) => s && s.vent)) {
    opts.push('Grille de ventilation');
  }

  // Soubassement
  if (item.hasSousBassement && item.sousBassementHeight) {
    opts.push(`Soubassement ${item.sousBassementHeight} mm`);
  }

  // Petits bois — on n'affiche PAS le nombre comme demandé dans le brief
  const petitsBois = getPetitsBoisConfig(item);
  if (petitsBois.petitsBoisH || petitsBois.petitsBoisV) {
    const parts = [];
    if (petitsBois.petitsBoisH) parts.push(`${petitsBois.petitsBoisH} H`);
    if (petitsBois.petitsBoisV) parts.push(`${petitsBois.petitsBoisV} V`);
    opts.push(`Petits bois ${parts.join(' / ')}`);
  }

  const optLines = buildOptionsLines(opts);
  optLines.forEach((l) => lines.push(l));

  // ── 7. Performances ─────────────────────────────────────────────────────────
  if (item.showThermalData !== false && item.thermalUw !== null && item.thermalUw !== undefined) {
    lines.push(`Uw = ${item.thermalUw} W/m²K – Sw = ${item.thermalSw}`);
  }

  // ── 8. Prix ─────────────────────────────────────────────────────────────────
  if (item.glazingExtra && item.glazingExtra > 0) {
    lines.push(`Surcoût vitrage : +${fmtCurrency(item.glazingExtra)} HT`);
  }
  if (item.remise > 0 && pricing?.discountLineHT > 0) {
    lines.push(''); // Aération avant remise
    lines.push(`Remise : -${item.remise}% (gain -${fmtCurrency(pricing.discountLineHT)})`);
  }

  lines.push(''); // Espacement entre blocs
  return lines.join('\n');
};

/**
 * Génère la désignation pour un coulissant PVC Schüco.
 * Même logique que fenêtre mais sans poignée par défaut.
 */
const buildCoulissantDesignation = (item, pricing) => {
  const lines = [];

  // ── 1. Produit + ouverture ──────────────────────────────────────────────────
  lines.push('Coulissant PVC – 2 vantaux 2 rails');

  // ── 2. Dimensions ───────────────────────────────────────────────────────────
  lines.push(`${item.widthMm} x ${item.heightMm} L*H mm`);

  // ── 3. Technique ────────────────────────────────────────────────────────────
  lines.push('Profilé PVC Schüco – 5 chambres – renforts acier – double joint');

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
  if (item.sashOptions && Object.values(item.sashOptions).some((s) => s && s.vent)) {
    opts.push('Grille de ventilation');
  }
  const optLines = buildOptionsLines(opts);
  optLines.forEach((l) => lines.push(l));

  // ── 7. Performances ─────────────────────────────────────────────────────────
  if (item.showThermalData !== false && item.thermalUw !== null && item.thermalUw !== undefined) {
    lines.push(`Uw = ${item.thermalUw} W/m²K – Sw = ${item.thermalSw}`);
  }

  // ── 8. Prix ─────────────────────────────────────────────────────────────────
  if (item.glazingExtra && item.glazingExtra > 0) {
    lines.push(`Surcoût vitrage : +${fmtCurrency(item.glazingExtra)} HT`);
  }
  if (item.remise > 0 && pricing?.discountLineHT > 0) {
    lines.push(`Remise : -${item.remise}% (gain -${fmtCurrency(pricing.discountLineHT)})`);
  }

  return lines.join('\n');
};

/**
 * Génère la désignation pour une porte d'entrée PVC Schüco.
 */
const buildPorteDesignation = (item, pricing) => {
  const lines = [];
  const isReno = (item.productId || '').includes('reno');

  // ── 1. Produit ──────────────────────────────────────────────────────────────
  if (item.panneauDecoratif) {
    lines.push(`Porte d'entrée PVC${isReno ? ' – Rénovation' : ' – Neuf'}`);
  } else {
    lines.push(`Porte d'entrée vitrée PVC${isReno ? ' – Rénovation' : ' – Neuf'}`);
  }

  // ── 2. Dimensions ───────────────────────────────────────────────────────────
  lines.push(`${item.widthMm} x ${item.heightMm} L*H mm`);

  // ── 3. Panneau / Vitrage ──────────────────────────────────────────────────────
  if (item.panneauDecoratif) {
    lines.push('Panneau décoratif aluminium 28 mm isolé mousse PU – modèle au choix');
  } else if (item.glazingOption?.label) {
    lines.push(item.glazingOption.label);
  } else {
    lines.push('Vitrage feuilleté dépoli Satinato 33.2');
  }

  // ── 4. Technique ────────────────────────────────────────────────────────────
  lines.push('Profilé 70 mm PVC Schüco – 5 chambres – seuil PMR');

  // ── 5. Sécurité ─────────────────────────────────────────────────────────────
  lines.push('Sécurité : serrure 5 points – paumelles renforcées – renforts acier');

  // ── 7. Performances ─────────────────────────────────────────────────────────
  if (item.showThermalData !== false) {
    const uw = item.thermalUw ?? 1.3;
    lines.push(`Uw = ${uw} W/m²K – Ud = 1.5 W/m²K`);
  }

  // ── 8. Finition ─────────────────────────────────────────────────────────────
  const finition = cleanFinition(item.marketingFinition);
  if (finition) {
    lines.push(`Finition : ${finition}`);
  }

  // ── 9. Prix ─────────────────────────────────────────────────────────────────
  if (item.glazingExtra && item.glazingExtra > 0) {
    lines.push(`Surcoût vitrage : +${fmtCurrency(item.glazingExtra)} HT`);
  }
  if (item.remise > 0 && pricing?.discountLineHT > 0) {
    lines.push(''); // Aération avant remise
    lines.push(`Remise : -${item.remise}% (gain -${fmtCurrency(pricing.discountLineHT)})`);
  }

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
  if (item.remise > 0 && pricing?.discountLineHT > 0) {
    lines.push(''); // Aération avant remise
    lines.push(`Remise : -${item.remise}% (gain -${fmtCurrency(pricing.discountLineHT)})`);
  }

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

  lines.push('Chassis compose PVC sur mesure');
  lines.push(`${item.widthMm} x ${item.heightMm} L*H mm`);

  if (item.composition?.length || item.modules?.length) {
    lines.push(formatCompositeModules(item.composition || item.modules, ' - '));
  }

  lines.push('Profile 70 mm PVC Schuco - 5 chambres - renforts acier - double joint');

  const finition = cleanFinition(item.marketingFinition);
  if (finition) {
    lines.push(`Finition : ${finition}`);
  }

  if (item.glazingOption?.label) {
    lines.push(item.glazingOption.label);
  }

  if (item.showThermalData !== false && item.thermalUw !== null && item.thermalUw !== undefined) {
    lines.push(`Uw = ${item.thermalUw} W/mÂ²K - Sw = ${item.thermalSw}`);
  }

  if (item.glazingExtra && item.glazingExtra > 0) {
    lines.push(`Surcout vitrage : +${fmtCurrency(item.glazingExtra)} HT`);
  }

  if (item.remise > 0 && pricing?.discountLineHT > 0) {
    lines.push('');
    lines.push(`Remise : -${item.remise}% (gain -${fmtCurrency(pricing.discountLineHT)})`);
  }

  lines.push('');
  return lines.join('\n');
};

export const generateDesignation = (item, calc, pricing) => {
  // Cas spéciaux gérés en amont dans pdf-generator.js
  if (item.productId === 'gestion-dechets') return null;
  if (item.productId === 'custom-product') return null;

  const kind = resolveProductKind(item);

  switch (kind) {
    case 'composite':
      return buildCompositeDesignation(item, pricing);

    case 'volet':
      return buildVoletDesignation(item, pricing);

    case 'porte':
      return buildPorteDesignation(item, pricing);

    case 'coulissant':
      return buildCoulissantDesignation(item, pricing);

    case 'fenetre':
    case 'porte-fenetre':
    default:
      return buildFenetreDesignation(item, pricing);
  }
};
