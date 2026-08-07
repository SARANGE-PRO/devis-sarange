import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { buildCatalogueRecord, normalizeCataloguePayload } from '@/lib/catalogue-cloud';
import { getFirebaseDb } from '@/lib/firebase/client';

const getCatalogueDocument = (userId) => {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase n'est pas configure.");
  if (!userId) throw new Error('Utilisateur manquant.');
  return doc(db, 'users', userId, 'catalogue', 'config');
};

const serializeCatalogueSnapshot = (snapshot) => {
  if (!snapshot?.exists()) return null;

  const data = snapshot.data();
  const payload = normalizeCataloguePayload(data);

  return {
    id: snapshot.id,
    ...data,
    ...payload,
  };
};

export async function getUserCatalogueConfig({ userId }) {
  const snapshot = await getDoc(getCatalogueDocument(userId));
  return serializeCatalogueSnapshot(snapshot);
}

export async function saveUserCatalogueConfig({
  userId,
  coefficients,
  pricing,
  customGlazingOptions,
}) {
  const documentRef = getCatalogueDocument(userId);
  const existingSnapshot = await getDoc(documentRef);
  const record = buildCatalogueRecord({
    coefficients,
    pricing,
    customGlazingOptions,
  });

  // ÉCRITURE EN REMPLACEMENT — surtout pas `{ merge: true }`.
  //
  // Un réglage remis à sa valeur par défaut n'est pas stocké : la clé est
  // SUPPRIMÉE de la carte (coefficient produit revenu à 1, surcharge de prix
  // de vitrage ou de pièce détachée effacée). Avec une fusion, un champ absent
  // du payload reste dans le document : la suppression ne partait jamais, et
  // l'écoute temps réel réhydratait l'ancienne valeur par-dessus la nouvelle.
  // Résultat : impossible de remettre un coefficient à 1, il « revenait ».
  //
  // Le record ci-dessus contient TOUT le document (schemaVersion,
  // coefficients, pricing, customGlazingOptions) : le remplacer est donc sans
  // perte, à condition de reconduire `createdAt`, que la fusion préservait
  // implicitement.
  await setDoc(documentRef, {
    ...record,
    createdAt: existingSnapshot.exists()
      ? existingSnapshot.data()?.createdAt ?? serverTimestamp()
      : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const savedSnapshot = await getDoc(documentRef);
  return serializeCatalogueSnapshot(savedSnapshot);
}

export function subscribeToUserCatalogueConfig({ userId, onNext, onError }) {
  return onSnapshot(
    getCatalogueDocument(userId),
    (snapshot) => {
      onNext(serializeCatalogueSnapshot(snapshot));
    },
    onError
  );
}
