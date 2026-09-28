import 'server-only';

import crypto from 'node:crypto';

import { FieldValue } from 'firebase-admin/firestore';

import {
  getFirebaseAdminDb,
  getFirebaseAdminStorage,
  resolveUserAccess,
} from '@/lib/firebase/admin';
import {
  COMMISSION_SOURCES,
  DEFAULT_COMMISSION_STATUS,
  MAX_COMMISSION_DOCUMENTS,
  MAX_COMMISSION_DOCUMENT_BYTES,
  buildLeadDossierLabel,
  normalizeCommissionDossier,
  sanitizeCommissionDossierInput,
} from '@/lib/commission-dossiers.mjs';

/**
 * Dossiers de commission (page discrète /commissions) : collection Firestore
 * `commissionDossiers` et documents joints dans Firebase Storage sous
 * `commission-dossiers/{dossierId}/`. SERVEUR UNIQUEMENT (Admin SDK, règles
 * Firestore fermées), toutes les fonctions exigent un administrateur, sauf la
 * création depuis un lead du site (route /api/leads, authentifiée par secret).
 */

const COLLECTION = 'commissionDossiers';
const STORAGE_ROOT = 'commission-dossiers';

/** Marge : le base64 gonfle d'un tiers par rapport au fichier utile. */
const MAX_DOCUMENT_BASE64_LENGTH = Math.ceil((MAX_COMMISSION_DOCUMENT_BYTES * 4) / 3) + 16;

const DOCUMENT_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const createHttpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const requireCommissionsAdmin = async (decodedToken) => {
  const access = await resolveUserAccess(decodedToken, { fresh: true });
  if (!access.isAdmin) {
    throw createHttpError("Réservé aux administrateurs de l'application.", 403);
  }
  return access;
};

const toIsoString = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const serializeDossier = (snapshot) => {
  const data = snapshot.data() || {};
  return normalizeCommissionDossier({
    ...data,
    id: snapshot.id,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    documents: (Array.isArray(data.documents) ? data.documents : []).map((entry) => ({
      ...entry,
      uploadedAt: toIsoString(entry?.uploadedAt),
    })),
  });
};

const readDossierSnapshot = async (dossierId) => {
  const id = String(dossierId || '').trim();
  if (!id) throw createHttpError('Dossier introuvable.', 404);
  const snapshot = await getFirebaseAdminDb().collection(COLLECTION).doc(id).get();
  if (!snapshot.exists) throw createHttpError('Dossier introuvable.', 404);
  return snapshot;
};

export const listCommissionDossiers = async (decodedToken) => {
  await requireCommissionsAdmin(decodedToken);
  const snapshot = await getFirebaseAdminDb()
    .collection(COLLECTION)
    .orderBy('createdAt', 'desc')
    .get();
  return snapshot.docs.map(serializeDossier);
};

export const createCommissionDossier = async (decodedToken, data) => {
  await requireCommissionsAdmin(decodedToken);
  const updates = sanitizeCommissionDossierInput(data);
  const reference = getFirebaseAdminDb()
    .collection(COLLECTION)
    .doc(`cd_${crypto.randomBytes(8).toString('hex')}`);
  await reference.set({
    label: updates.label || 'Nouveau dossier',
    status: updates.status || DEFAULT_COMMISSION_STATUS,
    purchasePrice: updates.purchasePrice ?? null,
    salePrice: updates.salePrice ?? null,
    paidAmount: updates.paidAmount ?? 0,
    source: COMMISSION_SOURCES.MANUAL,
    documents: [],
    createdBy: decodedToken?.email || '',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return reference.id;
};

export const updateCommissionDossier = async (decodedToken, dossierId, data) => {
  await requireCommissionsAdmin(decodedToken);
  const snapshot = await readDossierSnapshot(dossierId);
  const updates = sanitizeCommissionDossierInput(data);
  if (Object.keys(updates).length === 0) {
    throw createHttpError('Aucune modification fournie.', 400);
  }
  await snapshot.ref.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
};

export const deleteCommissionDossier = async (decodedToken, dossierId) => {
  await requireCommissionsAdmin(decodedToken);
  const snapshot = await readDossierSnapshot(dossierId);
  await snapshot.ref.delete();
  // Nettoyage des documents joints : best-effort, un fichier orphelin dans
  // Storage ne gêne personne alors qu'une suppression bloquée gênerait.
  try {
    await getFirebaseAdminStorage()
      .bucket()
      .deleteFiles({ prefix: `${STORAGE_ROOT}/${snapshot.id}/` });
  } catch (error) {
    console.error('Nettoyage Storage du dossier commission impossible :', error);
  }
};

/**
 * Création idempotente d'un dossier depuis un lead du site internet (route
 * /api/leads, authentifiée par SITE_LEADS_SECRET : pas de compte utilisateur).
 * L'identifiant `lead-{clientId}` garantit qu'une re-soumission du formulaire
 * ne crée pas de doublon et n'écrase pas un statut déjà avancé.
 */
export const createLeadCommissionDossier = async ({ clientId, label }) => {
  const id = String(clientId || '').trim();
  if (!id) return { created: false };
  const reference = getFirebaseAdminDb().collection(COLLECTION).doc(`lead-${id}`);
  const existing = await reference.get();
  if (existing.exists) return { created: false };
  await reference.set({
    label: String(label || '').trim() || 'Demande du site',
    status: DEFAULT_COMMISSION_STATUS,
    purchasePrice: null,
    salePrice: null,
    paidAmount: 0,
    source: COMMISSION_SOURCES.WEBSITE,
    leadClientId: id,
    documents: [],
    createdBy: 'site-web',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { created: true };
};

/**
 * Rattrapage : crée les dossiers manquants pour toutes les demandes de prix
 * déjà reçues du site (fiches `leadSource == 'site-web'` du compte bureau).
 * Idempotent grâce aux identifiants `lead-{clientId}`.
 */
export const importLeadCommissionDossiers = async (decodedToken) => {
  await requireCommissionsAdmin(decodedToken);
  const ownerUid = (process.env.SITE_LEADS_OWNER_UID || '').trim();
  if (!ownerUid) {
    throw createHttpError(
      "Import impossible : la variable SITE_LEADS_OWNER_UID n'est pas configurée.",
      503
    );
  }

  const leads = await getFirebaseAdminDb()
    .collection(`users/${ownerUid}/clients`)
    .where('leadSource', '==', 'site-web')
    .get();

  let created = 0;
  for (const doc of leads.docs) {
    const data = doc.data() || {};
    const result = await createLeadCommissionDossier({
      clientId: doc.id,
      label: buildLeadDossierLabel({ nom: data.displayName || data.fullName, ville: data.city }),
    });
    if (result.created) created += 1;
  }
  return { scanned: leads.size, created };
};

// ---------------------------------------------------------------------------
// Documents joints à un dossier
// ---------------------------------------------------------------------------

const sanitizeFilename = (value) => {
  const name = String(value || '').trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_');
  return name.slice(-120) || 'document';
};

export const addCommissionDocument = async (
  decodedToken,
  { dossierId, filename, contentType, dataBase64 }
) => {
  await requireCommissionsAdmin(decodedToken);
  const snapshot = await readDossierSnapshot(dossierId);

  const documents = Array.isArray(snapshot.data()?.documents) ? snapshot.data().documents : [];
  if (documents.length >= MAX_COMMISSION_DOCUMENTS) {
    throw createHttpError(`Nombre maximum de documents atteint (${MAX_COMMISSION_DOCUMENTS}).`, 400);
  }

  if (typeof dataBase64 !== 'string' || !dataBase64 || dataBase64.length > MAX_DOCUMENT_BASE64_LENGTH) {
    throw createHttpError('Fichier invalide ou trop lourd (3 Mo maximum).', 400);
  }
  const buffer = Buffer.from(dataBase64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_COMMISSION_DOCUMENT_BYTES) {
    throw createHttpError('Fichier invalide ou trop lourd (3 Mo maximum).', 400);
  }

  const safeContentType = DOCUMENT_CONTENT_TYPES.has(String(contentType || '').toLowerCase())
    ? String(contentType).toLowerCase()
    : 'application/octet-stream';
  const name = sanitizeFilename(filename);
  const documentId = `doc_${crypto.randomBytes(8).toString('hex')}`;
  const path = `${STORAGE_ROOT}/${snapshot.id}/${documentId}-${name}`;

  await getFirebaseAdminStorage()
    .bucket()
    .file(path)
    .save(buffer, {
      resumable: false,
      metadata: { contentType: safeContentType, cacheControl: 'private, max-age=0, no-store' },
    });

  await snapshot.ref.update({
    // Pas de FieldValue.serverTimestamp() DANS un tableau : Firestore le
    // refuse, on horodate avec une vraie Date.
    documents: [
      ...documents,
      {
        id: documentId,
        name,
        path,
        size: buffer.length,
        contentType: safeContentType,
        uploadedAt: new Date(),
        uploadedBy: decodedToken?.email || '',
      },
    ],
    updatedAt: FieldValue.serverTimestamp(),
  });
};

export const getCommissionDocument = async (decodedToken, { dossierId, documentId }) => {
  await requireCommissionsAdmin(decodedToken);
  const snapshot = await readDossierSnapshot(dossierId);
  const documents = Array.isArray(snapshot.data()?.documents) ? snapshot.data().documents : [];
  const entry = documents.find((doc) => doc?.id === String(documentId || '').trim());
  if (!entry?.path) throw createHttpError('Document introuvable.', 404);

  const [buffer] = await getFirebaseAdminStorage().bucket().file(entry.path).download();
  return {
    buffer,
    contentType: entry.contentType || 'application/octet-stream',
    filename: entry.name || 'document',
  };
};

export const removeCommissionDocument = async (decodedToken, { dossierId, documentId }) => {
  await requireCommissionsAdmin(decodedToken);
  const snapshot = await readDossierSnapshot(dossierId);
  const documents = Array.isArray(snapshot.data()?.documents) ? snapshot.data().documents : [];
  const entry = documents.find((doc) => doc?.id === String(documentId || '').trim());
  if (!entry) throw createHttpError('Document introuvable.', 404);

  await snapshot.ref.update({
    documents: documents.filter((doc) => doc?.id !== entry.id),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (entry.path) {
    try {
      await getFirebaseAdminStorage().bucket().file(entry.path).delete();
    } catch (error) {
      console.error('Suppression Storage du document commission impossible :', error);
    }
  }
};
