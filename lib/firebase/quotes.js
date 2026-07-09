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
import { generateQuoteNumber, normalizeQuoteSignatureStatus } from '@/lib/quote-signature';

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

// Sérialisation CANONIQUE pour comparer deux payloads « à contenu égal » :
//  • clés triées en profondeur → insensible à l'ordre des clés (Firestore renvoie
//    les objets dans un ordre différent de l'état mémoire, ce qui faisait diverger
//    JSON.stringify et déclenchait une invalidation de signature à tort) ;
//  • `customImage` exclu → asset d'affichage volatil (nulé au stockage si trop lourd),
//    jamais un changement substantiel du devis.
const canonicalizeForCompare = (value) => {
  if (Array.isArray(value)) return value.map(canonicalizeForCompare);
  if (
    value &&
    typeof value === 'object' &&
    Object.prototype.toString.call(value) === '[object Object]'
  ) {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        if (key === 'customImage') return accumulator;
        accumulator[key] = canonicalizeForCompare(value[key]);
        return accumulator;
      }, {});
  }
  return value;
};

const stringifyComparablePayload = (payload) =>
  JSON.stringify(canonicalizeForCompare(normalizeQuotePayload(payload)));

export async function saveQuoteDraft({
  userId,
  quoteId = null,
  title,
  clientData,
  cartItems,
  tvaRate,
  currentStep,
  quoteSettings,
  reference,
  variantsMode,
  variants,
  activeVariantId,
  status = null,
  // Sauvegarde faisant PARTIE d'un envoi : le serveur (re)crée une session juste
  // après, donc invalider la session existante ici est inutile et provoquait le bug
  // « devis modifié / lien inactif ». On neutralise l'invalidation dans ce cas.
  skipSignatureInvalidation = false,
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
    reference,
    variantsMode,
    variants,
    activeVariantId,
  });
  const payloadChanged =
    Boolean(existingQuote) &&
    stringifyComparablePayload(existingQuote.payload) !== stringifyComparablePayload(nextPayload);
  // Numéro de devis : figé à la 1re sauvegarde, régénéré UNIQUEMENT quand le contenu
  // change (modification). Un nouveau devis (création / duplication) n'a pas de numéro
  // existant → il en reçoit un neuf. Une re-sauvegarde ou un téléchargement à contenu
  // identique conserve donc exactement le même numéro (et la même date d'émission).
  const existingQuoteNumber =
    existingQuote?.quoteNumber || existingQuote?.signatureWorkflow?.quoteNumber || '';
  const shouldAssignQuoteNumber = !existingQuoteNumber || payloadChanged;
  const issuanceDate = new Date();
  const nextQuoteNumber = shouldAssignQuoteNumber
    ? generateQuoteNumber(issuanceDate)
    : existingQuoteNumber;

  const hasActiveSignatureSession = Boolean(existingQuote?.signatureWorkflow?.sessionId);
  const shouldInvalidateSignatureSession =
    !skipSignatureInvalidation &&
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
    reference: nextPayload.reference,
    variantsMode: nextPayload.variantsMode,
    variants: nextPayload.variants,
    activeVariantId: nextPayload.activeVariantId,
    status:
      status ||
      (shouldInvalidateSignatureSession ? 'draft' : existingQuote?.status) ||
      'draft',
  });
  const updatePayload = {
    ...record,
    quoteNumber: nextQuoteNumber,
    // Date d'émission alignée sur le numéro (même instant) ; conservée telle quelle
    // tant que le numéro n'est pas régénéré.
    ...(shouldAssignQuoteNumber ? { quoteIssuedAt: issuanceDate.toISOString() } : {}),
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
