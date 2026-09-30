/**
 * traverses.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Traverses intermédiaires d'une menuiserie : une ou PLUSIEURS barres
 * horizontales qui recoupent le vitrage, les parties restant vitrées.
 *
 * Le soubassement est la même barre, à ceci près que la partie EN DESSOUS est un
 * panneau opaque : les deux se combinent donc dans une seule découpe, le
 * soubassement toujours le plus bas, les traverses au-dessus de lui.
 *
 * Chaque traverse est repérée par sa « hauteur visible » en mm depuis le bas du
 * vitrage, c'est-à-dire la hauteur de la partie placée SOUS elle. Les hauteurs
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
 * Traverses d'un article ou des options d'un châssis. Vide si l'option n'est pas
 * cochée. Un soubassement ne les exclut plus (30/09/2026) : les traverses se
 * placent alors au-dessus de lui, chacune facturée en plus de la sienne.
 * Une option cochée sans hauteur exploitable retombe sur une traverse par
 * défaut, comme au temps du champ unique.
 */
export const getTraverseHeights = (source) => {
  if (!source?.hasTraverse) return [];

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
 * Découpe verticale d'une zone vitrée par le soubassement et les traverses,
 * exprimée du HAUT vers le bas pour être posée directement en SVG comme sur le
 * canvas du PDF.
 *
 * `sousBassementHeight` et `heights` sont des hauteurs visibles (mm depuis le
 * bas), c'est-à-dire la hauteur de la partie située sous la barre. Le
 * soubassement est toujours la barre la plus basse ; chaque traverse est ensuite
 * remontée si besoin pour laisser au moins `minPaneHeight` de vitrage sous et
 * au-dessus d'elle, et ignorée s'il ne reste plus de place.
 *
 * Les parties sont renvoyées du haut vers le bas ; `isPanel` marque celle du
 * soubassement (panneau opaque), `isTop` la partie haute, seule à porter les
 * petits bois.
 *
 * @returns {{ thickness: number,
 *             bars: Array<{ offsetTop: number }>,
 *             panes: Array<{ offsetTop: number, height: number, isTop: boolean, isPanel: boolean }> }}
 */
export const computeTraverseLayout = ({
  heights,
  sousBassementHeight = 0,
  availableHeight,
  thickness,
  minPaneHeight = 0,
}) => {
  const total = Math.max(0, Number(availableHeight) || 0);
  const barThickness = clamp(Number(thickness) || 0, 0, total);
  const minPane = Math.max(0, Number(minPaneHeight) || 0);
  const highest = total - barThickness - minPane;

  // Barres à poser, de la plus basse à la plus haute : le soubassement d'abord
  // (sa partie basse est le panneau opaque, sans hauteur minimale imposée),
  // puis les traverses.
  const wanted = [
    ...(Number(sousBassementHeight) > 0
      ? [{ height: Number(sousBassementHeight), minBelow: 0, isPanelBelow: true }]
      : []),
    ...normalizeTraverseHeights(heights).map((height) => ({
      height,
      minBelow: minPane,
      isPanelBelow: false,
    })),
  ];

  // Position du bas de chaque barre retenue, depuis le bas de la zone.
  const bars = [];
  let usedFromBottom = 0;

  wanted.forEach(({ height, minBelow, isPanelBelow }) => {
    const lowest = usedFromBottom + minBelow;
    if (highest < lowest) return;

    const fromBottom = clamp(height, lowest, highest);
    if (fromBottom <= usedFromBottom) return;

    bars.push({ fromBottom, isPanelBelow });
    usedFromBottom = fromBottom + barThickness;
  });

  // Parties du haut vers le bas : la partie haute, puis celle posée sous chaque
  // barre en partant de la plus haute.
  const panes = [
    { offsetTop: 0, height: total - usedFromBottom, isTop: true, isPanel: false },
  ];

  for (let index = bars.length - 1; index >= 0; index -= 1) {
    const { fromBottom, isPanelBelow } = bars[index];
    const bottomEdge = index === 0 ? 0 : bars[index - 1].fromBottom + barThickness;
    panes.push({
      offsetTop: total - fromBottom,
      height: fromBottom - bottomEdge,
      isTop: false,
      isPanel: isPanelBelow,
    });
  }

  return {
    thickness: barThickness,
    bars: bars.map(({ fromBottom }) => ({ offsetTop: total - fromBottom - barThickness })),
    panes: panes.filter((pane) => pane.height > 0),
  };
};
