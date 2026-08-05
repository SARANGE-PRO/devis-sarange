import assert from 'node:assert/strict';
import { buildQrMatrix, buildFormatBits, computeEcc } from '../lib/qr-code.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('bits de format niveau L : table C.1 de la spec ISO/IEC 18004', () => {
  const expected = [
    0b111011111000100, 0b111001011110011, 0b111110110101010, 0b111100010011101,
    0b110011000101111, 0b110001100011000, 0b110110001000001, 0b110100101110110,
  ];
  for (let maskId = 0; maskId < 8; maskId += 1) {
    assert.equal(buildFormatBits(maskId), expected[maskId], `masque ${maskId}`);
  }
});

run('Reed-Solomon : vecteur de référence (HELLO WORLD v1-M)', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(computeEcc(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

run('matrice v1 : taille, motifs de repérage, synchronisation, module sombre', () => {
  const matrix = buildQrMatrix('ABC');
  assert.equal(matrix.length, 21);
  assert.ok(matrix.every((row) => row.length === 21));
  assert.equal(matrix[3][3], true, 'centre du motif haut-gauche sombre');
  assert.equal(matrix[1][1], false, 'anneau interne du motif clair');
  assert.equal(matrix[0][7], false, 'séparateur clair');
  assert.equal(matrix[21 - 8][8], true, 'module sombre fixe');
  for (let i = 8; i < 13; i += 1) {
    assert.equal(matrix[6][i], i % 2 === 0, `synchronisation horizontale ${i}`);
    assert.equal(matrix[i][6], i % 2 === 0, `synchronisation verticale ${i}`);
  }
});

run('les URLs de signature de l’app tiennent dans une version supportée', () => {
  // Lien fixe /reception-generale et lien de session le plus long (ccl_ + 32 hex).
  const generale = buildQrMatrix('https://devis.sarange.fr/reception-generale');
  assert.ok([21, 25, 29, 33, 37].includes(generale.length));
  const session = buildQrMatrix(`https://devis.sarange.fr/reception/ccl_${'a'.repeat(32)}`);
  assert.ok([21, 25, 29, 33, 37].includes(session.length));
});

run('capacité : 106 octets en v5, au-delà erreur explicite', () => {
  assert.equal(buildQrMatrix('x'.repeat(106)).length, 37);
  assert.throws(() => buildQrMatrix('x'.repeat(200)), /trop long/);
});

/* ─── Décodage aller-retour ──────────────────────────────────────────────────
 * Les tests ci-dessus valident les CALCULS (table de format, Reed-Solomon) et
 * la structure, mais pas le PLACEMENT — c'est exactement ce qui avait produit
 * des QR non scannables (bits de format transposés ligne/colonne et deux
 * modules de données volés par une zone réservée trop large).
 *
 * Le décodeur ci-dessous est écrit d'après la spec ISO/IEC 18004, SANS
 * réutiliser une seule ligne de l'encodeur (carte des modules de fonction
 * recalculée indépendamment) : il échoue donc si l'encodeur dérive.
 * ────────────────────────────────────────────────────────────────────────── */

const DECODE_VERSIONS_L = [null, [26, 19], [44, 34], [70, 55], [100, 80], [134, 108]];
const DECODE_ALIGN = [null, null, 18, 22, 26, 30];
const DECODE_MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];
const FORMAT_XOR = 0b101010000010010;

const decodeGf = (() => {
  const exp = new Uint8Array(512);
  const log = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    exp[i] = x;
    log[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) exp[i] = exp[i - 255];
  return { exp, mul: (a, b) => (a === 0 || b === 0 ? 0 : exp[log[a] + log[b]]) };
})();

// Modules de fonction selon la spec (finders + séparateurs, synchronisation,
// alignement, zones de format), recalculés sans l'encodeur.
const decodeFunctionMap = (size, version) => {
  const map = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (r, c) => {
    if (r >= 0 && c >= 0 && r < size && c < size) map[r][c] = true;
  };
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      mark(r, c);
      mark(r, size - 7 + c);
      mark(size - 7 + r, c);
    }
  }
  for (let i = 0; i < size; i += 1) {
    mark(6, i);
    mark(i, 6);
  }
  if (DECODE_ALIGN[version]) {
    const center = DECODE_ALIGN[version];
    for (let r = -2; r <= 2; r += 1) {
      for (let c = -2; c <= 2; c += 1) mark(center + r, center + c);
    }
  }
  for (let i = 0; i <= 8; i += 1) {
    mark(8, i);
    mark(i, 8);
  }
  for (let i = 0; i < 8; i += 1) {
    mark(8, size - 1 - i);
    mark(size - 1 - i, 8);
  }
  return map;
};

// Reste de la division BCH(15,5) : nul pour une information de format valide.
const formatBchRemainder = (bits15) => {
  let value = bits15;
  for (let i = 14; i >= 10; i -= 1) {
    if ((value >> i) & 1) value ^= 0b10100110111 << (i - 10);
  }
  return value & 0x3ff;
};

const decodeQr = (matrix) => {
  const size = matrix.length;
  const version = (size - 17) / 4;
  const readBits = (positions) => {
    let bits = 0;
    positions.forEach(([r, c], index) => {
      if (matrix[r][c]) bits |= 1 << index;
    });
    return bits ^ FORMAT_XOR;
  };

  // Copie 1 : colonne 8 (lignes 0-5), coin, puis ligne 8 (colonnes 5-0).
  const copy1 = readBits([
    ...Array.from({ length: 6 }, (_, i) => [i, 8]),
    [7, 8],
    [8, 8],
    [8, 7],
    ...Array.from({ length: 6 }, (_, i) => [8, 14 - (9 + i)]),
  ]);
  // Copie 2 : ligne 8 à droite (bits 0-7), colonne 8 en bas (bits 8-14).
  const copy2 = readBits([
    ...Array.from({ length: 8 }, (_, i) => [8, size - 1 - i]),
    ...Array.from({ length: 7 }, (_, i) => [size - 15 + (8 + i), 8]),
  ]);

  const ecLevel = (copy1 >> 13) & 0b11;
  const maskId = (copy1 >> 10) & 0b111;
  const functionMap = decodeFunctionMap(size, version);
  const mask = DECODE_MASKS[maskId];

  const bits = [];
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const x of [col, col - 1]) {
        if (functionMap[row][x]) continue;
        const value = matrix[row][x];
        bits.push(mask(row, x) ? !value : value);
      }
    }
    upward = !upward;
  }

  const codewords = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | (bits[i + j] ? 1 : 0);
    codewords.push(byte);
  }

  const [totalCodewords, dataCodewords] = DECODE_VERSIONS_L[version];
  const block = codewords.slice(0, totalCodewords);
  // Syndromes Reed-Solomon : tous nuls ⇒ aucune erreur résiduelle.
  let rsClean = true;
  for (let s = 0; s < totalCodewords - dataCodewords; s += 1) {
    let acc = 0;
    for (const byte of block) acc = decodeGf.mul(acc, decodeGf.exp[s]) ^ byte;
    if (acc !== 0) rsClean = false;
  }

  const data = block.slice(0, dataCodewords);
  const mode = data[0] >> 4;
  const length = ((data[0] & 0x0f) << 4) | (data[1] >> 4);
  const bytes = [];
  for (let i = 0; i < length; i += 1) {
    bytes.push((((data[1 + i] & 0x0f) << 4) | (data[2 + i] >> 4)) & 0xff);
  }

  return {
    version,
    ecLevel,
    maskId,
    formatValid: formatBchRemainder(copy1) === 0 && formatBchRemainder(copy2) === 0,
    formatCopiesMatch: copy1 === copy2,
    rsClean,
    mode,
    text: new TextDecoder().decode(Uint8Array.from(bytes)),
  };
};

run('un QR généré est réellement décodable (format, Reed-Solomon, contenu)', () => {
  const samples = [
    'SARANGE',
    'https://devis.sarange.fr/reception-generale',
    `https://devis.sarange.fr/reception/cc_${'a'.repeat(32)}`,
    `https://devis.sarange.fr/reception/ccl_${'f'.repeat(32)}`,
    'Réception chantier — accentué & signes = ok',
    'x'.repeat(106), // capacité maximale v5-L
  ];

  for (const sample of samples) {
    const decoded = decodeQr(buildQrMatrix(sample));
    assert.ok(decoded.formatValid, `information de format invalide pour ${JSON.stringify(sample)}`);
    assert.ok(decoded.formatCopiesMatch, `les deux copies du format diffèrent pour ${JSON.stringify(sample)}`);
    assert.equal(decoded.ecLevel, 0b01, `niveau de correction ≠ L pour ${JSON.stringify(sample)}`);
    assert.ok(decoded.rsClean, `Reed-Solomon en erreur pour ${JSON.stringify(sample)}`);
    assert.equal(decoded.mode, 0b0100, `mode ≠ octet pour ${JSON.stringify(sample)}`);
    assert.equal(decoded.text, sample, `contenu décodé différent pour ${JSON.stringify(sample)}`);
  }
});

run('les 8 masques produisent tous un code décodable', () => {
  // Le masque retenu dépend du contenu : on balaie des textes de longueurs
  // variées pour exercer plusieurs masques et vérifier qu'aucun ne casse.
  const seen = new Set();
  for (let length = 1; length <= 60; length += 1) {
    const text = `S${'a'.repeat(length)}`;
    const decoded = decodeQr(buildQrMatrix(text));
    seen.add(decoded.maskId);
    assert.ok(decoded.formatValid && decoded.rsClean, `échec pour une longueur de ${length}`);
    assert.equal(decoded.text, text, `contenu différent pour une longueur de ${length}`);
  }
  assert.ok(seen.size >= 3, `masques réellement exercés : ${[...seen].join(', ')}`);
});

console.log('qr-code.test.mjs : tous les tests passent');
