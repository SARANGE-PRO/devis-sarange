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
import { normalizeQuoteSignatureStatus } from '@/lib/quote-signature';

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

const stringifyComparablePayload = (payload) => JSON.stringify(normalizeQuotePayload(payload));

export async function saveQuoteDraft({
  userId,
  quoteId = null,
  title,
  clientData,
  cartItems,
  tvaRate,
  currentStep,
  quoteSettings,
  status = null,
}) {
  const collectionRef = getQuotesCollection(userId);
  const documentRef = quoteId ? getQuoteDocument(userId, quoteId) : doc(collectionRef);
  const existingSnapshot = quoteId ? await getDoc(documentRef) : null;
  const existingQuote = serializeQuoteSnapshot(existingSnapshot);
  const nextPayload = normalizeQuotePayload({
    clientData,
    cartItems,
    tvaRate,
    currentStep,
    quoteSettings,
  });
  const payloadChanged =
    Boolean(existingQuote) &&
    stringifyComparablePayload(existingQuote.payload) !== stringifyComparablePayload(nextPayload);
  const hasActiveSignatureSession = Boolean(existingQuote?.signatureWorkflow?.sessionId);
  const shouldInvalidateSignatureSession =
    payloadChanged &&
    hasActiveSignatureSession &&
    ['sent', 'viewed', 'signed', 'refused', 'expired'].includes(
      normalizeQuoteSignatureStatus(existingQuote?.signatureWorkflow?.status || existingQuote?.status)
    );
  const record = buildQuoteDraftRecord({
    title,
    clientData: nextPayload.clientData,
    cartItems: nextPayload.cartItems,
    tvaRate: nextPayload.tvaRate,
    currentStep: nextPayload.currentStep,
    quoteSettings: nextPayload.quoteSettings,
    status:
      status ||
      (shouldInvalidateSignatureSession ? 'draft' : existingQuote?.status) ||
      'draft',
  });
  const updatePayload = {
    ...record,
    updatedAt: serverTimestamp(),
    ...(quoteId ? {} : { createdAt: serverTimestamp() }),
  };

  if (shouldInvalidateSignatureSession) {
    updatePayload.signatureWorkflow = {
      ...existingQuote.signatureWorkflow,
      status: 'draft',
      sessionId: null,
      deliveryMode: null,
      signingUrl: null,
      originalPdfPath: null,
      originalFilename: null,
      signedPdfPath: null,
      signedFilename: null,
      signedPdfAvailable: false,
      viewedAt: null,
      signedAt: null,
      refusedAt: null,
      expiredAt: null,
      sentAt: null,
      needsResend: true,
      invalidReason: 'quote-updated',
      invalidatedAt: serverTimestamp(),
      lastKnownStatus: normalizeQuoteSignatureStatus(
        existingQuote?.signatureWorkflow?.status || existingQuote?.status
      ),
    };
  }

  await setDoc(
    documentRef,
    updatePayload,
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
