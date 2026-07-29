import {
  DEFAULT_COMPANY_INSURANCE,
  normalizeCompanyInsurance,
} from './company-insurance.mjs';

// Réglages d'assurance décennale de la société — persistés en localStorage
// (même philosophie « local d'abord » que les paramètres Compta). Chaque poste
// conserve sa copie ; les valeurs par défaut correspondent au contrat en cours.
const STORAGE_KEY = 'sarange:company-insurance:v1';

export const loadCompanyInsurance = () => {
  if (typeof window === 'undefined') return { ...DEFAULT_COMPANY_INSURANCE };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return normalizeCompanyInsurance(raw ? JSON.parse(raw) : {});
  } catch {
    return { ...DEFAULT_COMPANY_INSURANCE };
  }
};

export const saveCompanyInsurance = (insurance) => {
  const normalized = normalizeCompanyInsurance(insurance);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Stockage local indisponible (navigation privée…) : valeurs en mémoire.
    }
  }

  return normalized;
};
