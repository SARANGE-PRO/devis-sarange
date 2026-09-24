import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';

import {
  ACCESS_DOC_PATH,
  getFirebaseAdminAuth,
  getFirebaseAdminDb,
  primeAccessConfigCache,
  readAccessConfig,
  resolveUserAccess,
} from '@/lib/firebase/admin';
import {
  applyAccessAction,
  normalizeAccessConfig,
  normalizeEmail,
  parseEmailList,
} from '@/lib/access-rules.mjs';

/**
 * Administration de l'accès à l'application (Paramètres > Accès) : lecture de
 * la configuration, comptes connus de Firebase Auth, modifications. Toutes les
 * fonctions exigent un administrateur (voir lib/access-rules.mjs).
 */

const createHttpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const requireAdmin = async (decodedToken) => {
  const access = await resolveUserAccess(decodedToken, { fresh: true });
  if (!access.isAdmin) {
    throw createHttpError("Réservé aux administrateurs de l'application.", 403);
  }
  return access;
};

const toTimestamp = (value) => {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
};

/**
 * Comptes présents dans Firebase Auth (projet partagé avec les autres apps
 * SARANGE : les tablettes anonymes, sans e-mail, sont écartées). Un compte
 * Google refusé à la connexion apparaît ici : l'administrateur peut l'autoriser
 * en un clic sans retaper l'adresse.
 */
const listKnownAccounts = async () => {
  try {
    const accounts = [];
    let pageToken;
    do {
      const page = await getFirebaseAdminAuth().listUsers(500, pageToken);
      page.users.forEach((record) => {
        if (!record.email) return;
        accounts.push({
          email: normalizeEmail(record.email),
          displayName: record.displayName || '',
          emailVerified: record.emailVerified === true,
          providers: (record.providerData || []).map((provider) => provider.providerId),
          lastSignInAt: record.metadata?.lastSignInTime || null,
          createdAt: record.metadata?.creationTime || null,
          disabled: record.disabled === true,
        });
      });
      pageToken = page.pageToken;
    } while (pageToken && accounts.length < 2000);

    return accounts.sort(
      (a, b) => toTimestamp(b.lastSignInAt || b.createdAt) - toTimestamp(a.lastSignInAt || a.createdAt)
    );
  } catch (error) {
    console.error('Lecture des comptes Firebase Auth impossible :', error);
    return [];
  }
};

const buildAdminView = async (decodedToken, config) => ({
  ...config,
  envAllowedEmails: parseEmailList(process.env.NEXT_PUBLIC_DEVIS_ALLOWED_EMAILS || ''),
  envAdmins: parseEmailList(process.env.DEVIS_ADMIN_EMAILS || ''),
  currentEmail: normalizeEmail(decodedToken?.email),
  knownAccounts: await listKnownAccounts(),
});

export const getAccessAdminView = async (decodedToken) => {
  await requireAdmin(decodedToken);
  const config = await readAccessConfig({ fresh: true });
  return buildAdminView(decodedToken, config);
};

/**
 * Applique une action ({ action: 'add' | 'remove' | 'set-enforced', email,
 * role, enforced }) dans une transaction, puis renvoie la vue à jour.
 */
export const updateAccessConfig = async (decodedToken, action) => {
  await requireAdmin(decodedToken);
  const actorEmail = normalizeEmail(decodedToken?.email);

  const db = getFirebaseAdminDb();
  const reference = db.doc(ACCESS_DOC_PATH);

  const nextConfig = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const current = normalizeAccessConfig(snapshot.exists ? snapshot.data() : null);

    let next;
    try {
      next = applyAccessAction(current, { ...action, actorEmail });
    } catch (error) {
      throw createHttpError(error.message, 400);
    }

    transaction.set(reference, {
      ...next,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorEmail,
    });
    return next;
  });

  primeAccessConfigCache(nextConfig);
  return buildAdminView(decodedToken, nextConfig);
};
