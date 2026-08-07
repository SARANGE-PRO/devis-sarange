import assert from 'node:assert/strict';
import {
  calculateGlassAreas,
  calculateSw,
  calculateUw,
  getFrameSystemForProduct,
} from '../lib/glazing.js';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

// Reproduit l'appel réel de lib/products.js (glassAreas -> calculateUw/calculateSw)
// pour le vitrage standard 4/16/4 Low-E 1.1 Argon (Ug=1.10, g=0.65).
const computeUwSw = (sheetName, widthMm, heightMm, ug = 1.1, g = 0.65) => {
  const frameSystem = getFrameSystemForProduct(sheetName);
  const glassAreas = calculateGlassAreas(widthMm, heightMm, frameSystem, sheetName);
  if (!glassAreas) return { uw: null, sw: null, glassAreas, frameSystem };

  const uw = calculateUw({
    Ag: glassAreas.Ag,
    Af: glassAreas.Af,
    Aw: glassAreas.Aw,
    Lg: glassAreas.Lg,
    Ug: ug,
    Uf: frameSystem.uf,
    psi: frameSystem.psi,
  });
  const sw = calculateSw({ Ag: glassAreas.Ag, Aw: glassAreas.Aw, g });

  return { uw, sw, glassAreas, frameSystem };
};

/* ─── Coefficients du système AWS 60 (analyse du 07/08/2026) ────────────── */

run('AWS 60 (alu, hors coulissant) : Uf=1.80 et Psi=0.049', () => {
  const frameSystem = getFrameSystemForProduct('Fenêtre 1V ALU');
  assert.equal(frameSystem.id, 'aws60');
  assert.equal(frameSystem.frameWidthMm, 105);
  assert.equal(frameSystem.uf, 1.8);
  assert.equal(frameSystem.psi, 0.049);
});

run("le coulissant alu ASS 41 SC (hors périmètre de l'analyse) garde ses valeurs historiques", () => {
  const frameSystem = getFrameSystemForProduct('Coulissant 2 vantaux 2 rails ALU');
  assert.equal(frameSystem.id, 'ass41sc');
  assert.equal(frameSystem.uf, 2.4);
  assert.equal(frameSystem.psi, 0.04);
});

run('le PVC CT70 est inchangé (Uf=1.3, Psi=0.04)', () => {
  const frameSystem = getFrameSystemForProduct('Fenêtre 1V');
  assert.equal(frameSystem.id, 'ct70');
  assert.equal(frameSystem.uf, 1.3);
  assert.equal(frameSystem.psi, 0.04);
});

/* ─── Exemples chiffrés de l'analyse (avec la correction -0,02 déjà en    ─── */
/* ─── place dans calculateUw, conservée pour l'AWS 60 comme pour le PVC) ─── */

run('Fenêtre 1 vantail ALU 420x1070 (F01) : Uw=1.73 / Sw=0.26', () => {
  const { uw, sw } = computeUwSw('Fenêtre 1V ALU', 420, 1070);
  assert.equal(uw, 1.73);
  assert.equal(sw, 0.26);
});

run('Porte-fenêtre 1 vantail ALU 830x2520 (F02) : traverse basse 225 mm -> Uw=1.46 / Sw=0.42', () => {
  const { uw, sw } = computeUwSw('Porte-Fenêtre 1V ALU', 830, 2520);
  assert.equal(uw, 1.46);
  assert.equal(sw, 0.42);
});

run('Fenêtre 1 vantail ALU 560x1070 (F03) : Uw=1.63 / Sw=0.33', () => {
  const { uw, sw } = computeUwSw('Fenêtre 1V ALU', 560, 1070);
  assert.equal(uw, 1.63);
  assert.equal(sw, 0.33);
});

run('Fenêtre 2 vantaux ALU 1020x2050 (F04/F05) : battement central -> Uw=1.53 / Sw=0.43', () => {
  const { uw, sw } = computeUwSw('Fenêtre 2V ALU', 1020, 2050);
  assert.equal(uw, 1.53);
  assert.equal(sw, 0.43);
});

run('Fenêtre 2 vantaux ALU 1020x850 (F06) : Uw=1.62 / Sw=0.36', () => {
  const { uw, sw } = computeUwSw('Fenêtre 2V ALU', 1020, 850);
  assert.equal(uw, 1.62);
  assert.equal(sw, 0.36);
});

run('Fenêtre 2 vantaux ALU 1400x1160 (F07) : Uw=1.50 / Sw=0.43', () => {
  const { uw, sw } = computeUwSw('Fenêtre 2V ALU', 1400, 1160);
  assert.equal(uw, 1.5);
  assert.equal(sw, 0.43);
});

run("Porte-fenêtre 2 vantaux ALU 1800x2300 (PF01) : pas de traverse renforcée au-delà de 1 vantail -> Uw=1.37 / Sw=0.50", () => {
  const { uw, sw } = computeUwSw('Porte-Fenêtre 2V ALU', 1800, 2300);
  assert.equal(uw, 1.37);
  assert.equal(sw, 0.5);
});

run('Porte-fenêtre 2 vantaux ALU 1020x2300 (PF02) : Uw=1.52 / Sw=0.43', () => {
  const { uw, sw } = computeUwSw('Porte-Fenêtre 2V ALU', 1020, 2300);
  assert.equal(uw, 1.52);
  assert.equal(sw, 0.43);
});

/* ─── Portée volontairement limitée à 1V/PF-1V/2V (décision du 07/08/2026) ─ */

run('Fenêtre 3 vantaux ALU : reste sur l’approximation à bordure unique (aucun meneau modélisé)', () => {
  const withThreeVantaux = computeUwSw('Fenêtre 3V ALU', 1500, 1200);
  const asSingleSection = computeUwSw('Fenêtre 1V ALU', 1500, 1200);
  assert.equal(withThreeVantaux.glassAreas.Ag, asSingleSection.glassAreas.Ag);
  assert.equal(withThreeVantaux.uw, asSingleSection.uw);
});

run('Fenêtre 2V+1F ALU : reste elle aussi sur l’approximation à bordure unique', () => {
  const withMixedSections = computeUwSw('Fenêtre 2V+1F ALU', 1800, 1300);
  const asSingleSection = computeUwSw('Fenêtre 1V ALU', 1800, 1300);
  assert.equal(withMixedSections.glassAreas.Ag, asSingleSection.glassAreas.Ag);
});

/* ─── Non-régression : PVC / coulissants ignorés par la nouvelle géométrie ─ */

run('Fenêtre 2 vantaux PVC : ignore le battement central (comportement historique inchangé)', () => {
  const frameSystem = getFrameSystemForProduct('Fenêtre 2V');
  const glassAreas = calculateGlassAreas(1020, 2050, frameSystem, 'Fenêtre 2V');
  const W = 1.02;
  const H = 2.05;
  const frame = frameSystem.frameWidthMm / 1000;
  const expectedAg = (W - 2 * frame) * (H - 2 * frame);
  assert.equal(frameSystem.id, 'ct70');
  assert.ok(Math.abs(glassAreas.Ag - expectedAg) < 1e-9);
});

/* ─── Cas limites ─────────────────────────────────────────────────────────*/

run('dimensions trop petites pour un vitrage AWS 60 2 vantaux -> null', () => {
  const frameSystem = getFrameSystemForProduct('Fenêtre 2V ALU');
  assert.equal(calculateGlassAreas(200, 1000, frameSystem, 'Fenêtre 2V ALU'), null);
});
