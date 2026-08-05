/**
 * qr-code.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Générateur de QR code LOCAL, sans dépendance ni service externe (le rendu
 * via api.qrserver.com était bloqué chez certains utilisateurs — un QR à
 * faire scanner sur chantier doit fonctionner partout, y compris hors
 * connexion une fois la page chargée).
 *
 * Périmètre volontairement réduit — largement suffisant pour des URLs de
 * signature (< 100 caractères) :
 *  - mode BYTE uniquement ;
 *  - niveau de correction L, versions 1 à 5 : un SEUL bloc Reed-Solomon
 *    (aucun entrelacement, la partie la plus piégeuse de la spec) ;
 *  - masque choisi parmi les 8 par la règle de pénalité n°1 (suites de
 *    modules identiques), suffisant pour un code bien lisible.
 *
 * Module pur : testable par le runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// [totalCodewords, dataCodewords] par version (1-5), niveau L, mono-bloc.
const VERSIONS_L = [
  null,
  [26, 19],
  [44, 34],
  [70, 55],
  [100, 80],
  [134, 108],
];

const ALIGNMENT_CENTER = [null, null, 18, 22, 26, 30];

/* ─── Corps de Galois GF(256), polynôme 0x11D ────────────────────────────── */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]);

// Polynôme générateur Reed-Solomon de degré n.
const buildGenerator = (degree) => {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= gfMul(poly[j], GF_EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
};

// Exporté uniquement pour les tests (vecteur Reed-Solomon de référence).
export const computeEcc = (data, eccLength) => {
  // buildGenerator renvoie les coefficients en ordre ascendant (constante en
  // premier) ; la division polynomiale attend l'ordre descendant SANS le
  // terme de tête (polynôme unitaire).
  const divisor = buildGenerator(eccLength).slice(0, eccLength).reverse();
  const remainder = new Array(eccLength).fill(0);
  data.forEach((byte) => {
    const factor = byte ^ remainder.shift();
    remainder.push(0);
    if (factor !== 0) {
      for (let i = 0; i < eccLength; i += 1) {
        remainder[i] ^= gfMul(divisor[i], factor);
      }
    }
  });
  return remainder;
};

/* ─── Encodage des données (mode byte) ───────────────────────────────────── */

const encodeData = (bytes, version) => {
  const [totalCodewords, dataCodewords] = VERSIONS_L[version];
  const bits = [];
  const pushBits = (value, count) => {
    for (let i = count - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };

  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  bytes.forEach((byte) => pushBits(byte, 8));

  // Terminateur (jusqu'à 4 bits de zéros) + alignement sur l'octet.
  const capacityBits = dataCodewords * 8;
  pushBits(0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  // Octets de bourrage alternés (spec) jusqu'à remplir la capacité.
  const padding = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < dataCodewords) {
    codewords.push(padding[padIndex]);
    padIndex = 1 - padIndex;
  }

  return [...codewords, ...computeEcc(codewords, totalCodewords - dataCodewords)];
};

/* ─── Construction de la matrice ─────────────────────────────────────────── */

const placeFinder = (modules, reserved, row, col) => {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const y = row + r;
      const x = col + c;
      if (y < 0 || x < 0 || y >= modules.length || x >= modules.length) continue;
      const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6);
      const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      modules[y][x] = inOuter || inInner;
      reserved[y][x] = true;
    }
  }
};

const placeAlignment = (modules, reserved, center) => {
  for (let r = -2; r <= 2; r += 1) {
    for (let c = -2; c <= 2; c += 1) {
      const y = center + r;
      const x = center + c;
      if (reserved[y][x]) return; // chevauche un motif de repérage : ignoré
    }
  }
  for (let r = -2; r <= 2; r += 1) {
    for (let c = -2; c <= 2; c += 1) {
      const y = center + r;
      const x = center + c;
      modules[y][x] = Math.max(Math.abs(r), Math.abs(c)) !== 1;
      reserved[y][x] = true;
    }
  }
};

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

// Information de format : niveau L (01) + masque, BCH(15,5) puis masque fixe.
// Exporté uniquement pour les tests (vecteurs connus de la spec).
export const buildFormatBits = (maskId) => {
  const data = (0b01 << 3) | maskId;
  let value = data << 10;
  const generator = 0b10100110111;
  for (let i = 14; i >= 10; i -= 1) {
    if ((value >> i) & 1) value ^= generator << (i - 10);
  }
  return ((data << 10) | value) ^ 0b101010000010010;
};

// Placement des 15 bits de format (bit 0 = poids faible), spec ISO/IEC 18004
// §8.9. ATTENTION : `modules` est indexé [ligne][colonne]. Les
// implémentations de référence (Nayuki) exposent un helper (x, y) = (colonne,
// ligne) ; recopier leurs appels tels quels transpose le placement et rend le
// code illisible par tous les scanners (bug corrigé ici). Chaque affectation
// ci-dessous est donc annotée par sa position réelle.
const placeFormatBits = (modules, size, maskId) => {
  const bits = buildFormatBits(maskId);
  const bit = (i) => ((bits >> i) & 1) === 1;

  // Première copie, autour du motif haut-gauche :
  // bits 0-5 dans la COLONNE 8 (lignes 0-5), bits 9-14 dans la LIGNE 8.
  for (let i = 0; i <= 5; i += 1) modules[i][8] = bit(i);
  modules[7][8] = bit(6);
  modules[8][8] = bit(7);
  modules[8][7] = bit(8);
  for (let i = 9; i < 15; i += 1) modules[8][14 - i] = bit(i);

  // Seconde copie : bits 0-7 dans la LIGNE 8 à droite, bits 8-14 dans la
  // COLONNE 8 en bas.
  for (let i = 0; i < 8; i += 1) modules[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i += 1) modules[size - 15 + i][8] = bit(i);
  modules[size - 8][8] = true; // module sombre fixe
};

const countRunPenalty = (line) => {
  let penalty = 0;
  let run = 1;
  for (let i = 1; i <= line.length; i += 1) {
    if (i < line.length && line[i] === line[i - 1]) {
      run += 1;
    } else {
      if (run >= 5) penalty += 3 + (run - 5);
      run = 1;
    }
  }
  return penalty;
};

/**
 * Construit la matrice du QR code : tableau de lignes de booléens (true =
 * module sombre). Lève une erreur si le texte dépasse la capacité v5-L
 * (~106 caractères), jamais atteinte par les URLs de l'app.
 */
export const buildQrMatrix = (text) => {
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  let version = 0;
  for (let v = 1; v < VERSIONS_L.length; v += 1) {
    if (bytes.length <= VERSIONS_L[v][1] - 2) {
      version = v;
      break;
    }
  }
  if (!version) {
    throw new Error(`Texte trop long pour un QR v5-L (${bytes.length} octets).`);
  }

  const size = 17 + version * 4;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  placeFinder(modules, reserved, 0, 0);
  placeFinder(modules, reserved, 0, size - 7);
  placeFinder(modules, reserved, size - 7, 0);

  // Lignes de synchronisation.
  for (let i = 8; i < size - 8; i += 1) {
    if (!reserved[6][i]) {
      modules[6][i] = i % 2 === 0;
      reserved[6][i] = true;
    }
    if (!reserved[i][6]) {
      modules[i][6] = i % 2 === 0;
      reserved[i][6] = true;
    }
  }

  if (ALIGNMENT_CENTER[version]) {
    placeAlignment(modules, reserved, ALIGNMENT_CENTER[version]);
  }

  // Zones d'information de format (réservées avant placement des données).
  // Première copie : ligne 8 colonnes 0-8 ET colonne 8 lignes 0-8.
  for (let i = 0; i <= 8; i += 1) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  // Seconde copie : 8 modules seulement de chaque côté (ligne 8 à droite,
  // colonne 8 en bas, module sombre compris). Réserver un 9e module — l'écart
  // d'un `<= 8` — vole deux modules de DONNÉES et décale tout le flux binaire.
  for (let i = 0; i < 8; i += 1) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }

  // Placement des données en zigzag depuis le coin bas-droit.
  const codewords = encodeData(bytes, version);
  const bits = [];
  codewords.forEach((byte) => {
    for (let i = 7; i >= 0; i -= 1) bits.push((byte >> i) & 1);
  });

  let bitIndex = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5; // la colonne de synchronisation est sautée
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const x of [col, col - 1]) {
        if (reserved[row][x]) continue;
        modules[row][x] = bitIndex < bits.length ? bits[bitIndex] === 1 : false;
        bitIndex += 1;
      }
    }
    upward = !upward;
  }

  // Choix du masque : pénalité de la règle n°1 (lignes et colonnes).
  let bestMaskId = 0;
  let bestPenalty = Infinity;
  let bestModules = null;
  for (let maskId = 0; maskId < MASKS.length; maskId += 1) {
    const candidate = modules.map((rowValues, r) =>
      rowValues.map((value, c) => (reserved[r][c] ? value : MASKS[maskId](r, c) ? !value : value))
    );
    placeFormatBits(candidate, size, maskId);

    let penalty = 0;
    for (let r = 0; r < size; r += 1) {
      penalty += countRunPenalty(candidate[r]);
      penalty += countRunPenalty(candidate.map((line) => line[r]));
    }
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMaskId = maskId;
      bestModules = candidate;
    }
  }
  void bestMaskId;

  return bestModules;
};
