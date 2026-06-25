// =====================================================================
// Géométrie des châssis composés — MODÈLE « DÉCOUPE LIBRE » (arbre de divisions)
// ---------------------------------------------------------------------
// Module PUR (aucune dépendance) : il est importable tel quel par les tests
// `node tests/*.mjs` (comme lib/pricing-margin.mjs). Il ne connaît ni le
// catalogue ni le prix : il ne manipule que la STRUCTURE et la GÉOMÉTRIE.
//
// Un nœud d'arbre est :
//   - une FEUILLE : { type:'leaf', id, module }
//       `module` = l'objet module du devis (productId, widthMm, heightMm, options…)
//   - une DIVISION : { type:'split', id, direction:'h'|'v', children:[node…] }
//       'h' = côte à côte (largeurs Σ, hauteur partagée = max)
//       'v' = empilé       (hauteurs Σ, largeur partagée = max)
//
// `computeCompositeLayout` est l'UNIQUE source de vérité géométrique : tous les
// consommateurs (SVG écran, prix, dimensions, aperçu PDF) en dérivent.
// =====================================================================

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// --- Fabriques & gardes -------------------------------------------------
export const makeLeaf = (id, module) => ({ type: 'leaf', id, module });
export const makeSplit = (id, direction, children) => ({
  type: 'split',
  id,
  direction: direction === 'v' ? 'v' : 'h',
  children: Array.isArray(children) ? children : [],
});
export const isLeaf = (node) => Boolean(node) && node.type === 'leaf';
export const isSplit = (node) => Boolean(node) && node.type === 'split';
export const isTreeNode = (node) => isLeaf(node) || isSplit(node);

// --- Parcours ----------------------------------------------------------
export function collectLeaves(node, acc = []) {
  if (isLeaf(node)) acc.push(node);
  else if (isSplit(node)) node.children.forEach((child) => collectLeaves(child, acc));
  return acc;
}

// Renvoie un NOUVEL arbre où chaque feuille passe par leafFn(leaf) -> nouveau nœud.
export function mapTree(node, leafFn) {
  if (isLeaf(node)) return leafFn(node);
  if (isSplit(node)) return { ...node, children: node.children.map((c) => mapTree(c, leafFn)) };
  return node;
}

// { node, parent, index } | null
export function findNode(node, id, parent = null, index = -1) {
  if (!isTreeNode(node)) return null;
  if (node.id === id) return { node, parent, index };
  if (isSplit(node)) {
    for (let i = 0; i < node.children.length; i += 1) {
      const found = findNode(node.children[i], id, node, i);
      if (found) return found;
    }
  }
  return null;
}

// Renvoie un nouvel arbre où le nœud d'id `id` est remplacé par replacer(node).
export function replaceNodeById(node, id, replacer) {
  if (!isTreeNode(node)) return node;
  if (node.id === id) return replacer(node);
  if (isSplit(node)) {
    return { ...node, children: node.children.map((c) => replaceNodeById(c, id, replacer)) };
  }
  return node;
}

// Retire le nœud d'id `id` et fusionne (collapse) les divisions devenues
// mono-enfant. Ne peut pas retirer la racine si c'est une feuille (le caller
// réinitialise alors une feuille par défaut).
export function removeNodeById(node, id) {
  if (!isSplit(node)) return node;
  const children = node.children
    .filter((c) => c.id !== id)
    .map((c) => removeNodeById(c, id));
  return collapseSingleChild({ ...node, children });
}

export function firstLeafId(node) {
  if (isLeaf(node)) return node.id;
  if (isSplit(node) && node.children.length) return firstLeafId(node.children[0]);
  return null;
}

// Toute division à un seul enfant est remplacée par cet enfant (récursif, bottom-up).
export function collapseSingleChild(node) {
  if (!isSplit(node)) return node;
  const children = node.children.map(collapseSingleChild).filter(Boolean);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...node, children };
}

// --- Géométrie (positions absolues, origine haut-gauche) ---------------
// Convention transverse : taille = max des enfants ; les plus petits sont
// alignés en haut/à gauche (équivalent de l'ancien `Math.max(0, rowHeight - h)`).
export function computeCompositeLayout(node) {
  if (isLeaf(node)) {
    const widthMm = num(node.module?.widthMm);
    const heightMm = num(node.module?.heightMm);
    return {
      widthMm,
      heightMm,
      leaves: [{ id: node.id, module: node.module, xMm: 0, yMm: 0, widthMm, heightMm }],
    };
  }

  if (!isSplit(node) || node.children.length === 0) {
    return { widthMm: 0, heightMm: 0, leaves: [] };
  }

  const childLayouts = node.children.map(computeCompositeLayout);
  const leaves = [];

  if (node.direction === 'h') {
    let cursorX = 0;
    let maxHeight = 0;
    for (const child of childLayouts) {
      for (const leaf of child.leaves) {
        leaves.push({ ...leaf, xMm: leaf.xMm + cursorX, yMm: leaf.yMm });
      }
      cursorX += child.widthMm;
      maxHeight = Math.max(maxHeight, child.heightMm);
    }
    return { widthMm: cursorX, heightMm: maxHeight, leaves };
  }

  // direction 'v'
  let cursorY = 0;
  let maxWidth = 0;
  for (const child of childLayouts) {
    for (const leaf of child.leaves) {
      leaves.push({ ...leaf, xMm: leaf.xMm, yMm: leaf.yMm + cursorY });
    }
    cursorY += child.heightMm;
    maxWidth = Math.max(maxWidth, child.widthMm);
  }
  return { widthMm: maxWidth, heightMm: cursorY, leaves };
}

export function getCompositeBoundingSize(node) {
  const { widthMm, heightMm } = computeCompositeLayout(node);
  return { widthMm, heightMm };
}

// --- Conversions ancien <-> nouveau format -----------------------------
// Ancien format : rows = [{ id, modules:[module…] } …] (rangées empilées,
// modules côte à côte). -> v[ h[feuilles] … ], puis collapse mono-enfant.
export function rowsToTree(rows) {
  const safeRows = Array.isArray(rows) ? rows.filter((r) => Array.isArray(r?.modules)) : [];
  if (safeRows.length === 0) return null;

  const rowNodes = safeRows.map((row, ri) => {
    const leaves = (row.modules.length ? row.modules : [null]).map((module, mi) =>
      makeLeaf(module?.id || `leaf-${ri + 1}-${mi + 1}`, module || {})
    );
    return makeSplit(row.id ? `h-${row.id}` : `h-${ri + 1}`, 'h', leaves);
  });

  return collapseSingleChild(makeSplit('v-root', 'v', rowNodes));
}

// Arbre -> rangées « héritées » (filet de sécurité pour d'éventuels lecteurs
// non migrés). Exact pour un arbre v-de-h ou plus simple ; repli = une seule
// rangée contenant toutes les feuilles pour les arbres réellement récursifs.
const nodeToRow = (node, idx) => {
  if (isLeaf(node)) return { id: `row-${idx + 1}`, modules: [node.module] };
  if (isSplit(node) && node.direction === 'h' && node.children.every(isLeaf)) {
    return { id: node.id || `row-${idx + 1}`, modules: node.children.map((c) => c.module) };
  }
  return null; // non représentable en rangée simple
};

export function treeToRows(node) {
  if (!isTreeNode(node)) return [];
  if (isLeaf(node)) return [{ id: 'row-1', modules: [node.module] }];

  if (node.direction === 'v') {
    const rows = node.children.map((child, idx) => nodeToRow(child, idx));
    if (rows.every(Boolean)) return rows;
  } else {
    const single = nodeToRow(node, 0);
    if (single) return [single];
  }

  // Repli : arbre récursif non représentable -> une rangée de toutes les feuilles.
  return [{ id: 'row-1', modules: collectLeaves(node).map((leaf) => leaf.module) }];
}
