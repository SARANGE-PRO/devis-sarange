import 'server-only';

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

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

export const verifyFirebaseUserFromRequest = async (request) => {
  const token = readBearerToken(request);
  return getFirebaseAdminAuth().verifyIdToken(token);
};
