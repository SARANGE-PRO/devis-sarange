'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Terme de recherche d'un onglet, conservé le temps de la session du
 * navigateur : on retrouve sa recherche en revenant sur l'onglet après un
 * détour (ouvrir un devis, une fiche client…).
 *
 * Petit magasin externe (une valeur par clé) lu par useSyncExternalStore :
 * le rendu serveur voit une recherche vide, le client reprend la valeur de
 * sessionStorage sans divergence d'hydratation. Stockage silencieux s'il est
 * indisponible (navigation privée) : la valeur reste en mémoire.
 */

const values = new Map();
const listeners = new Map();

const readStored = (storageKey) => {
  try {
    return sessionStorage.getItem(storageKey) || '';
  } catch {
    return '';
  }
};

const getValue = (storageKey) => {
  if (!values.has(storageKey)) values.set(storageKey, readStored(storageKey));
  return values.get(storageKey);
};

const setValue = (storageKey, text) => {
  values.set(storageKey, text);
  try {
    if (text) sessionStorage.setItem(storageKey, text);
    else sessionStorage.removeItem(storageKey);
  } catch {
    // Stockage indisponible : la recherche vaut pour la page courante seulement.
  }
  listeners.get(storageKey)?.forEach((listener) => listener());
};

const getServerSnapshot = () => '';

export default function useSessionSearch(storageKey) {
  const subscribe = useCallback(
    (listener) => {
      if (!listeners.has(storageKey)) listeners.set(storageKey, new Set());
      listeners.get(storageKey).add(listener);
      return () => listeners.get(storageKey)?.delete(listener);
    },
    [storageKey]
  );
  const getSnapshot = useCallback(() => getValue(storageKey), [storageKey]);
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback(
    (next) => setValue(storageKey, typeof next === 'string' ? next : ''),
    [storageKey]
  );

  return [value, update];
}
