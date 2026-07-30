#!/usr/bin/env node
/**
 * update-dgfip-vat-index.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Actualise la copie locale de l'extraction DGFiP « Numéros de TVA
 * intracommunautaire français » (data.gouv.fr), indexée par SIREN.
 *
 * Lancement :
 *   npm run update-dgfip-vat-index
 *   node scripts/update-dgfip-vat-index.mjs
 *   (ou via une tâche planifiée quotidienne / hebdomadaire)
 *
 * Configuration (valeurs par défaut du jeu officiel) :
 *   TVA_DGFIP_DATASET_ID    identifiant TECHNIQUE permanent data.gouv.fr
 *                           (le slug, lui, peut changer)
 *   TVA_DGFIP_INDEX_PATH    chemin du fichier d'index
 *   TVA_DGFIP_MIN_ENTRIES   seuil minimal d'entrées pour accepter un index
 *
 * L'index n'est remplacé que si le nouveau est entièrement valide ; sinon le
 * dernier index valide est conservé. En cas d'échec, le script termine avec un
 * CODE DE SORTIE NON NUL pour qu'une tâche planifiée ou une supervision le
 * détecte — une ressource inchangée n'est pas un échec (code 0).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  UPDATE_OUTCOMES,
  getDgfipIndexStaleAlert,
  isSuccessfulUpdate,
  updateDgfipVatIndex,
} from '../lib/dgfip-vat-index-builder.mjs';

// Jeu de données officiel « Numéros de TVA intracommunautaire français »,
// publié par les ministères économiques et financiers (éditeur : DGFiP).
const DEFAULT_DATASET_ID = '6a2b4e2393218f1e63d7389b';
const DEFAULT_INDEX_PATH = 'data/dgfip-vat-index.json';

// Racine du projet déduite de l'emplacement du script (scripts/..) : le
// chemin de l'index ne dépend JAMAIS du répertoire depuis lequel la commande
// est lancée.
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIGURED_INDEX_PATH = process.env.TVA_DGFIP_INDEX_PATH || DEFAULT_INDEX_PATH;
const INDEX_PATH = isAbsolute(CONFIGURED_INDEX_PATH)
  ? CONFIGURED_INDEX_PATH
  : resolve(PROJECT_ROOT, CONFIGURED_INDEX_PATH);
const DATASET_ID = process.env.TVA_DGFIP_DATASET_ID || DEFAULT_DATASET_ID;
const MIN_ENTRIES = Number.parseInt(process.env.TVA_DGFIP_MIN_ENTRIES || '1', 10) || 1;
const DATA_GOUV_API = 'https://www.data.gouv.fr/api/1/datasets';
const METADATA_TIMEOUT_MS = 60000;
// L'extraction complète pèse plusieurs centaines de Mo : délai large, adapté à
// une tâche planifiée.
const DOWNLOAD_TIMEOUT_MS = 900000;

const fetchDataset = async () => {
  const response = await fetch(`${DATA_GOUV_API}/${encodeURIComponent(DATASET_ID)}/`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`data.gouv.fr a répondu ${response.status}`);
  }

  return response.json();
};

const fetchResource = async (resource) => {
  const response = await fetch(resource.url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Téléchargement impossible (HTTP ${response.status})`);
  }

  return {
    content: await response.text(),
    etag: response.headers.get('etag') || '',
  };
};

const readCurrentIndex = async () => {
  try {
    const raw = await readFile(INDEX_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    // L'index sur disque porte ses métadonnées à plat ; on les expose sous la
    // forme attendue par le constructeur.
    return { metadata: parsed };
  } catch {
    return null;
  }
};

// Écriture ATOMIQUE : fichier temporaire complet, puis renommage. L'ancien
// index reste intact si l'écriture échoue en cours de route.
const writeIndexAtomically = async (index) => {
  const temporaryPath = `${INDEX_PATH}.tmp`;

  try {
    await mkdir(dirname(INDEX_PATH), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(index), 'utf8');
    await rename(temporaryPath, INDEX_PATH);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
};

// Compte rendu de lecture, quel que soit le résultat.
const printReadReport = (result, exitCode) => {
  if (result.totalRows === undefined) return;

  console.log(
    [
      `Lignes lues : ${result.totalRows}`,
      `acceptées : ${result.acceptedRows}`,
      `rejetées : ${result.rejectedRows}`,
      `motif principal : ${result.mainRejectionReason || 'aucun'}`,
      `code de sortie : ${exitCode}`,
    ].join(' | ')
  );
};

const main = async () => {
  if (!INDEX_PATH || !DATASET_ID) {
    console.error(
      'Configuration incomplète : renseignez TVA_DGFIP_INDEX_PATH et TVA_DGFIP_DATASET_ID.'
    );
    return 1;
  }

  const result = await updateDgfipVatIndex({
    fetchDataset,
    fetchResource,
    readCurrentIndex,
    writeIndexAtomically,
    minEntries: MIN_ENTRIES,
  });

  // Succès : index actualisé, ou ressource inchangée (aucun téléchargement).
  const exitCode = isSuccessfulUpdate(result.outcome) ? 0 : 1;

  switch (result.outcome) {
    case UPDATE_OUTCOMES.UPDATED:
      console.log(
        `Index DGFiP actualisé : ${result.entryCount} entrées (extraction publiée le ${result.publishedAt || 'date inconnue'}).`
      );
      break;
    case UPDATE_OUTCOMES.UNCHANGED:
      console.log(
        `Extraction DGFiP inchangée : aucun téléchargement (${result.entryCount} entrées conservées).`
      );
      break;
    case UPDATE_OUTCOMES.REJECTED_PRODUCER:
      console.error(`Mise à jour refusée : ${result.message}`);
      break;
    case UPDATE_OUTCOMES.INVALID_INDEX:
      console.error(
        `Index refusé (${result.reason}) : ancien index conservé${result.message ? ` — ${result.message}` : ''}.`
      );
      break;
    default:
      console.error(
        `Mise à jour impossible (${result.outcome}) : ${result.message || 'index précédent conservé'}.`
      );
      break;
  }

  printReadReport(result, exitCode);

  // Alerte d'obsolescence, quel que soit le résultat.
  const current = await readCurrentIndex();
  const staleAlert = getDgfipIndexStaleAlert(current?.metadata);
  if (staleAlert) console.warn(staleAlert);

  return exitCode;
};

// L'application n'est jamais interrompue, mais un échec doit rester DÉTECTABLE
// par la tâche planifiée ou la supervision : code de sortie non nul.
main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error('Mise à jour de l’index DGFiP interrompue :', error?.message || error);
    process.exitCode = 1;
  });
