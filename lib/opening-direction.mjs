// Sens d'ouverture d'une menuiserie en mots de fabricant, DÉDUIT du modèle de
// vantaux dessiné (lib/menuiserie.js) : le texte du devis ne peut donc jamais
// contredire le schéma. Convention : vue intérieure, celle des schémas (la
// poignée y est visible). Module pur, sans dépendance.
//
//   - Frappe (fenêtres, portes-fenêtres) : « tirant droit » = paumelles à
//     droite, poignée à gauche (on tire le vantail vers soi de la main droite).
//     À plusieurs vantaux, le vantail principal (celui qui porte la poignée)
//     donne le sens.
//   - Porte d'entrée : même règle vue de l'intérieur, avec son équivalent vu de
//     l'extérieur (« poussant »), les deux conventions existant chez les
//     fabricants de portes.
//   - Coulissants : vantail de service (poignée en rive, flèche pleine) à
//     gauche ou à droite ; disposition symétrique : « ouverture centrale ».
//   - Galandages : sens de refoulement des vantaux dans la cloison.
//
// Retour : { short, line, symmetric? } ou null quand le produit n'a pas de
// sens d'ouverture (fixe, soufflet). `short` sert dans les listes (composition
// d'un châssis composé, choix du formulaire), `line` est la ligne du devis.

const OPPOSITE_SIDE = { droit: 'gauche', gauche: 'droit' };
const SIDE_NOUN = { droit: 'droite', gauche: 'gauche' };
const FILLED_ARROWS = new Set(['arrow-left', 'arrow-right']);

const symbolsOf = (sash) => (Array.isArray(sash?.symbols) ? sash.symbols : []);
const isSwingSash = (sash) =>
  symbolsOf(sash).some((symbol) => symbol === 'triangle-left' || symbol === 'triangle-right');
const isSlidingSash = (sash) => symbolsOf(sash).some((symbol) => symbol.startsWith('arrow-'));
const slidesRight = (sash) =>
  symbolsOf(sash).some((symbol) => symbol === 'arrow-right' || symbol === 'arrow-right-outline');
const hasFilledArrow = (sash) => symbolsOf(sash).some((symbol) => FILLED_ARROWS.has(symbol));

// Poignée à gauche = paumelles à droite = tirant droit.
const hingeSideOf = (sash) =>
  sash.handle === 'left' ? 'droit' : sash.handle === 'right' ? 'gauche' : null;

const describeSwing = (sashes, { door = false } = {}) => {
  const swinging = sashes.filter(isSwingSash);
  if (!swinging.length) return null;
  const sides = new Set(swinging.map(hingeSideOf).filter(Boolean));
  if (sides.size !== 1) return null;
  const [side] = sides;

  if (door) {
    return {
      short: `tirant ${side}`,
      line: `Sens d'ouverture : tirant ${side} vue intérieure (poussant ${OPPOSITE_SIDE[side]} vue extérieure)`,
    };
  }
  if (swinging.length === 1) {
    return { short: `tirant ${side}`, line: `Sens d'ouverture : tirant ${side}, vue intérieure` };
  }
  const short = `tirant ${side}, vantail principal à ${SIDE_NOUN[side]}`;
  return { short, line: `Sens d'ouverture : ${short}, vue intérieure` };
};

const describeSliding = (sashes) => {
  if (!sashes.some(isSlidingSash)) return null;
  if (sashes.length === 1) {
    const side = slidesRight(sashes[0]) ? 'droite' : 'gauche';
    return {
      short: `coulissant vers la ${side}`,
      line: `Sens d'ouverture : vantail coulissant vers la ${side}, vue intérieure`,
    };
  }
  const first = sashes[0];
  const last = sashes[sashes.length - 1];
  const serviceLeft = first.handle === 'left' && hasFilledArrow(first);
  const serviceRight = last.handle === 'right' && hasFilledArrow(last);
  if (serviceLeft !== serviceRight) {
    const side = serviceRight ? 'droite' : 'gauche';
    return {
      short: `vantail de service à ${side}`,
      line: `Sens d'ouverture : vantail de service à ${side}, vue intérieure`,
    };
  }
  return {
    short: 'ouverture centrale',
    line: "Sens d'ouverture : ouverture centrale, vantaux s'écartant de part et d'autre",
    symmetric: true,
  };
};

const countSashes = (count) => `${count} ${count > 1 ? 'vantaux' : 'vantail'}`;

const describePocket = (sashes) => {
  const sliding = sashes.filter(isSlidingSash);
  if (!sliding.length) return null;
  const right = sliding.filter(slidesRight).length;
  const left = sliding.length - right;
  if (left === 0) {
    return { short: 'refoulement à droite', line: 'Sens d\'ouverture : refoulement à droite, vue intérieure' };
  }
  if (right === 0) {
    return { short: 'refoulement à gauche', line: 'Sens d\'ouverture : refoulement à gauche, vue intérieure' };
  }
  if (left === right) {
    return {
      short: 'refoulement de part et d\'autre',
      line: 'Sens d\'ouverture : refoulement de part et d\'autre, vue intérieure',
      symmetric: true,
    };
  }
  const short = `refoulement ${countSashes(left)} à gauche, ${right} à droite`;
  return { short, line: `Sens d'ouverture : ${short}, vue intérieure` };
};

/**
 * @param {Array<{handle?: string|null, symbols?: string[]}>} sashes vantaux
 *   tels que dessinés (sens d'ouverture déjà appliqué)
 * @param {{kind?: 'frappe'|'porte'|'coulissant'|'galandage'}} options
 */
export const describeSashesOpening = (sashes, { kind = 'frappe' } = {}) => {
  if (!Array.isArray(sashes) || !sashes.length) return null;
  if (kind === 'galandage') return describePocket(sashes);
  if (kind === 'coulissant') return describeSliding(sashes);
  return describeSwing(sashes, { door: kind === 'porte' });
};
