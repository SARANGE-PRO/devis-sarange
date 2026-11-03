/**
 * pdf-progress.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Avancement de la génération d'un PDF, publié par lib/pdf-generator.js et lu
 * par le loader (components/usePdfProgress.js). Un seul PDF se génère à la
 * fois côté client : un état global suffit, sans rien faire transiter par les
 * props des composants.
 *
 * Module pur (aucun import) : importable par le runner Node des tests.
 * ─────────────────────────────────────────────────────────────────────────────
 */

let state = { active: false, value: 0 };
const listeners = new Set();
let endTimer = null;

const emit = (next) => {
  state = next;
  listeners.forEach((listener) => listener());
};

export const startPdfProgress = () => {
  clearTimeout(endTimer);
  emit({ active: true, value: 0 });
};

export const reportPdfProgress = (value) => {
  const clamped = Math.min(1, Math.max(0, Number(value) || 0));
  // Jamais de retour en arrière visible.
  if (!state.active || clamped <= state.value) return;
  emit({ active: true, value: clamped });
};

// La barre reste à 100 % un court instant : le loader de la génération se
// ferme pendant ce temps sans repasser par l'état indéterminé.
export const endPdfProgress = () => {
  reportPdfProgress(1);
  clearTimeout(endTimer);
  endTimer = setTimeout(() => emit({ active: false, value: 0 }), 400);
};

export const getPdfProgress = () => state;

export const subscribePdfProgress = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
