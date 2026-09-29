/**
 * traverses.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Traverses intermédiaires d'une menuiserie : une ou PLUSIEURS barres
 * horizontales qui recoupent le vitrage, la partie basse restant vitrée (à la
 * différence du soubassement, dont la partie basse est un panneau opaque).
 *
 * Chaque traverse est repérée par sa « hauteur visible » en mm depuis le bas du
 * vitrage, c'est-à-dire la hauteur du vitrage placé SOUS elle. Les hauteurs
 * vivent dans `traverseHeights` (tableau, source de vérité) ; l'ancien champ
 * `traverseHeight` (une traverse unique) reste lu pour les devis enregistrés
 * avant le 25/09/2026.
 *
 * Module pur (aucun import) : testable par le runner Node, importable par le
 * calcul de prix, la désignation, l'aperçu SVG et le rendu PDF.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const DEFAULT_TRAVERSE_HEIGHT_MM = 400;

// Hauteur minimale d'une traverse : en dessous, le vitrage bas n'est plus
// réalisable (et le curseur de saisie commence à la même valeur).
export const MIN_TRAVERSE_HEIGHT_MM = 100;

// Au-delà, le dessin devient illisible et la menuiserie sort du standard.
export const MAX_TRAVERSES = 4;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const toHeight = (value) => {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= MIN_TRAVERSE_HEIGHT_MM ? parsed : null;
};

/**
 * Hauteurs retenues : triées du bas vers le haut, sans doublon, bornées à
 * MAX_TRAVERSES. Accepte un tableau ou une valeur seule (ancien champ).
 */
export const normalizeTraverseHeights = (heights) =>
  [
    ...new Set(
      (Array.isArray(heights) ? heights : [heights]).map(toHeight).filter((height) => height !== null)
    ),
  ]
    .sort((a, b) => a - b)
    .slice(0, MAX_TRAVERSES);

/**
 * Traverses d'un article ou des options d'un châssis. Vide si l'option n'est
 * pas cochée, ou si un soubassement est demandé (celui-ci comprend déjà sa
 * traverse). Une option cochée sans hauteur exploitable retombe sur une
 * traverse par défaut, comme au temps du champ unique.
 */
export const getTraverseHeights = (source) => {
  if (!source?.hasTraverse || source.hasSousBassement) return [];

  const heights = normalizeTraverseHeights(
    Array.isArray(source.traverseHeights) ? source.traverseHeights : [source.traverseHeight]
  );
  return heights.length ? heights : [DEFAULT_TRAVERSE_HEIGHT_MM];
};

/** « 400 », « 400 et 900 », « 400, 900 et 1400 ». */
const joinHeights = (heights) =>
  heights.length > 1
    ? `${heights.slice(0, -1).join(', ')} et ${heights[heights.length - 1]}`
    : String(heights[0]);

/**
 * Libellé de désignation : « Traverse intermédiaire à 400 mm », ou
 * « Traverses intermédiaires à 400 et 900 mm ». Chaîne vide sans traverse.
 */
export const formatTraverseLabel = (heights, { lowercase = false } = {}) => {
  const list = normalizeTraverseHeights(heights);
  if (!list.length) return '';

  const label =
    list.length > 1
      ? `Traverses intermédiaires à ${joinHeights(list)} mm`
      : `Traverse intermédiaire à ${list[0]} mm`;
  return lowercase ? label.toLowerCase() : label;
};

/** Étiquette compacte du panier : « Traverse (400 mm) », « Traverses (400 / 900 mm) ». */
export const formatTraverseBadge = (heights) => {
  const list = normalizeTraverseHeights(heights);
  if (!list.length) return '';

  return list.length > 1 ? `Traverses (${list.join(' / ')} mm)` : `Traverse (${list[0]} mm)`;
};

/**
 * Découpe verticale d'une zone vitrée par N traverses, exprimée du HAUT vers le
 * bas pour être posée directement en SVG comme sur le canvas du PDF.
 *
 * `heights` sont les hauteurs visibles (mm depuis le bas). Chacune est bornée
 * pour laisser au moins `minPaneHeight` de vitrage en dessous et au-dessus ; une
 * traverse qui ne tient plus du tout est ignorée. Toutes les coordonnées
 * renvoyées sont des décalages depuis le haut de la zone, dans l'unité de
 * `availableHeight`.
 *
 * @returns {{ thickness: number,
 *             bars: Array<{ offsetTop: number }>,
 *             panes: Array<{ offsetTop: number, height: number, isTop: boolean }> }}
 */
export const computeTraverseLayout = ({
  heights,
  availableHeight,
  thickness,
  minPaneHeight = 0,
}) => {
  const total = Math.max(0, Number(availableHeight) || 0);
  const barThickness = clamp(Number(thickness) || 0, 0, total);
  const minPane = Math.max(0, Number(minPaneHeight) || 0);

  // Positions du bas de chaque traverse, depuis le bas de la zone.
  const bars = [];
  let usedFromBottom = 0;

  normalizeTraverseHeights(heights).forEach((height) => {
    const lowest = usedFromBottom + minPane;
    const highest = total - barThickness - minPane;
    if (highest < lowest) return;

    const fromBottom = clamp(height, lowest, highest);
    bars.push(fromBottom);
    usedFromBottom = fromBottom + barThickness;
  });

  // Vitrages du haut vers le bas : la partie haute, puis celui posé sous chaque
  // traverse en partant de la plus haute.
  const panes = [{ offsetTop: 0, height: total - usedFromBottom, isTop: true }];

  for (let index = bars.length - 1; index >= 0; index -= 1) {
    const fromBottom = bars[index];
    const bottomEdge = index === 0 ? 0 : bars[index - 1] + barThickness;
    panes.push({
      offsetTop: total - fromBottom,
      height: fromBottom - bottomEdge,
      isTop: false,
    });
  }

  return {
    thickness: barThickness,
    bars: bars.map((fromBottom) => ({ offsetTop: total - fromBottom - barThickness })),
    panes: panes.filter((pane) => pane.height > 0),
  };
};
