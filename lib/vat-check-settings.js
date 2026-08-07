// Activation du contrôle des seuils thermiques pour la TVA à 5,5 %.
//
// Quand il est ACTIF, une ligne demandée à 5,5 % dont l'Uw/Sw ne respecte pas
// l'article 30-0 D bis de l'annexe IV du CGI est automatiquement ramenée à
// 10 % (cf. resolveEffectiveTvaRate dans lib/vat-window-eligibility.mjs).
//
// DÉSACTIVÉ PAR DÉFAUT : le contrôle repose sur des valeurs thermiques
// déclaratives dont toutes ne sont pas encore confirmées fournisseur. Tant
// qu'elles ne le sont pas, mieux vaut que le taux saisi soit respecté et que
// la vérification reste à la main de l'utilisateur, plutôt qu'un devis soit
// silencieusement requalifié sur une donnée incertaine.
//
// Persistance locale au poste, comme les réglages Compta et assurance.
import { setVatThresholdCheckResolver } from './vat-window-eligibility.mjs';

const STORAGE_KEY = 'sarange:vat-threshold-check:v1';

export const DEFAULT_VAT_CHECK_ENABLED = false;

let cached = null;
const listeners = new Set();

const read = () => {
  if (typeof window === 'undefined') return DEFAULT_VAT_CHECK_ENABLED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_VAT_CHECK_ENABLED;
    return JSON.parse(raw) === true;
  } catch {
    return DEFAULT_VAT_CHECK_ENABLED;
  }
};

/** Le contrôle des seuils est-il actif ? */
export const isVatThresholdCheckEnabled = () => {
  if (cached === null) cached = read();
  return cached;
};

export const setVatThresholdCheckEnabled = (enabled) => {
  cached = enabled === true;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
    } catch {
      // Stockage indisponible (navigation privée…) : réglage en mémoire.
    }
  }

  listeners.forEach((listener) => listener());
  return cached;
};

/** Abonnement pour `useSyncExternalStore`. */
export const subscribeToVatThresholdCheck = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getVatThresholdCheckSnapshot = () => isVatThresholdCheckEnabled();
export const getVatThresholdCheckServerSnapshot = () => DEFAULT_VAT_CHECK_ENABLED;

// Branchement du moteur de TVA sur ce réglage. Fait ici pour que
// lib/vat-window-eligibility.mjs reste un module PUR (testable sans
// navigateur). Ce fichier est importé par components/FirebaseProvider.jsx,
// monté par le layout racine : le réglage est donc actif sur toutes les pages,
// y compris si l'utilisateur n'ouvre jamais /parametres.
setVatThresholdCheckResolver(isVatThresholdCheckEnabled);
