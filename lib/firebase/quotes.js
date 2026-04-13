import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { buildQuoteDraftRecord, normalizeQuotePayload } from '@/lib/quote-cloud';

const getQuotesCollection = (userId) => {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase n’est pas configuré.');
  if (!userId) throw new Error('Utilisateur manquant.');
  return collection(db, 'users', userId, 'quotes');
};

const getQuoteDocument = (userId, quoteId) => doc(getQuotesCollection(userId), quoteId);

const serializeQuoteSnapshot = (snapshot) => {
  if (!snapshot?.exists()) return null;

  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    payload: normalizeQuotePayload(data?.payload),
  };
};

export async function saveQuoteDraft({
  userId,
  quoteId = null,
  title,
  clientData,
  cartItems,
  tvaRate,
  currentStep,
  quoteSettings,
}) {
  const collectionRef = getQuotesCollection(userId);
  const documentRef = quoteId ? getQuoteDocument(userId, quoteId) : doc(collectionRef);
  const record = buildQuoteDraftRecord({
    title,
    clientData,
    cartItems,
    tvaRate,
    currentStep,
    quoteSettings,
  });

  await setDoc(
    documentRef,
    {
      ...record,
      updatedAt: serverTimestamp(),
      ...(quoteId ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true }
  );

  const savedSnapshot = await getDoc(documentRef);
  return serializeQuoteSnapshot(savedSnapshot);
}

export async function getQuoteById({ userId, quoteId }) {
  if (!quoteId) return null;
  const snapshot = await getDoc(getQuoteDocument(userId, quoteId));
  return serializeQuoteSnapshot(snapshot);
}

export function subscribeToUserQuotes({ userId, onNext, onError }) {
  const quotesQuery = query(getQuotesCollection(userId), orderBy('updatedAt', 'desc'));

  return onSnapshot(
    quotesQuery,
    (snapshot) => {
      onNext(snapshot.docs.map((entry) => serializeQuoteSnapshot(entry)).filter(Boolean));
    },
    onError
  );
}

export async function deleteQuoteById({ userId, quoteId }) {
  if (!quoteId) return;
  await deleteDoc(getQuoteDocument(userId, quoteId));
}
