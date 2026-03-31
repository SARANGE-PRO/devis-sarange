'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase/client';

const FirebaseContext = createContext({
  user: null,
  initializing: true,
  isConfigured: false,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

const formatFirebaseError = (error) => {
  switch (error?.code) {
    case 'auth/invalid-email':
      return 'Adresse email invalide.';
    case 'auth/missing-password':
    case 'auth/weak-password':
      return 'Le mot de passe doit être plus robuste.';
    case 'auth/email-already-in-use':
      return 'Cet email est déjà utilisé.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email ou mot de passe incorrect.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Réessayez un peu plus tard.';
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
          throw new Error('Firebase n’est pas configuré.');
        }

        try {
          return await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
          throw new Error(formatFirebaseError(error));
        }
      },
      signUp: async ({ displayName, email, password }) => {
        const auth = getFirebaseAuth();
        if (!auth) {
          throw new Error('Firebase n’est pas configuré.');
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
