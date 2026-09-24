import 'server-only';

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import { describeAccessDenial, evaluateAccess, normalizeAccessConfig } from '@/lib/access-rules.mjs';

const normalizeEnvValue = (value) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';

const parseServiceAccountFromEnv = () => {
  const rawJson = normalizeEnvValue(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON);
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      return {
        projectId: normalizeEnvValue(parsed.project_id || parsed.projectId),
        clientEmail: normalizeEnvValue(parsed.client_email || parsed.clientEmail),
        privateKey: normalizeEnvValue(parsed.private_key || parsed.privateKey).replace(/\\n/g, '\n'),
      };
    } catch (error) {
      throw new Error(`FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON invalide: ${error.message}`);
    }
  }

  const projectId = normalizeEnvValue(
    process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
  const clientEmail = normalizeEnvValue(process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
  const privateKey = normalizeEnvValue(process.env.FIREBASE_ADMIN_PRIVATE_KEY).replace(
    /\\n/g,
    '\n'
  );

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
};

export const getFirebaseAdminStorageBucket = () =>
  normalizeEnvValue(
    process.env.FIREBASE_ADMIN_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  );

export const isFirebaseAdminConfigured = () =>
  Boolean(parseServiceAccountFromEnv() && getFirebaseAdminStorageBucket());

export const getFirebaseAdminApp = () => {
  const serviceAccount = parseServiceAccountFromEnv();
  const storageBucket = getFirebaseAdminStorageBucket();

  if (!serviceAccount) {
    throw new Error(
      'Firebase Admin n’est pas configure. Renseignez FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON ou les variables FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY.'
    );
  }

  if (!storageBucket) {
    throw new Error(
      'Firebase Admin n’est pas configure. Renseignez FIREBASE_ADMIN_STORAGE_BUCKET ou NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.'
    );
  }

  if (getApps().length) {
    return getApps()[0];
  }

  return initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.projectId,
    storageBucket,
  });
};

export const getFirebaseAdminDb = () => getFirestore(getFirebaseAdminApp());
export const getFirebaseAdminAuth = () => getAuth(getFirebaseAdminApp());
export const getFirebaseAdminStorage = () => getStorage(getFirebaseAdminApp());

export const readBearerToken = (request) => {
  const authorizationHeader = request.headers.get('authorization') || '';
  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new Error('Authentification manquante.');
  }
  return token;
};

// ---------------------------------------------------------------------------
// Accès à l'application : liste des comptes autorisés et administrateurs,
// document Firestore `appAccess/devis` (réservé au serveur) géré depuis
// Paramètres > Accès. Règles dans lib/access-rules.mjs. Cache mémoire court :
// une lecture Firestore au plus toutes les 30 s par instance, quel que soit le
// nombre d'appels API.
// ---------------------------------------------------------------------------

export const ACCESS_DOC_PATH = 'appAccess/devis';
const ACCESS_CACHE_TTL_MS = 30_000;

let accessConfigCache = { config: null, expiresAt: 0 };

export const primeAccessConfigCache = (config) => {
  accessConfigCache = {
    config: normalizeAccessConfig(config),
    expiresAt: Date.now() + ACCESS_CACHE_TTL_MS,
  };
};

export const readAccessConfig = async ({ fresh = false } = {}) => {
  if (!fresh && accessConfigCache.config && accessConfigCache.expiresAt > Date.now()) {
    return accessConfigCache.config;
  }
  const snapshot = await getFirebaseAdminDb().doc(ACCESS_DOC_PATH).get();
  const config = normalizeAccessConfig(snapshot.exists ? snapshot.data() : null);
  primeAccessConfigCache(config);
  return config;
};

/** Décision d'accès pour un jeton Firebase décodé. */
export const resolveUserAccess = async (decodedToken, options) => {
  const config = await readAccessConfig(options);
  return evaluateAccess({
    email: decodedToken?.email,
    emailVerified: decodedToken?.email_verified !== false,
    config,
    envAllowed: process.env.NEXT_PUBLIC_DEVIS_ALLOWED_EMAILS || '',
    envAdmins: process.env.DEVIS_ADMIN_EMAILS || '',
  });
};

/**
 * Vérifie le jeton Firebase de la requête puis, par défaut, que le compte est
 * autorisé à utiliser l'application (403 sinon) : un compte refusé à l'écran
 * de connexion ne peut pas non plus appeler les routes API directement.
 */
export const verifyFirebaseUserFromRequest = async (request, { enforceAccess = true } = {}) => {
  const token = readBearerToken(request);
  const decodedToken = await getFirebaseAdminAuth().verifyIdToken(token);

  if (enforceAccess) {
    const access = await resolveUserAccess(decodedToken);
    if (!access.allowed) {
      throw Object.assign(
        new Error(describeAccessDenial({ email: decodedToken.email, reason: access.reason })),
        { statusCode: 403 }
      );
    }
  }

  return decodedToken;
};
