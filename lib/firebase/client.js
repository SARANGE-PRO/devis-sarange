import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const FIREBASE_REQUIRED_ENV_KEYS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

const FIREBASE_PUBLIC_FALLBACK_CONFIG = {
  apiKey: 'AIzaSyAGN9Uu0OuZX53Yjbezo6a_1Hqx3h4LApE',
  authDomain: 'sarange-pro.firebaseapp.com',
  projectId: 'sarange-pro',
  storageBucket: 'sarange-pro.firebasestorage.app',
  messagingSenderId: '663173287801',
  appId: '1:663173287801:web:da453370b4dc512496a9a8',
};

function getFirebaseConfigValue(envValue, fallbackValue) {
  return typeof envValue === 'string' && envValue.trim().length > 0 ? envValue : fallbackValue;
}

const firebaseConfig = {
  apiKey: getFirebaseConfigValue(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    FIREBASE_PUBLIC_FALLBACK_CONFIG.apiKey
  ),
  authDomain: getFirebaseConfigValue(
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    FIREBASE_PUBLIC_FALLBACK_CONFIG.authDomain
  ),
  projectId: getFirebaseConfigValue(
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    FIREBASE_PUBLIC_FALLBACK_CONFIG.projectId
  ),
  storageBucket: getFirebaseConfigValue(
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    FIREBASE_PUBLIC_FALLBACK_CONFIG.storageBucket
  ),
  messagingSenderId: getFirebaseConfigValue(
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    FIREBASE_PUBLIC_FALLBACK_CONFIG.messagingSenderId
  ),
  appId: getFirebaseConfigValue(
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    FIREBASE_PUBLIC_FALLBACK_CONFIG.appId
  ),
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

export function getFirebaseDb() {
  const app = getFirebaseApp();
  return app ? getFirestore(app) : null;
}
