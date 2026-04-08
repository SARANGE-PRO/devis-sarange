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
import { getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase/client';

const FirebaseContext = createContext({
  user: null,
  initializing: true,
  isConfigured: false,
  signIn: async () => {},
  signInWithGoogle: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

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
    default:
      return error?.message || 'Une erreur Firebase est survenue.';
  }
};

export function FirebaseProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return undefined;
    }

    const auth = getFirebaseAuth();
    if (!auth) {
      return undefined;
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setInitializing(false);
    });

    return unsubscribe;
  }, []);

  const value = useMemo(
    () => ({
      user,
      initializing,
      isConfigured: isFirebaseConfigured,
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
    [initializing, user]
  );

  return <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>;
}

export const useFirebaseAuth = () => useContext(FirebaseContext);
