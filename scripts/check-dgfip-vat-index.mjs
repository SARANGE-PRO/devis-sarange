#!/usr/bin/env node
/**
 * check-dgfip-vat-index.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Supervision de l'index DGFiP des numéros de TVA, et vérification après
 * déploiement. À lancer :
 *   npm run check-dgfip-vat-index             (index PUBLIÉ sur GitHub Releases)
 *   npm run check-dgfip-vat-index -- --local  (index LOCAL de développement)
 *
 * Contrôles (code de sortie 1 dès qu'un seul échoue) :
 *   - index présent et lisible (producteur DGFiP vérifié) ;
 *   - index actualisé depuis moins de vingt et un jours ;
 *   - volume d'entrées cohérent (~4,8 millions attendus) ;
 *   - sonde fonctionnelle : SIREN 820001014 -> FR22820001014 ;
 *   - sonde négative : un SIREN inconnu ne produit PAS de faux VERIFIED_DGFIP.
 *
 * Exécuté par GitHub Actions après chaque publication : toute alerte est
 * écrite sur la sortie d'erreur et le code de sortie devient non nul, ce qui
 * marque l'exécution en échec (et déclenche les notifications GitHub).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIGURED_INDEX_PATH = process.env.TVA_DGFIP_INDEX_PATH || 'data/dgfip-vat-index.json';

// Le lecteur résout un chemin relatif depuis le répertoire courant : on lui
// fournit un chemin ABSOLU avant de l'importer, pour que la vérification ne
// dépende pas du répertoire depuis lequel la commande est lancée.
process.env.TVA_DGFIP_INDEX_PATH = isAbsolute(CONFIGURED_INDEX_PATH)
  ? CONFIGURED_INDEX_PATH
  : resolve(PROJECT_ROOT, CONFIGURED_INDEX_PATH);

// Mode LOCAL sur demande : l'index publié est ignoré.
if (process.argv.includes('--local')) process.env.DGFIP_INDEX_BASE_URL = 'off';

const { getDgfipIndexStatus, lookupVatNumberInDgfipIndex } = await import(
  '../lib/dgfip-vat-index.js'
);
const {
  getDgfipRemoteBaseUrl,
  getDgfipRemoteStatus,
  isDgfipRemoteConfigured,
  lookupVatNumberInDgfipRemote,
} = await import('../lib/dgfip-vat-remote.js');
const { getDgfipIndexHealth } = await import('../lib/dgfip-vat-index-builder.mjs');
const { VAT_LOOKUP_OUTCOMES } = await import('../lib/vat-verification.mjs');

const useRemote = isDgfipRemoteConfigured();

const loadStatus = async () => {
  if (!useRemote) {
    const status = await getDgfipIndexStatus();
    return { metadata: status.metadata, error: '', lookup: lookupVatNumberInDgfipIndex };
  }

  const status = await getDgfipRemoteStatus();
  const manifest = status.manifest;

  return {
    // getDgfipIndexHealth attend `refreshedAt` : le manifeste porte la date de
    // génération de la version publiée.
    metadata: manifest ? { ...manifest, refreshedAt: manifest.generatedAt } : null,
    error: status.error || '',
    lookup: lookupVatNumberInDgfipRemote,
  };
};

// Sondes fonctionnelles : SARANGE d'une part, SIREN inexistant d'autre part.
const PROBE_SIREN = '820001014';
const PROBE_EXPECTED_VAT = 'FR22820001014';
const UNKNOWN_SIREN = '999999999';

const problems = [];
const report = (label, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
};

const { metadata, error, lookup } = await loadStatus();
const health = getDgfipIndexHealth(metadata);

console.log(
  useRemote
    ? `Mode PUBLIÉ — GitHub Releases : ${getDgfipRemoteBaseUrl()}`
    : `Mode LOCAL — ${process.env.TVA_DGFIP_INDEX_PATH}`
);

report('Index présent et lisible', Boolean(metadata), error);

if (metadata) {
  console.log(
    [
      `  producteur : ${metadata.producer}`,
      `version : ${metadata.version || 'locale'}`,
      `publication : ${metadata.publishedAt || 'inconnue'}`,
      `actualisé : ${metadata.refreshedAt}`,
      `entrées : ${metadata.entryCount}`,
    ].join(' | ')
  );

  report(
    'Index actualisé depuis moins de vingt et un jours',
    !health.issues.includes('index-obsolete'),
    `${health.ageInDays} jour(s)`
  );
  report(
    'Volume d’entrées cohérent',
    !health.issues.includes('volume-anormalement-faible'),
    `${health.entryCount} entrées`
  );

  const probe = await lookup(PROBE_SIREN);
  report(
    `Sonde ${PROBE_SIREN} -> ${PROBE_EXPECTED_VAT}`,
    probe.outcome === VAT_LOOKUP_OUTCOMES.VERIFIED && probe.vatNumber === PROBE_EXPECTED_VAT,
    probe.vatNumber || probe.outcome
  );

  const unknown = await lookup(UNKNOWN_SIREN);
  report(
    `Sonde négative ${UNKNOWN_SIREN} -> NOT_FOUND_DGFIP`,
    unknown.outcome === VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP && !unknown.vatNumber,
    unknown.outcome
  );
}

if (health.alerts.length > 0) {
  console.error('\n--- ALERTES ---');
  health.alerts.forEach((alert) => console.error(alert));
}

const exitCode = problems.length === 0 ? 0 : 1;
console.log(`\n${problems.length} contrôle(s) en échec | code de sortie : ${exitCode}`);
process.exitCode = exitCode;
