import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

export const FIREBASE_REQUIRED_ENV_KEYS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (value) => typeof value === 'string' && value.trim().length > 0
);

let authPersistenceConfigured = false;

export function getFirebaseApp() {
  if (!isFirebaseConfigured) return null;
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseAuth() {
  const app = getFirebaseApp();
  if (!app) return null;

  const auth = getAuth(app);
  if (!authPersistenceConfigured && typeof window !== 'undefined') {
    authPersistenceConfigured = true;
    void setPersistence(auth, browserLocalPersistence).catch(() => {
      authPersistenceConfigured = false;
    });
  }

  return auth;
}

// Cache local persistant (IndexedDB) : les devis et les clients déjà vus sont
// servis immédiatement depuis le poste, et l'abonnement ne télécharge ensuite
// que ce qui a changé depuis la dernière visite, au lieu de recharger toute la
// base à chaque ouverture de « Mes devis ». Plafond large : une base de
// plusieurs centaines de devis avec leur contenu dépasse les 40 Mo par défaut,
// au-delà desquels Firestore commencerait à purger le cache.
const LOCAL_CACHE_SIZE_BYTES = 256 * 1024 * 1024;

let firestoreInstance = null;

export function getFirebaseDb() {
  const app = getFirebaseApp();
  if (!app) return null;
  if (firestoreInstance) return firestoreInstance;
  // Rendu serveur : pas de navigateur, donc pas de cache local.
  if (typeof window === 'undefined') return getFirestore(app);

  try {
    firestoreInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({
        cacheSizeBytes: LOCAL_CACHE_SIZE_BYTES,
        // Plusieurs onglets ouverts partagent le même cache.
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // Firestore déjà initialisé pour cette app (rechargement à chaud) : on
    // reprend l'instance existante. Si IndexedDB est indisponible (navigation
    // privée), le SDK retombe de lui-même sur le cache mémoire.
    firestoreInstance = getFirestore(app);
  }
  return firestoreInstance;
}
