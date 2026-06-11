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

  await setDoc(
    documentRef,
    {
      ...record,
      updatedAt: serverTimestamp(),
      ...(existingSnapshot.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true }
  );

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
