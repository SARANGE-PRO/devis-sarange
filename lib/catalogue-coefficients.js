const STORAGE_KEY = 'sarange.catalogue.coefficients';
const DEFAULT_COEFFICIENT = 1;
const EMPTY_SNAPSHOT = Object.freeze({});

let cachedCoefficients = null;
const listeners = new Set();
let storageListenerBound = false;

const roundCoefficient = (value) =>
  Math.round((Number(value || DEFAULT_COEFFICIENT) + Number.EPSILON) * 1000) / 1000;

const normalizeCoefficient = (value) => {
  const normalizedValue =
    typeof value === 'string' ? Number.parseFloat(value.replace(',', '.')) : Number(value);

  if (!Number.isFinite(normalizedValue) || normalizedValue <= 0) {
    return DEFAULT_COEFFICIENT;
  }

  return roundCoefficient(normalizedValue);
};

const isBrowser = () => typeof window !== 'undefined';

const emitChange = () => {
  listeners.forEach((listener) => listener());
};

const bindStorageListener = () => {
  if (!isBrowser() || storageListenerBound) return;

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    cachedCoefficients = null;
    emitChange();
  });

  storageListenerBound = true;
};

const sanitizeCoefficientMap = (value) => {
  if (!value || typeof value !== 'object') return {};

  return Object.entries(value).reduce((accumulator, [productId, coefficient]) => {
    const normalized = normalizeCoefficient(coefficient);

    if (normalized !== DEFAULT_COEFFICIENT) {
      accumulator[productId] = normalized;
    }

    return accumulator;
  }, {});
};

const loadCatalogueCoefficients = () => {
  if (cachedCoefficients) return cachedCoefficients;
  if (!isBrowser()) {
    cachedCoefficients = {};
    return cachedCoefficients;
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    cachedCoefficients = rawValue ? sanitizeCoefficientMap(JSON.parse(rawValue)) : {};
  } catch {
    cachedCoefficients = {};
  }

  return cachedCoefficients;
};

const persistCatalogueCoefficients = (coefficients) => {
  cachedCoefficients = sanitizeCoefficientMap(coefficients);

  if (!isBrowser()) return cachedCoefficients;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedCoefficients));
  } catch {
    return cachedCoefficients;
  }

  emitChange();
  return cachedCoefficients;
};

export function getCatalogueCoefficients() {
  return { ...loadCatalogueCoefficients() };
}

export function getProductCoefficient(productId) {
  if (!productId) return DEFAULT_COEFFICIENT;
  const coefficients = loadCatalogueCoefficients();
  return coefficients[productId] || DEFAULT_COEFFICIENT;
}

export function setProductCoefficient(productId, value) {
  if (!productId) return getCatalogueCoefficients();

  const coefficients = {
    ...loadCatalogueCoefficients(),
    [productId]: normalizeCoefficient(value),
  };

  if (coefficients[productId] === DEFAULT_COEFFICIENT) {
    delete coefficients[productId];
  }

  return persistCatalogueCoefficients(coefficients);
}

export function resetAllProductCoefficients() {
  return persistCatalogueCoefficients({});
}

export function subscribeToCatalogueCoefficients(listener) {
  if (!isBrowser()) {
    return () => {};
  }

  bindStorageListener();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getCatalogueCoefficientsSnapshot() {
  return loadCatalogueCoefficients();
}

export function getCatalogueCoefficientsServerSnapshot() {
  return EMPTY_SNAPSHOT;
}

export function formatCoefficientDelta(coefficient) {
  const normalized = normalizeCoefficient(coefficient);
  const percentage = Math.round((normalized - 1) * 1000) / 10;

  if (percentage === 0) return 'Base tarifaire';
  if (percentage > 0) return `+${percentage}% sur le prix de base`;
  return `${percentage}% sur le prix de base`;
}

export function applyProductCoefficient(basePrice, productId) {
  const coefficient = getProductCoefficient(productId);
  return Math.round((Number(basePrice || 0) * coefficient + Number.EPSILON) * 100) / 100;
}
