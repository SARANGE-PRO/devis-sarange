/**
 * firebase/compta.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Miroir Firestore FACULTATIF de l'onglet Compta (export Sage 50).
 *
 * La source de vérité de l'onglet est LOCALE (lib/compta-local.mjs,
 * localStorage du poste où Sage est installé) : la génération et le
 * téléchargement des CSV ne dépendent jamais de ce module. Quand le réglage
 * « Synchronisation Firestore » est activé (désactivé par défaut), les
 * paramètres et l'historique sont recopiés ici en best-effort :
 *
 *  • users/{uid}/compta/settings      : copie des paramètres d'export ;
 *  • users/{uid}/comptaExports/{id}   : copie des exports (même id que local) ;
 *  • users/{uid}/quotes/{quoteId}.comptaExport : résumé dénormalisé facultatif.
 *
 * Toute erreur (règles non déployées, hors connexion…) doit être interceptée
 * par l'appelant : elle n'empêche JAMAIS un CSV d'être généré ou téléchargé.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { removeUndefinedDeep } from '@/lib/quote-cloud';
import { normalizeComptaSettings } from '@/lib/sage-export.mjs';

const requireDb = () => {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase n'est pas configuré.");
  return db;
};

const getComptaSettingsDocument = (userId) => {
  if (!userId) throw new Error('Utilisateur manquant.');
  return doc(requireDb(), 'users', userId, 'compta', 'settings');
};

const getComptaExportsCollection = (userId) => {
  if (!userId) throw new Error('Utilisateur manquant.');
  return collection(requireDb(), 'users', userId, 'comptaExports');
};

const getQuoteDocument = (userId, quoteId) =>
  doc(requireDb(), 'users', userId, 'quotes', quoteId);

/* ─── Paramètres Compta (miroir) ─────────────────────────────────────────── */
export async function getComptaSettings({ userId }) {
  const snapshot = await getDoc(getComptaSettingsDocument(userId));
  return normalizeComptaSettings(snapshot.exists() ? snapshot.data() : {});
}

export async function saveComptaSettings({ userId, settings }) {
  const documentRef = getComptaSettingsDocument(userId);
  const record = normalizeComptaSettings(settings);

  await setDoc(
    documentRef,
    {
      ...record,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return record;
}

export function subscribeToComptaSettings({ userId, onNext, onError }) {
  return onSnapshot(
    getComptaSettingsDocument(userId),
    (snapshot) => {
      onNext(normalizeComptaSettings(snapshot.exists() ? snapshot.data() : {}));
    },
    onError
  );
}

/* ─── Historique des exports (miroir) ────────────────────────────────────── */
export function subscribeToComptaExports({ userId, onNext, onError }) {
  const exportsQuery = query(
    getComptaExportsCollection(userId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    exportsQuery,
    (snapshot) => {
      onNext(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    },
    onError
  );
}

// Résumé écrit sur le devis. Volontairement via `setDoc merge` sur le seul champ
// comptaExport : un export n'est PAS une modification du devis (updatedAt intact,
// pas d'invalidation de signature). Purement informatif : l'onglet Compta ne le
// lit plus, il fonctionne entièrement sur l'historique local.
const writeQuoteComptaSummary = async (userId, quoteId, summary) => {
  if (!quoteId) return;
  await setDoc(
    getQuoteDocument(userId, quoteId),
    { comptaExport: removeUndefinedDeep(summary) },
    { merge: true }
  );
};

/**
 * Recopie un enregistrement d'export local dans Firestore (même id) et passe
 * l'éventuel export remplacé en « Remplacé ». Best-effort : à appeler dans un
 * try/catch, jamais sur le chemin critique du téléchargement.
 */
export async function mirrorComptaExportRecord({ userId, record, replacesExportId = null }) {
  const collectionRef = getComptaExportsCollection(userId);

  await setDoc(doc(collectionRef, record.id), {
    ...removeUndefinedDeep(record),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (replacesExportId) {
    await setDoc(
      doc(collectionRef, replacesExportId),
      {
        status: 'replaced',
        replacedByExportId: record.id,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  await writeQuoteComptaSummary(userId, record.quoteId, {
    exportId: record.id,
    status: record.status,
    externalId: record.externalId || null,
    contentHash: record.contentHash || null,
    generatedAtIso: record.generatedAtIso || null,
    version: record.version || 1,
    filename: record.filename || null,
  });
}

/**
 * Recopie un changement de statut local (imported / cancelled) dans Firestore.
 * Best-effort également.
 */
export async function mirrorComptaExportStatus({ userId, record }) {
  const documentRef = doc(getComptaExportsCollection(userId), record.id);

  await setDoc(
    documentRef,
    removeUndefinedDeep({
      status: record.status,
      importedAtIso: record.importedAtIso || null,
      cancelledAtIso: record.cancelledAtIso || null,
      updatedAt: serverTimestamp(),
    }),
    { merge: true }
  );

  if (record.quoteId) {
    const quoteSnapshot = await getDoc(getQuoteDocument(userId, record.quoteId));
    const summary = quoteSnapshot.exists() ? quoteSnapshot.data()?.comptaExport : null;
    if (summary?.exportId === record.id) {
      await writeQuoteComptaSummary(userId, record.quoteId, {
        ...summary,
        status: record.status,
      });
    }
  }
}
