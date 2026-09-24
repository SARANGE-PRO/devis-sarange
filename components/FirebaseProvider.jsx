'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { subscribeToUserCatalogueConfig } from '@/lib/firebase/catalogue';
import { hydrateCatalogueCoefficients } from '@/lib/catalogue-coefficients';
import { hydrateCataloguePricing } from '@/lib/catalogue-pricing';
import { hydrateCustomGlazingOptions } from '@/lib/glazing';
import { getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase/client';
import { describeAccessDenial } from '@/lib/access-rules.mjs';
// Importé pour son effet de bord : branche le réglage « contrôle des seuils
// TVA 5,5 % » (/parametres) sur le moteur de TVA, sur toutes les pages.
import '@/lib/vat-check-settings';

// Décision d'accès du compte connecté (voir lib/access-rules.mjs) :
//  - checked : la réponse vient bien du serveur (false = indisponible) ;
//  - isAdmin : peut gérer la liste des comptes dans Paramètres > Accès.
const DEFAULT_ACCESS = Object.freeze({
  checked: false,
  allowed: false,
  isAdmin: false,
  enforced: false,
  reason: '',
});

const FirebaseContext = createContext({
  user: null,
  initializing: true,
  isConfigured: false,
  accessError: '',
  access: DEFAULT_ACCESS,
  refreshAccess: async () => null,
  signIn: async () => {},
  signInWithGoogle: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

// Liste blanche historique : emails autorisés, séparés par des virgules, dans
// NEXT_PUBLIC_DEVIS_ALLOWED_EMAILS. Vérifiée localement (sans réseau) en plus
// de la liste gérée dans l'app. Si elle est VIDE, elle ne restreint rien.
const ALLOWED_EMAILS = (process.env.NEXT_PUBLIC_DEVIS_ALLOWED_EMAILS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

const isEmailAllowed = (email) => {
  if (ALLOWED_EMAILS.length === 0) return true; // liste non configurée → pas de filtre local
  return ALLOWED_EMAILS.includes((email || '').trim().toLowerCase());
};

// ---------------------------------------------------------------------------
// Vérification serveur (liste gérée dans Paramètres > Accès à l'application).
// Une décision positive est gardée 10 min dans la session du navigateur : au
// rechargement de la page, l'app s'ouvre immédiatement et la vérification se
// refait en arrière-plan (un compte retiré entre-temps est déconnecté).
// ---------------------------------------------------------------------------
const ACCESS_CHECK_TIMEOUT_MS = 12_000;
const ACCESS_CACHE_KEY = 'devis-sarange:access-decision';
const ACCESS_CACHE_TTL_MS = 10 * 60_000;

const readCachedAccess = (uid) => {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(ACCESS_CACHE_KEY) || 'null');
    if (parsed?.uid === uid && parsed.expiresAt > Date.now() && parsed.decision?.allowed) {
      return parsed.decision;
    }
  } catch {
    // stockage indisponible : on vérifiera simplement en ligne
  }
  return null;
};

const writeCachedAccess = (uid, decision) => {
  try {
    if (decision.checked && decision.allowed) {
      window.sessionStorage.setItem(
        ACCESS_CACHE_KEY,
        JSON.stringify({ uid, decision, expiresAt: Date.now() + ACCESS_CACHE_TTL_MS })
      );
    } else {
      window.sessionStorage.removeItem(ACCESS_CACHE_KEY);
    }
  } catch {
    // ignoré
  }
};

/**
 * En cas de panne réseau ou serveur, l'accès est accordé par défaut (les
 * données restent de toute façon cloisonnées par UID dans Firestore) : seule
 * une réponse explicite du serveur refuse un compte.
 */
const fetchServerAccess = async (firebaseUser) => {
  try {
    const idToken = await firebaseUser.getIdToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ACCESS_CHECK_TIMEOUT_MS);
    let response;
    try {
      response = await fetch('/api/access/me', {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    return {
      checked: true,
      allowed: payload?.allowed !== false,
      isAdmin: payload?.isAdmin === true,
      enforced: payload?.enforced === true,
      reason: payload?.reason || '',
    };
  } catch (error) {
    console.warn("Vérification d'accès indisponible, accès accordé par défaut :", error);
    return { checked: false, allowed: true, isAdmin: false, enforced: false, reason: 'unavailable' };
  }
};

const formatFirebaseError = (error) => {
  switch (error?.code) {
    case 'auth/invalid-email':
      return 'Adresse email invalide.';
    case 'auth/missing-password':
    case 'auth/weak-password':
      return 'Le mot de passe doit etre plus robuste.';
    case 'auth/email-already-in-use':
      return 'Cet email est deja utilise.';
    case 'auth/account-exists-with-different-credential':
      return 'Ce compte existe deja avec une autre methode de connexion, probablement Google.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email ou mot de passe incorrect.';
    case 'auth/popup-closed-by-user':
      return 'La fenetre Google a ete fermee avant la fin de la connexion.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Reessayez un peu plus tard.';
    case 'auth/unauthorized-domain':
      return 'Ce domaine n\'est pas autorisé. Ajoutez votre hébergeur dans Firebase (Authentication > Settings > Authorized domains) ET Google Cloud (Restrictions des ID clients OAuth).';
    default:
      return error?.message || 'Une erreur Firebase est survenue.';
  }
};

export function FirebaseProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(isFirebaseConfigured);
  const [accessError, setAccessError] = useState('');
  const [access, setAccess] = useState(DEFAULT_ACCESS);
  // Relance de la vérification serveur pour le compte courant (voir refreshAccess).
  const accessCheckRef = useRef(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return undefined;
    }

    const auth = getFirebaseAuth();
    if (!auth) {
      return undefined;
    }

    // Numéro de séquence : une réponse serveur qui arrive après un nouveau
    // changement d'état (déconnexion, autre compte) est ignorée.
    let sequence = 0;

    const reject = (firebaseUser, reason) => {
      setAccessError(describeAccessDenial({ email: firebaseUser.email, reason }));
      setUser(null);
      setAccess(DEFAULT_ACCESS);
      setInitializing(false);
      writeCachedAccess(firebaseUser.uid, DEFAULT_ACCESS);
      void signOut(auth).catch(() => {});
    };

    const runCheck = (firebaseUser, current) =>
      fetchServerAccess(firebaseUser).then((decision) => {
        if (current !== sequence) return decision;
        if (!decision.allowed) {
          reject(firebaseUser, decision.reason);
          return decision;
        }
        writeCachedAccess(firebaseUser.uid, decision);
        setAccessError('');
        setAccess(decision);
        setUser(firebaseUser);
        setInitializing(false);
        return decision;
      });

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      const current = ++sequence;

      if (!nextUser) {
        // Le message de refus éventuel reste affiché sur l'écran de connexion.
        setUser(null);
        setAccess(DEFAULT_ACCESS);
        setInitializing(false);
        return;
      }

      // Filtre local (liste d'environnement) : immédiat, sans réseau.
      if (!isEmailAllowed(nextUser.email)) {
        reject(nextUser, 'not-listed');
        return;
      }

      const cached = readCachedAccess(nextUser.uid);
      if (cached) {
        setAccessError('');
        setAccess(cached);
        setUser(nextUser);
        setInitializing(false);
      }

      void runCheck(nextUser, current);
    });

    accessCheckRef.current = (firebaseUser) => runCheck(firebaseUser, sequence);

    return () => {
      accessCheckRef.current = null;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || initializing || !user?.uid) {
      return undefined;
    }

    return subscribeToUserCatalogueConfig({
      userId: user.uid,
      onNext: (catalogueConfig) => {
        if (!catalogueConfig) return;
        hydrateCatalogueCoefficients(catalogueConfig.coefficients);
        hydrateCataloguePricing(catalogueConfig.pricing);
        hydrateCustomGlazingOptions(catalogueConfig.customGlazingOptions);
      },
      onError: (error) => {
        console.error('Firebase catalogue sync error:', error);
      },
    });
  }, [initializing, user]);

  const value = useMemo(
    () => ({
      user,
      initializing,
      isConfigured: isFirebaseConfigured,
      accessError,
      access,
      refreshAccess: async () => {
        const auth = getFirebaseAuth();
        const currentUser = auth?.currentUser;
        if (!currentUser || !accessCheckRef.current) return null;
        return accessCheckRef.current(currentUser);
      },
      signIn: async ({ email, password }) => {
        const auth = getFirebaseAuth();
        if (!auth) {
          throw new Error("Firebase n'est pas configure.");
        }

        try {
          return await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
          throw new Error(formatFirebaseError(error));
        }
      },
      signInWithGoogle: async () => {
        const auth = getFirebaseAuth();
        if (!auth) {
          throw new Error("Firebase n'est pas configure.");
        }

        try {
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: 'select_account' });
          return await signInWithPopup(auth, provider);
        } catch (error) {
          console.error("Firebase Google Auth Error:", error);
          throw new Error(formatFirebaseError(error));
        }
      },
      signUp: async ({ displayName, email, password }) => {
        const auth = getFirebaseAuth();
        if (!auth) {
          throw new Error("Firebase n'est pas configure.");
        }

        try {
          const credential = await createUserWithEmailAndPassword(auth, email, password);
          if (displayName?.trim()) {
            await updateProfile(credential.user, { displayName: displayName.trim() });
          }
          return credential;
        } catch (error) {
          throw new Error(formatFirebaseError(error));
        }
      },
      signOut: async () => {
        const auth = getFirebaseAuth();
        if (!auth) return;

        try {
          await signOut(auth);
        } catch (error) {
          throw new Error(formatFirebaseError(error));
        }
      },
    }),
    [initializing, user, accessError, access]
  );

  return <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>;
}

export const useFirebaseAuth = () => useContext(FirebaseContext);
