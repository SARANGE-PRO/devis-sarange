// =====================================================================
// Châssis composés — MODÈLE « OSSATURE » (style PROGES25)
// ---------------------------------------------------------------------
// Module PUR (aucune dépendance) — importable par `node tests/*.mjs`.
//
// SOURCE DE VÉRITÉ (sérialisée sur l'article de devis) :
//   CompositeFrame {
//     version, overallWidthMm, overallHeightMm, minBandMm,
//     columns: DimensionBand[],            // largeurs gauche->droite
//     rows: DimensionBand[],               // hauteurs haut->bas
//     removedVerticalSegments: id[],       // tronçons de MONTANT retirés
//     removedHorizontalSegments: id[],     // tronçons de TRAVERSE retirés
//     placements: { [openingId]: ChassisPlacement }
//   }
//   DimensionBand   { id, mode:'fixed'|'auto', value, weight, minValue }
//   ChassisPlacement{ id, openingId, productId, options, computedWidthMm, computedHeightMm, status }
//
// TOUT le reste est DÉRIVÉ (positions d'axes, cellules, tronçons actifs,
// ouvertures) — jamais stocké en double. Les dimensions sont des ENTIERS
// (mm) pour éviter les erreurs de virgule flottante.
// =====================================================================

export const FRAME_VERSION = 2;
const DEFAULT_MIN_BAND = 50; // mm

// --- Identifiants stables -------------------------------------------------
let _seq = 0;
export const makeId = (prefix) => `${prefix}-${(_seq += 1)}`;
export const cellId = (rowBandId, colBandId) => `c|${rowBandId}|${colBandId}`;
export const vSegId = (rowBandId, leftColId, rightColId) => `vs|${rowBandId}|${leftColId}|${rightColId}`;
export const hSegId = (colBandId, topRowId, bottomRowId) => `hs|${colBandId}|${topRowId}|${bottomRowId}`;
export const openingIdFromCells = (cellIds) => `o|${[...cellIds].sort().join('+')}`;

const intMm = (value, fallback = 0) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : fallback;
};
const sum = (list) => list.reduce((total, v) => total + v, 0);

// --- Fabriques -----------------------------------------------------------
export function createBand({ id, mode = 'auto', value = 0, weight = 1, minValue } = {}) {
  return {
    id: id || makeId('band'),
    mode: mode === 'fixed' ? 'fixed' : 'auto',
    value: intMm(value, 0),
    weight: Number.isFinite(Number(weight)) && Number(weight) > 0 ? Number(weight) : 1,
    minValue: minValue == null ? null : intMm(minValue, 0),
  };
}

// Crée `count` bandes AUTO réparties également sur `total`.
export function createEqualBands(count, total, { minValue, idFactory = makeId } = {}) {
  const n = Math.max(1, Math.round(count));
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) =>
    createBand({
      id: idFactory('band'),
      mode: 'auto',
      // On amorce `value` avec la répartition égale (le solveur fait foi ensuite).
      value: base + (i === n - 1 ? remainder : 0),
      minValue,
    })
  );
}

// vCount / hCount = nombre d'ENTRAXES (0 entraxe = 1 bande).
export function createDefaultFrame(
  overallWidthMm,
  overallHeightMm,
  vEntraxes = 0,
  hEntraxes = 0,
  { minBandMm = DEFAULT_MIN_BAND, idFactory = makeId } = {}
) {
  const width = intMm(overallWidthMm, 1000);
  const height = intMm(overallHeightMm, 1000);
  return {
    version: FRAME_VERSION,
    overallWidthMm: width,
    overallHeightMm: height,
    minBandMm: intMm(minBandMm, DEFAULT_MIN_BAND),
    columns: createEqualBands(vEntraxes + 1, width, { minValue: minBandMm, idFactory }),
    rows: createEqualBands(hEntraxes + 1, height, { minValue: minBandMm, idFactory }),
    removedVerticalSegments: [],
    removedHorizontalSegments: [],
    placements: {},
    // Option composé (méta-donnée, n'affecte pas la géométrie) : volet monobloc.
    voletMonobloc: false,
    voletMonoblocManoeuvre: 'manuel',
  };
}

// =====================================================================
// SOLVEUR DE BANDES (FIXED / AUTO) — Σ = total, exact, sans NaN
// Renvoie { ok:true, values:int[] } ou { ok:false, error, message }.
// =====================================================================
export function solveDimensionBands(total, bands, { minValue = 0 } = {}) {
  const totalInt = intMm(total, NaN);
  if (!Number.isFinite(totalInt) || totalInt <= 0) {
    return { ok: false, error: 'INVALID_TOTAL', message: 'Dimension totale invalide.' };
  }
  if (!Array.isArray(bands) || bands.length === 0) {
    return { ok: false, error: 'NO_BANDS', message: 'Aucune bande.' };
  }

  const minOf = (band) => {
    const m = band.minValue == null ? minValue : band.minValue;
    return Number.isFinite(m) && m > 0 ? Math.round(m) : 0;
  };

  for (const band of bands) {
    if (band.mode === 'fixed' && (!Number.isFinite(Number(band.value)) || Number(band.value) < 0)) {
      return { ok: false, error: 'INVALID_FIXED_VALUE', message: 'Valeur fixe invalide.' };
    }
  }

  const fixedSum = sum(bands.filter((b) => b.mode === 'fixed').map((b) => intMm(b.value)));
  if (fixedSum > totalInt) {
    return {
      ok: false,
      error: 'FIXED_SUM_EXCEEDS_TOTAL',
      message: `La somme des dimensions fixes (${fixedSum}) dépasse le total (${totalInt}).`,
    };
  }

  const autoBands = bands.filter((b) => b.mode === 'auto');

  // Aucune bande AUTO : la somme fixe doit tomber juste, sinon erreur (jamais
  // de correction silencieuse — règle 8 / cas 5).
  if (autoBands.length === 0) {
    if (fixedSum !== totalInt) {
      return {
        ok: false,
        error: 'FIXED_SUM_MISMATCH',
        message: `Toutes les bandes sont fixes mais leur somme (${fixedSum}) ≠ total (${totalInt}).`,
      };
    }
    return { ok: true, values: bands.map((b) => intMm(b.value)) };
  }

  const remaining = totalInt - fixedSum;
  const minNeeded = sum(autoBands.map(minOf));
  if (remaining < minNeeded) {
    return {
      ok: false,
      error: 'NOT_ENOUGH_SPACE',
      message: `Espace restant (${remaining}) insuffisant pour les bandes automatiques.`,
    };
  }

  const sumWeights = sum(autoBands.map((b) => b.weight || 1)) || autoBands.length;
  // Répartition entière pondérée, reliquat affecté à la DERNIÈRE bande auto (règle 10).
  const autoValues = new Map();
  let distributed = 0;
  autoBands.forEach((band, index) => {
    if (index === autoBands.length - 1) {
      autoValues.set(band.id, remaining - distributed);
    } else {
      const v = Math.floor((remaining * (band.weight || 1)) / sumWeights);
      autoValues.set(band.id, v);
      distributed += v;
    }
  });

  // Respect des minimas : on ne corrige pas silencieusement, on signale.
  for (const band of autoBands) {
    if (autoValues.get(band.id) < minOf(band)) {
      return {
        ok: false,
        error: 'BELOW_MIN',
        message: 'Une bande automatique passerait sous sa dimension minimale.',
      };
    }
  }

  const values = bands.map((b) => (b.mode === 'fixed' ? intMm(b.value) : autoValues.get(b.id)));
  // Garantie dure : Σ = total.
  if (sum(values) !== totalInt) {
    return { ok: false, error: 'SUM_MISMATCH', message: 'Erreur de répartition.' };
  }
  return { ok: true, values };
}

// Positions cumulées : [0, v0, v0+v1, …, total]. Les axes internes = indices 1..n-1.
export function computeAxisPositions(values) {
  const positions = [0];
  values.forEach((v) => positions.push(positions[positions.length - 1] + v));
  return positions;
}

// Résout colonnes + lignes d'un frame. { ok, cols:int[], rows:int[], error? }.
export function solveFrame(frame) {
  const cols = solveDimensionBands(frame.overallWidthMm, frame.columns, { minValue: frame.minBandMm });
  if (!cols.ok) return { ok: false, axis: 'columns', ...cols };
  const rows = solveDimensionBands(frame.overallHeightMm, frame.rows, { minValue: frame.minBandMm });
  if (!rows.ok) return { ok: false, axis: 'rows', ...rows };
  return { ok: true, cols: cols.values, rows: rows.values };
}

// =====================================================================
// CELLULES & TRONÇONS
// =====================================================================
export function buildBaseCells(frame, solved) {
  const { cols, rows } = solved;
  const xs = computeAxisPositions(cols);
  const ys = computeAxisPositions(rows);
  const grid = [];
  for (let r = 0; r < frame.rows.length; r += 1) {
    const line = [];
    for (let c = 0; c < frame.columns.length; c += 1) {
      line.push({
        id: cellId(frame.rows[r].id, frame.columns[c].id),
        r,
        c,
        xMm: xs[c],
        yMm: ys[r],
        wMm: cols[c],
        hMm: rows[r],
      });
    }
    grid.push(line);
  }
  return grid;
}

export const verticalSegmentId = (frame, r, c) =>
  vSegId(frame.rows[r].id, frame.columns[c].id, frame.columns[c + 1].id);
export const horizontalSegmentId = (frame, r, c) =>
  hSegId(frame.columns[c].id, frame.rows[r].id, frame.rows[r + 1].id);

export const isVerticalSegmentActive = (frame, r, c) =>
  !frame.removedVerticalSegments.includes(verticalSegmentId(frame, r, c));
export const isHorizontalSegmentActive = (frame, r, c) =>
  !frame.removedHorizontalSegments.includes(horizontalSegmentId(frame, r, c));

// Liste tous les tronçons (actifs ou non) avec leur géométrie — pour le rendu/clic.
export function listSegments(frame, solved) {
  const grid = buildBaseCells(frame, solved);
  const segments = [];
  for (let r = 0; r < frame.rows.length; r += 1) {
    for (let c = 0; c < frame.columns.length; c += 1) {
      const cell = grid[r][c];
      if (c < frame.columns.length - 1) {
        segments.push({
          id: verticalSegmentId(frame, r, c),
          kind: 'vertical',
          active: isVerticalSegmentActive(frame, r, c),
          xMm: cell.xMm + cell.wMm,
          yMm: cell.yMm,
          lengthMm: cell.hMm,
        });
      }
      if (r < frame.rows.length - 1) {
        segments.push({
          id: horizontalSegmentId(frame, r, c),
          kind: 'horizontal',
          active: isHorizontalSegmentActive(frame, r, c),
          xMm: cell.xMm,
          yMm: cell.yMm + cell.hMm,
          lengthMm: cell.wMm,
        });
      }
    }
  }
  return segments;
}

// =====================================================================
// OUVERTURES (union-find sur les cellules)
// Deux cellules voisines fusionnent si le tronçon entre elles est SUPPRIMÉ.
// =====================================================================
export function computeOpenings(frame, solvedInput) {
  const solved = solvedInput || solveFrame(frame);
  if (!solved.ok) return { ok: false, error: solved.error, message: solved.message, openings: [] };

  const grid = buildBaseCells(frame, solved);
  const nRows = frame.rows.length;
  const nCols = frame.columns.length;
  const parent = Array.from({ length: nRows * nCols }, (_, i) => i);
  const find = (x) => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {
      const next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const idx = (r, c) => r * nCols + c;

  for (let r = 0; r < nRows; r += 1) {
    for (let c = 0; c < nCols; c += 1) {
      if (c < nCols - 1 && !isVerticalSegmentActive(frame, r, c)) union(idx(r, c), idx(r, c + 1));
      if (r < nRows - 1 && !isHorizontalSegmentActive(frame, r, c)) union(idx(r, c), idx(r + 1, c));
    }
  }

  const groups = new Map();
  for (let r = 0; r < nRows; r += 1) {
    for (let c = 0; c < nCols; c += 1) {
      const root = find(idx(r, c));
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(grid[r][c]);
    }
  }

  const openings = [...groups.values()].map((cells) => {
    const rMin = Math.min(...cells.map((c) => c.r));
    const rMax = Math.max(...cells.map((c) => c.r));
    const cMin = Math.min(...cells.map((c) => c.c));
    const cMax = Math.max(...cells.map((c) => c.c));
    const rectangular = cells.length === (rMax - rMin + 1) * (cMax - cMin + 1);
    const xMm = grid[rMin][cMin].xMm;
    const yMm = grid[rMin][cMin].yMm;
    const wMm = sum(grid[rMin].slice(cMin, cMax + 1).map((c) => c.wMm));
    const hMm = sum(grid.slice(rMin, rMax + 1).map((line) => line[cMin].hMm));
    return {
      id: openingIdFromCells(cells.map((c) => c.id)),
      cells: cells.map((c) => ({ r: c.r, c: c.c, id: c.id })),
      rMin,
      rMax,
      cMin,
      cMax,
      rectangular,
      xMm,
      yMm,
      wMm,
      hMm,
    };
  });

  // Tri stable (haut->bas, gauche->droite) pour un affichage déterministe.
  openings.sort((a, b) => a.rMin - b.rMin || a.cMin - b.cMin);
  return { ok: true, openings, cells: grid, solved };
}

export const isRectangularOpening = (opening) => Boolean(opening && opening.rectangular);

// =====================================================================
// MUTATIONS PURES (renvoient un NOUVEAU frame)
// =====================================================================
const cloneFrame = (frame) => ({
  ...frame,
  columns: frame.columns.map((b) => ({ ...b })),
  rows: frame.rows.map((b) => ({ ...b })),
  removedVerticalSegments: [...frame.removedVerticalSegments],
  removedHorizontalSegments: [...frame.removedHorizontalSegments],
  placements: { ...frame.placements },
});

export function toggleSegment(frame, segmentId) {
  const next = cloneFrame(frame);
  const key = segmentId.startsWith('vs|') ? 'removedVerticalSegments' : 'removedHorizontalSegments';
  if (next[key].includes(segmentId)) next[key] = next[key].filter((id) => id !== segmentId);
  else next[key] = [...next[key], segmentId];
  return next;
}

export function setSegmentActive(frame, segmentId, active) {
  const isRemoved = (frame.removedVerticalSegments.includes(segmentId) ||
    frame.removedHorizontalSegments.includes(segmentId));
  if (active === !isRemoved) return frame;
  return toggleSegment(frame, segmentId);
}

// Impose une bande (FIXED) à une valeur, recalcule le reste via le solveur.
export function setBandValue(frame, axis, bandId, value) {
  const next = cloneFrame(frame);
  const bands = axis === 'columns' ? next.columns : next.rows;
  const band = bands.find((b) => b.id === bandId);
  if (!band) return frame;
  band.mode = 'fixed';
  band.value = intMm(value);
  return refreshBandValues(next);
}

export function setBandMode(frame, axis, bandId, mode) {
  const next = cloneFrame(frame);
  const bands = axis === 'columns' ? next.columns : next.rows;
  const band = bands.find((b) => b.id === bandId);
  if (!band) return frame;
  band.mode = mode === 'fixed' ? 'fixed' : 'auto';
  return refreshBandValues(next);
}

// Met à jour les `value` (cache) des bandes auto depuis le solveur, si résoluble.
export function refreshBandValues(frame) {
  const next = cloneFrame(frame);
  const cols = solveDimensionBands(next.overallWidthMm, next.columns, { minValue: next.minBandMm });
  if (cols.ok) next.columns.forEach((b, i) => { b.value = cols.values[i]; });
  const rows = solveDimensionBands(next.overallHeightMm, next.rows, { minValue: next.minBandMm });
  if (rows.ok) next.rows.forEach((b, i) => { b.value = rows.values[i]; });
  return next;
}

// Ajoute un entraxe en divisant la bande sélectionnée en deux (auto, égales).
export function addEntraxe(frame, axis, bandId, { idFactory = makeId } = {}) {
  const next = cloneFrame(frame);
  const bands = axis === 'columns' ? next.columns : next.rows;
  const index = bandId ? bands.findIndex((b) => b.id === bandId) : bands.length - 1;
  if (index < 0) return frame;
  const band = bands[index];
  const half = Math.floor(intMm(band.value) / 2);
  const a = createBand({ id: band.id, mode: 'auto', value: half, minValue: band.minValue });
  const b = createBand({ id: idFactory('band'), mode: 'auto', value: intMm(band.value) - half, minValue: band.minValue });
  bands.splice(index, 1, a, b);
  return refreshBandValues(next);
}

// Supprime un entraxe : fusionne la bande avec sa voisine (droite si possible).
export function removeEntraxe(frame, axis, bandId) {
  const next = cloneFrame(frame);
  const bands = axis === 'columns' ? next.columns : next.rows;
  if (bands.length <= 1) return frame;
  const index = bands.findIndex((b) => b.id === bandId);
  if (index < 0) return frame;
  const mergeInto = index < bands.length - 1 ? index + 1 : index - 1;
  const removedBand = bands[index];
  bands[mergeInto].value = intMm(bands[mergeInto].value) + intMm(removedBand.value);
  bands.splice(index, 1);
  // Nettoie les tronçons supprimés qui référençaient la bande disparue.
  next.removedVerticalSegments = next.removedVerticalSegments.filter((id) => !id.includes(removedBand.id));
  next.removedHorizontalSegments = next.removedHorizontalSegments.filter((id) => !id.includes(removedBand.id));
  return refreshBandValues(next);
}

// =====================================================================
// PLACEMENTS DE CHÂSSIS & RÉCONCILIATION
// =====================================================================
export function reconcileChassisPlacements(previousOpenings, newOpenings, placements) {
  const newById = new Map(newOpenings.map((o) => [o.id, o]));
  const nextPlacements = {};
  const conflicts = [];
  Object.values(placements || {}).forEach((placement) => {
    const opening = newById.get(placement.openingId);
    if (opening) {
      nextPlacements[opening.id] = {
        ...placement,
        computedWidthMm: opening.wMm,
        computedHeightMm: opening.hMm,
        status: 'placed',
      };
    } else {
      // Jamais de suppression silencieuse : on conserve en conflit.
      conflicts.push({ ...placement, status: 'conflict' });
    }
  });
  return { placements: nextPlacements, conflicts };
}

export function placeChassis(frame, openingId, opening, { productId, options = {}, idFactory = makeId }) {
  const next = cloneFrame(frame);
  next.placements[openingId] = {
    id: next.placements[openingId]?.id || idFactory('place'),
    openingId,
    productId,
    options,
    computedWidthMm: opening.wMm,
    computedHeightMm: opening.hMm,
    status: 'placed',
  };
  return next;
}

export function clearPlacement(frame, openingId) {
  const next = cloneFrame(frame);
  delete next.placements[openingId];
  return next;
}

// =====================================================================
// VALIDATION (section 13)
// =====================================================================
export function validateCompositeFrame(frame) {
  const errors = [];
  if (!frame || typeof frame !== 'object') return { ok: false, errors: ['Données absentes.'] };
  if (!(intMm(frame.overallWidthMm) > 0)) errors.push('Largeur totale invalide.');
  if (!(intMm(frame.overallHeightMm) > 0)) errors.push('Hauteur totale invalide.');

  const solved = solveFrame(frame);
  if (!solved.ok) errors.push(solved.message || 'Contrainte de dimensions non satisfaite.');

  let openingsResult = { openings: [] };
  if (solved.ok) {
    openingsResult = computeOpenings(frame, solved);
    if (openingsResult.openings.some((o) => !o.rectangular)) {
      errors.push('Une ou plusieurs ouvertures ne sont pas rectangulaires.');
    }
    const openingIds = new Set(openingsResult.openings.map((o) => o.id));
    Object.values(frame.placements || {}).forEach((placement) => {
      if (placement.status === 'conflict') {
        errors.push('Un châssis est en conflit (ouverture modifiée).');
      } else if (!openingIds.has(placement.openingId)) {
        errors.push('Un châssis est affecté à une ouverture inexistante.');
      }
    });
  }

  return { ok: errors.length === 0, errors, openings: openingsResult.openings };
}

// =====================================================================
// SÉRIALISATION & MIGRATION
// =====================================================================
export function serializeCompositeFrame(frame) {
  return {
    version: FRAME_VERSION,
    overallWidthMm: intMm(frame.overallWidthMm),
    overallHeightMm: intMm(frame.overallHeightMm),
    minBandMm: intMm(frame.minBandMm, DEFAULT_MIN_BAND),
    columns: frame.columns.map((b) => createBand(b)),
    rows: frame.rows.map((b) => createBand(b)),
    removedVerticalSegments: [...(frame.removedVerticalSegments || [])],
    removedHorizontalSegments: [...(frame.removedHorizontalSegments || [])],
    placements: { ...(frame.placements || {}) },
    voletMonobloc: Boolean(frame.voletMonobloc),
    voletMonoblocManoeuvre: frame.voletMonoblocManoeuvre || 'manuel',
  };
}

export function normalizeCompositeFrame(data) {
  if (data && data.version === FRAME_VERSION && Array.isArray(data.columns) && Array.isArray(data.rows)) {
    return serializeCompositeFrame(data);
  }
  return migrateLegacyCompositeFrame(data);
}

// Migration des anciens formats (rangées, arbre de divisions, modules à plat)
// vers le modèle « ossature ». Best-effort : les anciens devis restent lisibles.
export function migrateLegacyCompositeFrame(data, { idFactory = makeId } = {}) {
  // Déjà au nouveau format.
  if (data && data.version === FRAME_VERSION) return serializeCompositeFrame(data);

  // Collecte des modules + de leur disposition en rangées.
  let rows = [];
  if (Array.isArray(data) && data.some((row) => Array.isArray(row?.modules))) {
    rows = data.map((row) => (Array.isArray(row.modules) ? row.modules : []));
  } else if (data && Array.isArray(data.modules)) {
    rows = [data.modules];
  } else if (Array.isArray(data)) {
    rows = [data];
  }

  const flat = rows.flat().filter(Boolean);
  if (flat.length === 0) {
    return createDefaultFrame(1000, 1000, 0, 0, { idFactory });
  }

  // Cas régulier : toutes les rangées ont le même nombre de modules -> grille propre.
  const colCount = Math.max(...rows.map((r) => r.length));
  const regular = rows.every((r) => r.length === colCount) && colCount > 0;

  const widthOf = (m) => intMm(m?.widthMm ?? m?.largeur, 0);
  const heightOf = (m) => intMm(m?.heightMm ?? m?.hauteur, 0);

  if (regular) {
    const refRow = rows[0];
    const columns = refRow.map((m, c) =>
      createBand({ id: idFactory('band'), mode: 'fixed', value: widthOf(m) || 1, minValue: undefined })
    );
    const rowBands = rows.map((r) =>
      createBand({ id: idFactory('band'), mode: 'fixed', value: Math.max(...r.map(heightOf), 1) })
    );
    const overallWidthMm = sum(columns.map((b) => b.value));
    const overallHeightMm = sum(rowBands.map((b) => b.value));
    const frame = {
      version: FRAME_VERSION,
      overallWidthMm,
      overallHeightMm,
      minBandMm: DEFAULT_MIN_BAND,
      columns,
      rows: rowBands,
      removedVerticalSegments: [],
      removedHorizontalSegments: [],
      placements: {},
    };
    const solved = solveFrame(frame);
    const opened = computeOpenings(frame, solved);
    // Une ouverture par cellule (grille pleine) -> place chaque module.
    opened.openings.forEach((opening) => {
      const legacyModule = rows[opening.rMin]?.[opening.cMin];
      if (legacyModule) {
        frame.placements[opening.id] = {
          id: idFactory('place'),
          openingId: opening.id,
          productId: legacyModule.productId || legacyModule.type || null,
          options: legacyModule.options || {},
          computedWidthMm: opening.wMm,
          computedHeightMm: opening.hMm,
          status: 'placed',
        };
      }
    });
    return frame;
  }

  // Irrégulier : repli sur une seule rangée de toutes les feuilles.
  const columns = flat.map((m) => createBand({ id: idFactory('band'), mode: 'fixed', value: widthOf(m) || 1 }));
  const overallWidthMm = sum(columns.map((b) => b.value));
  const overallHeightMm = Math.max(...flat.map(heightOf), 1);
  const frame = {
    version: FRAME_VERSION,
    overallWidthMm,
    overallHeightMm,
    minBandMm: DEFAULT_MIN_BAND,
    columns,
    rows: [createBand({ id: idFactory('band'), mode: 'fixed', value: overallHeightMm })],
    removedVerticalSegments: [],
    removedHorizontalSegments: [],
    placements: {},
  };
  const opened = computeOpenings(frame);
  opened.openings.forEach((opening) => {
    const legacyModule = flat[opening.cMin];
    if (legacyModule) {
      frame.placements[opening.id] = {
        id: idFactory('place'),
        openingId: opening.id,
        productId: legacyModule.productId || legacyModule.type || null,
        options: legacyModule.options || {},
        computedWidthMm: opening.wMm,
        computedHeightMm: opening.hMm,
        status: 'placed',
      };
    }
  });
  return frame;
}

// Conversion mm <-> pixels pour le rendu (les données métier restent en mm).
export function makeScale(frame, pxWidth, pxHeight, { padding = 0 } = {}) {
  const w = intMm(frame.overallWidthMm, 1);
  const h = intMm(frame.overallHeightMm, 1);
  const scale = Math.min((pxWidth - padding * 2) / w, (pxHeight - padding * 2) / h);
  return {
    scale,
    toPx: (mm) => mm * scale,
    xPx: (mm) => padding + mm * scale,
    yPx: (mm) => padding + mm * scale,
  };
}
