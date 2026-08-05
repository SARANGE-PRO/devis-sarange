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

console.log('qr-code.test.mjs : tous les tests passent');
