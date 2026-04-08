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
import {
  buildClientRecord,
  deriveClientDocumentId,
  hasMeaningfulClientData,
  sanitizeClientData,
} from '@/lib/client-cloud';

const getClientsCollection = (userId) => {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase n'est pas configure.");
  if (!userId) throw new Error('Utilisateur manquant.');
  return collection(db, 'users', userId, 'clients');
};

const getClientDocument = (userId, clientId) => doc(getClientsCollection(userId), clientId);

const serializeClientSnapshot = (snapshot) => {
  if (!snapshot?.exists()) return null;

  const data = snapshot.data();

  return {
    id: snapshot.id,
    ...data,
    payload: sanitizeClientData(data?.payload),
  };
};

export async function saveClientProfile({ userId, clientId = null, clientData }) {
  const normalized = sanitizeClientData(clientData);

  if (!hasMeaningfulClientData(normalized)) {
    throw new Error('Renseignez au moins un nom, un email, un telephone ou une adresse.');
  }

  const resolvedClientId = clientId || deriveClientDocumentId(normalized);
  if (!resolvedClientId) {
    throw new Error("Impossible d'identifier cette fiche client.");
  }

  const record = buildClientRecord({
    ...normalized,
    savedClientId: resolvedClientId,
  });

  const documentRef = getClientDocument(userId, resolvedClientId);
  const existingSnapshot = await getDoc(documentRef);

  await setDoc(
    documentRef,
    {
      ...record,
      updatedAt: serverTimestamp(),
      lastUsedAt: serverTimestamp(),
      ...(existingSnapshot.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true }
  );

  const savedSnapshot = await getDoc(documentRef);
  return serializeClientSnapshot(savedSnapshot);
}

export async function getClientById({ userId, clientId }) {
  if (!clientId) return null;
  const snapshot = await getDoc(getClientDocument(userId, clientId));
  return serializeClientSnapshot(snapshot);
}

export async function deleteClientById({ userId, clientId }) {
  if (!clientId) return;
  await deleteDoc(getClientDocument(userId, clientId));
}

export function subscribeToUserClients({ userId, onNext, onError }) {
  const clientsQuery = query(getClientsCollection(userId), orderBy('lastUsedAt', 'desc'));

  return onSnapshot(
    clientsQuery,
    (snapshot) => {
      onNext(snapshot.docs.map((entry) => serializeClientSnapshot(entry)).filter(Boolean));
    },
    onError
  );
}
