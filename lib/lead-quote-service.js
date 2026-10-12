import 'server-only';

import crypto from 'node:crypto';

import { FieldValue } from 'firebase-admin/firestore';

import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { buildQuoteDraftRecord } from '@/lib/quote-cloud';
import { DEFAULT_TVA_RATE } from '@/lib/quote-totals.mjs';
import {
  LEAD_SOURCE,
  attachLeadPhotos,
  buildLeadCartItems,
  buildLeadQuoteTitle,
  leadPhotoCount,
  stableStringify,
} from '@/lib/lead-quote-import.mjs';
import { listLeadPhotos } from '@/lib/lead-photo-service';

/**
 * Brouillon de devis créé depuis une demande du configurateur du site
 * (route /api/leads). SERVEUR UNIQUEMENT (Admin SDK) : le document est écrit
 * dans users/{ownerUid}/quotes à la forme exacte de `saveQuoteDraft`
 * (lib/firebase/quotes.js), sans numéro de devis, qui sera attribué à la
 * première sauvegarde du bureau.
 *
 * Idempotent sur `leadId` : une nouvelle tentative du script Google (même
 * demande) met le brouillon à jour, à condition qu'il soit encore tel que
 * l'import l'a laissé (`leadImport.payloadHash`). Dès que le bureau a touché
 * au devis, l'import ne l'écrase plus et renvoie `skipped`.
 */

const hashPayload = (payload) =>
  crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');

const isUntouched = (existing) =>
  Boolean(existing?.leadImport?.payloadHash) &&
  (existing.status || 'draft') === 'draft' &&
  hashPayload(existing.payload) === existing.leadImport.payloadHash;

/**
 * @param {{ownerUid: string, clientId: string, clientData: object, project: object, leadId?: string}} input
 * @returns {Promise<{action: 'none'|'created'|'updated'|'skipped', quoteId?: string, reason?: string, lineCount?: number}>}
 */
export async function importLeadQuote({ ownerUid, clientId, clientData, project, leadId = '' }) {
  const normalizedLeadId = String(leadId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  const cartItems = buildLeadCartItems(project, { leadId: normalizedLeadId });
  if (!cartItems.length) return { action: 'none' };

  // Les photos envoyées dès la prise par le site vivent dans Storage sous le
  // leadId : on les rattache aux lignes (ou toutes à la première).
  let storedPhotos = [];
  if (normalizedLeadId) {
    try {
      storedPhotos = await listLeadPhotos(normalizedLeadId);
    } catch (error) {
      console.error('[leads] photos illisibles pour ce lead :', error);
    }
  }
  attachLeadPhotos(cartItems, storedPhotos);

  const record = buildQuoteDraftRecord({
    title: buildLeadQuoteTitle(clientData),
    clientData: { ...clientData, savedClientId: clientId },
    cartItems,
    tvaRate: DEFAULT_TVA_RATE,
    // Le bureau arrive directement sur le panier.
    currentStep: 2,
    status: 'draft',
  });
  const payloadHash = hashPayload(record.payload);
  const leadImport = {
    source: LEAD_SOURCE,
    leadId: normalizedLeadId || null,
    payloadHash,
    photoCount: Math.max(leadPhotoCount(project), storedPhotos.length),
    photos: storedPhotos.map(({ uploadId, path, name, width, height, size, createdAt }) => ({
      uploadId, path, name, width, height, size, createdAt,
    })),
    lineCount: cartItems.length,
    importedAt: new Date().toISOString(),
  };

  const db = getFirebaseAdminDb();
  const collection = db.collection(`users/${ownerUid}/quotes`);

  if (normalizedLeadId) {
    const snapshot = await collection.where('leadImport.leadId', '==', normalizedLeadId).limit(1).get();
    if (!snapshot.empty) {
      const existingDoc = snapshot.docs[0];
      const existing = existingDoc.data();
      if (!isUntouched(existing)) {
        return { action: 'skipped', quoteId: existingDoc.id, reason: 'devis déjà modifié au bureau' };
      }
      await existingDoc.ref.set(
        {
          ...record,
          leadImport: { ...leadImport, updateCount: (existing.leadImport?.updateCount || 0) + 1 },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return { action: 'updated', quoteId: existingDoc.id, lineCount: cartItems.length };
    }
  }

  const ref = collection.doc();
  await ref.set({
    ...record,
    leadImport: { ...leadImport, updateCount: 0 },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { action: 'created', quoteId: ref.id, lineCount: cartItems.length };
}
