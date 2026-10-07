import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';

import {
  getFirebaseAdminDb,
  getFirebaseAdminStorage,
  resolveSiteLeadsOwnerUid,
  resolveUserAccess,
} from '@/lib/firebase/admin';
import {
  buildClientRecord,
  deriveClientDocumentId,
  hasMeaningfulClientData,
  sanitizeClientData,
} from '@/lib/client-cloud';
import { COMMISSION_SOURCES, buildLeadDossierLabel } from '@/lib/commission-dossiers.mjs';
import { createLeadCommissionDossier } from '@/lib/commission-service';
import {
  DEFAULT_DEMANDE_STATUS,
  EXCLUDED_STATUS,
  MAX_ATTACHMENTS_TOTAL_BYTES,
  MAX_NOTES_LENGTH,
  buildClientDataFromDemande,
  buildDemandeSummary,
  describeIntake,
  isPublicMailboxDomain,
  isSenderBlocked,
  normalizeBlocklist,
  normalizeDemande,
  normalizeDemandeStatus,
  sanitizeIntakePayload,
  toDemandeListItem,
} from '@/lib/demandes.mjs';

/**
 * Demandes de devis reçues par e-mail (page admin /demande) : collection
 * Firestore `demandes` (identifiant = id du fil Gmail) et pièces jointes
 * lisibles (PDF, images) dans Firebase Storage sous `demandes/{threadId}/`.
 * SERVEUR UNIQUEMENT (Admin SDK, règles Firestore fermées). Toutes les
 * fonctions exigent un administrateur, sauf l'ingestion depuis le scan Gmail
 * (route /api/demandes/intake, authentifiée par secret partagé).
 */

const COLLECTION = 'demandes';
const STORAGE_ROOT = 'demandes';
const LIST_LIMIT = 400;
/** Expéditeurs exclus (appris depuis « Pas une demande ») : un seul document. */
const BLOCKLIST_DOC = 'demandesSettings/blocklist';

const createHttpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const requireDemandesAdmin = async (decodedToken) => {
  const access = await resolveUserAccess(decodedToken, { fresh: true });
  if (!access.isAdmin) {
    throw createHttpError("Réservé aux administrateurs de l'application.", 403);
  }
  return access;
};

const toIsoString = (value) => {
  if (!value) return '';
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const sanitizeFilename = (value) =>
  String(value || 'piece-jointe')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'piece-jointe';

const serializeDemande = (snapshot) => {
  const data = snapshot.data() || {};
  return normalizeDemande({
    ...data,
    id: snapshot.id,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  });
};

const readDemandeSnapshot = async (id) => {
  const demandeId = String(id || '').trim();
  if (!demandeId) throw createHttpError('Demande introuvable.', 404);
  const snapshot = await getFirebaseAdminDb().collection(COLLECTION).doc(demandeId).get();
  if (!snapshot.exists) throw createHttpError('Demande introuvable.', 404);
  return snapshot;
};

/** Chemin Storage déjà enregistré pour une pièce jointe (message + nom), sinon ''. */
const findStoredAttachmentPath = (previous, messageId, name) => {
  for (const message of Array.isArray(previous?.messages) ? previous.messages : []) {
    if (String(message?.id || '') !== String(messageId || '')) continue;
    for (const attachment of Array.isArray(message?.attachments) ? message.attachments : []) {
      if (attachment?.name === name && attachment?.path) return attachment.path;
    }
  }
  return '';
};

// ---------------------------------------------------------------------------
// Expéditeurs exclus
// ---------------------------------------------------------------------------

export const readBlocklist = async () => {
  const snapshot = await getFirebaseAdminDb().doc(BLOCKLIST_DOC).get();
  return normalizeBlocklist(snapshot.exists ? snapshot.data() : null);
};

const writeBlocklist = async (blocklist) => {
  await getFirebaseAdminDb()
    .doc(BLOCKLIST_DOC)
    .set({ ...normalizeBlocklist(blocklist), updatedAt: FieldValue.serverTimestamp() });
};

export const getBlocklist = async (decodedToken) => {
  await requireDemandesAdmin(decodedToken);
  return readBlocklist();
};

export const removeFromBlocklist = async (decodedToken, { email = '', domain = '' } = {}) => {
  await requireDemandesAdmin(decodedToken);
  const current = await readBlocklist();
  const emailKey = String(email || '').trim().toLowerCase();
  const domainKey = String(domain || '').trim().toLowerCase().replace(/^@/, '');
  await writeBlocklist({
    emails: current.emails.filter((entry) => entry !== emailKey),
    domains: current.domains.filter((entry) => entry !== domainKey),
  });
  return readBlocklist();
};

/**
 * « Pas une demande » : le fil passe au statut `exclue` et y reste, même si
 * de nouveaux messages arrivent (l'ingestion ne le ressuscite jamais). En
 * option, l'adresse de l'expéditeur, voire tout son domaine (jamais pour une
 * messagerie grand public), rejoignent la liste des exclus : les prochains
 * fils de cette provenance ne sont plus stockés du tout.
 */
export const excludeDemande = async (decodedToken, id, { blockSender = false, blockDomain = false } = {}) => {
  await requireDemandesAdmin(decodedToken);
  const snapshot = await readDemandeSnapshot(id);
  const data = snapshot.data() || {};
  await snapshot.ref.update({
    status: EXCLUDED_STATUS,
    excludedAt: new Date().toISOString(),
    excludedBy: decodedToken?.email || '',
    hasNewMessages: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (blockSender || blockDomain) {
    const current = await readBlocklist();
    const sender = String(data.from?.email || '').trim().toLowerCase();
    const domain = String(data.from?.domain || sender.split('@')[1] || '').trim().toLowerCase();
    if (blockSender && sender) current.emails.push(sender);
    if (blockDomain && domain && !isPublicMailboxDomain(domain)) current.domains.push(domain);
    await writeBlocklist(current);
  }

  return { demande: serializeDemande(await snapshot.ref.get()), blocklist: await readBlocklist() };
};

/**
 * Fils exclus depuis une date (pour que le scan Gmail retire le libellé
 * « DEVIS A FAIRE »). Requête sur un seul champ : pas d'index composite.
 */
export const listExclusionsSince = async (sinceIso) => {
  const since = String(sinceIso || '').trim() || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const snapshot = await getFirebaseAdminDb()
    .collection(COLLECTION)
    .where('excludedAt', '>', since)
    .limit(200)
    .get();
  return snapshot.docs
    .filter((entry) => entry.data()?.status === EXCLUDED_STATUS)
    .map((entry) => ({ threadId: entry.id, excludedAt: String(entry.data().excludedAt || '') }));
};

/**
 * Ingestion d'un fil poussé par le scan Gmail. Idempotent : un fil déjà connu
 * est mis à jour (nouveaux messages, pièces jointes) sans toucher au statut,
 * aux notes ni à l'analyse déjà faite. Un fil sous le score minimal, d'un
 * expéditeur exclu, ou déjà exclu à la main n'est pas stocké (ou pas
 * ressuscité) : la réponse le dit au script, qui ne pose alors aucun libellé.
 */
export const ingestDemande = async (rawPayload) => {
  const payload = sanitizeIntakePayload(rawPayload);
  const described = describeIntake(payload);
  const base = {
    stored: false,
    id: payload.threadId,
    score: described.hints.score,
    confidence: described.hints.confidence,
    label: false,
  };

  if (!described.shouldStore) return { ...base, reason: 'score-faible' };

  const blocklist = await readBlocklist();
  if (isSenderBlocked(described.from.email, blocklist)) return { ...base, reason: 'expediteur-exclu' };

  const reference = getFirebaseAdminDb().collection(COLLECTION).doc(payload.threadId);
  const existing = await reference.get();
  const previous = existing.exists ? existing.data() : null;

  if (previous?.status === EXCLUDED_STATUS) {
    await reference.update({
      messageCount: described.messageCount,
      lastMessageAt: described.lastMessageAt,
      scannedAt: payload.scannedAt,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ...base, reason: 'exclue' };
  }

  const bucket = getFirebaseAdminStorage().bucket();
  const messages = [];
  for (const message of payload.messages) {
    const attachments = [];
    for (const attachment of message.attachments) {
      let path = findStoredAttachmentPath(previous, message.id, attachment.name);
      if (!path && attachment.dataBase64) {
        const buffer = Buffer.from(attachment.dataBase64, 'base64');
        if (buffer.length > 0) {
          path = `${STORAGE_ROOT}/${payload.threadId}/${sanitizeFilename(message.id || 'message')}-${sanitizeFilename(attachment.name)}`;
          try {
            await bucket.file(path).save(buffer, {
              resumable: false,
              metadata: { contentType: attachment.contentType, cacheControl: 'private, max-age=0, no-store' },
            });
          } catch (error) {
            console.error('Pièce jointe non enregistrée dans Storage :', error);
            path = '';
          }
        }
      }
      attachments.push({
        name: attachment.name,
        contentType: attachment.contentType,
        size: attachment.size,
        path,
        analyzable: attachment.analyzable && Boolean(path),
      });
    }
    messages.push({
      id: message.id,
      date: message.date,
      from: message.from,
      fromName: message.fromName,
      to: message.to,
      body: message.body,
      attachments,
    });
  }

  const previousCount = Number(previous?.messageCount) || 0;
  const gotNewMessages = Boolean(previous) && described.messageCount > previousCount;

  await reference.set(
    {
      source: 'gmail',
      subject: payload.subject,
      permalink: payload.permalink,
      inSpam: payload.inSpam || previous?.inSpam === true,
      from: described.from,
      receivedAt: described.receivedAt,
      lastMessageAt: described.lastMessageAt,
      messageCount: described.messageCount,
      attachmentCount: described.attachmentCount,
      hints: described.hints,
      messages,
      hasNewMessages: previous ? previous.hasNewMessages === true || gotNewMessages : false,
      scannedAt: payload.scannedAt,
      updatedAt: FieldValue.serverTimestamp(),
      ...(previous
        ? {}
        : {
            status: DEFAULT_DEMANDE_STATUS,
            notes: '',
            excludedAt: '',
            excludedBy: '',
            clientId: '',
            clientCreatedAt: '',
            analysis: null,
            analysisMeta: null,
            createdAt: FieldValue.serverTimestamp(),
          }),
    },
    { merge: true }
  );

  return {
    stored: true,
    created: !existing.exists,
    id: payload.threadId,
    score: described.hints.score,
    confidence: described.hints.confidence,
    label: described.shouldLabel,
    hasNewMessages: gotNewMessages,
  };
};

export const listDemandes = async (decodedToken) => {
  await requireDemandesAdmin(decodedToken);
  const snapshot = await getFirebaseAdminDb()
    .collection(COLLECTION)
    .orderBy('lastMessageAt', 'desc')
    .limit(LIST_LIMIT)
    .get();
  return snapshot.docs.map((entry) => toDemandeListItem(serializeDemande(entry)));
};

export const getDemande = async (decodedToken, id) => {
  await requireDemandesAdmin(decodedToken);
  return serializeDemande(await readDemandeSnapshot(id));
};

/** Statut et notes. Toute modification par un administrateur acquitte « nouveau message ». */
export const updateDemande = async (decodedToken, id, data) => {
  await requireDemandesAdmin(decodedToken);
  const snapshot = await readDemandeSnapshot(id);
  const update = { hasNewMessages: false, updatedAt: FieldValue.serverTimestamp() };
  if (data && Object.prototype.hasOwnProperty.call(data, 'status')) {
    update.status = normalizeDemandeStatus(data.status);
    if (update.status === EXCLUDED_STATUS) {
      update.excludedAt = new Date().toISOString();
      update.excludedBy = decodedToken?.email || '';
    } else {
      // Rétablie : elle redevient visible et le scan peut à nouveau la libeller.
      update.excludedAt = '';
      update.excludedBy = '';
    }
  }
  if (data && Object.prototype.hasOwnProperty.call(data, 'notes')) {
    update.notes = String(data.notes || '').trim().slice(0, MAX_NOTES_LENGTH);
  }
  await snapshot.ref.update(update);
  return serializeDemande(await snapshot.ref.get());
};

/**
 * Crée (ou complète) la fiche client du compte bureau à partir de la demande,
 * comme le fait /api/leads pour le site, puis ouvre son dossier de commission.
 * Idempotent : la fiche est identifiée par e-mail, téléphone ou nom + ville.
 */
export const createClientFromDemande = async (decodedToken, id) => {
  await requireDemandesAdmin(decodedToken);
  const snapshot = await readDemandeSnapshot(id);
  const demande = serializeDemande(snapshot);

  const ownerUid = await resolveSiteLeadsOwnerUid();
  if (!ownerUid) {
    throw createHttpError(
      'Compte destinataire des fiches introuvable : configurez SITE_LEADS_OWNER_UID ou DEVIS_ADMIN_EMAILS.',
      503
    );
  }

  const clientData = sanitizeClientData(buildClientDataFromDemande(demande));
  if (!hasMeaningfulClientData(clientData)) {
    throw createHttpError('Pas assez d’informations pour créer une fiche (nom, e-mail ou téléphone).', 400);
  }
  const clientId = deriveClientDocumentId(clientData);
  if (!clientId) throw createHttpError("Impossible d'identifier ce prospect.", 400);

  const record = buildClientRecord({ ...clientData, savedClientId: clientId });
  const db = getFirebaseAdminDb();
  const clientRef = db.doc(`users/${ownerUid}/clients/${clientId}`);
  const existingClient = await clientRef.get();
  const firstBody = demande.messages[0]?.body || '';

  await clientRef.set(
    {
      ...record,
      leadSource: 'email',
      leadGmailThreadId: demande.id,
      leadGmailPermalink: demande.permalink,
      leadProjectSummary: buildDemandeSummary(demande),
      leadMessage: firstBody.slice(0, 2000),
      updatedAt: new Date(),
      lastUsedAt: new Date(),
      ...(existingClient.exists ? {} : { createdAt: new Date() }),
    },
    { merge: true }
  );

  try {
    await createLeadCommissionDossier({
      clientId,
      label: buildLeadDossierLabel({
        nom: clientData.nom,
        prenom: clientData.prenom,
        ville: clientData.ville,
      }),
      source: COMMISSION_SOURCES.EMAIL,
      createdBy: decodedToken?.email || 'demande-email',
    });
  } catch (error) {
    console.error('Dossier de commission non créé pour cette demande :', error);
  }

  await snapshot.ref.update({
    clientId,
    clientCreatedAt: new Date().toISOString(),
    hasNewMessages: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { clientId, created: !existingClient.exists, demande: serializeDemande(await snapshot.ref.get()) };
};

/** Pièces jointes lisibles d'une demande, chargées depuis Storage (budget borné). */
export const loadAnalyzableAttachments = async (demande) => {
  const bucket = getFirebaseAdminStorage().bucket();
  const loaded = [];
  let remaining = MAX_ATTACHMENTS_TOTAL_BYTES;
  for (const message of demande.messages) {
    for (const attachment of message.attachments) {
      if (!attachment.analyzable || !attachment.path) continue;
      try {
        const [buffer] = await bucket.file(attachment.path).download();
        if (buffer.length === 0 || buffer.length > remaining) continue;
        remaining -= buffer.length;
        loaded.push({ name: attachment.name, contentType: attachment.contentType, buffer });
      } catch (error) {
        console.error('Pièce jointe illisible depuis Storage :', attachment.path, error);
      }
    }
  }
  return loaded;
};

export const saveDemandeAnalysis = async (decodedToken, id, { analysis, meta }) => {
  await requireDemandesAdmin(decodedToken);
  const snapshot = await readDemandeSnapshot(id);
  await snapshot.ref.update({
    analysis,
    analysisMeta: {
      provider: String(meta?.provider || ''),
      model: String(meta?.model || ''),
      analyzedAt: new Date().toISOString(),
      analyzedBy: decodedToken?.email || '',
      inputTokens: Number(meta?.inputTokens) || 0,
      outputTokens: Number(meta?.outputTokens) || 0,
    },
    hasNewMessages: false,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return serializeDemande(await snapshot.ref.get());
};
