'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
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

const FirebaseContext = createContext({
  user: null,
  initializing: true,
  isConfigured: false,
  accessError: '',
  signIn: async () => {},
  signInWithGoogle: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

// Liste blanche d'accès (étape 5). Emails autorisés, séparés par des virgules,
// dans NEXT_PUBLIC_DEVIS_ALLOWED_EMAILS. Si la liste est VIDE, l'accès reste ouvert
// (comportement historique) — aucun risque de verrouillage involontaire.
const ALLOWED_EMAILS = (process.env.NEXT_PUBLIC_DEVIS_ALLOWED_EMAILS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

const isEmailAllowed = (email) => {
  if (ALLOWED_EMAILS.length === 0) return true; // liste non configurée → accès ouvert
  return ALLOWED_EMAILS.includes((email || '').trim().toLowerCase());
};

const ACCESS_DENIED_MESSAGE =
  "Accès non autorisé. Contactez l'administrateur pour obtenir l'accès à cette application.";

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

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return undefined;
    }

    const auth = getFirebaseAuth();
    if (!auth) {
      return undefined;
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      // Filtre d'accès (étape 5) : un compte hors liste blanche est déconnecté
      // immédiatement. Ses données restent de toute façon cloisonnées par UID.
      if (nextUser && !isEmailAllowed(nextUser.email)) {
        setAccessError(ACCESS_DENIED_MESSAGE);
        setUser(null);
        setInitializing(false);
        void signOut(auth).catch(() => {});
        return;
      }

      setAccessError('');
      setUser(nextUser);
      setInitializing(false);
    });

    return unsubscribe;
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
    [initializing, user, accessError]
  );

  return <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>;
}

export const useFirebaseAuth = () => useContext(FirebaseContext);
