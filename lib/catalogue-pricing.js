const STORAGE_KEY = 'sarange.catalogue.pricing';

const DEFAULT_PRICING = Object.freeze({
  baseGlassPricePerM2: 37,
  panelSandwichPricePerM2: 74.37,
  panelSandwichColorMultiplier: 1.4,
  sousBassementTraversePricePerMl: 10,
  petitsBoisPricePerMl: 37.5,
  obPrice: 30,
  grillePrice: 10,
  lockingHandlePrice: 18.75,
  panneauDecoratifPrice: 850,
  panneauDecoratifMultiplier: 1.25,
  posePrices: Object.freeze({
    menuiserie: 250,
    volet: 100,
    porte: 400,
  }),
  glazingPrices: Object.freeze({}),
});

const EMPTY_SNAPSHOT = DEFAULT_PRICING;

let cachedPricing = null;
const listeners = new Set();
let storageListenerBound = false;

const isBrowser = () => typeof window !== 'undefined';

const toNumber = (value, fallback) => {
  const parsed = typeof value === 'string' ? Number.parseFloat(value.replace(',', '.')) : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const sanitizePricing = (value) => {
  const raw = value && typeof value === 'object' ? value : {};
  const posePrices = raw.posePrices && typeof raw.posePrices === 'object' ? raw.posePrices : {};
  const glazingPrices = raw.glazingPrices && typeof raw.glazingPrices === 'object' ? raw.glazingPrices : {};

  return {
    baseGlassPricePerM2: Math.max(0, toNumber(raw.baseGlassPricePerM2, DEFAULT_PRICING.baseGlassPricePerM2)),
    panelSandwichPricePerM2: Math.max(
      0,
      toNumber(raw.panelSandwichPricePerM2, DEFAULT_PRICING.panelSandwichPricePerM2)
    ),
    panelSandwichColorMultiplier: Math.max(
      0,
      toNumber(raw.panelSandwichColorMultiplier, DEFAULT_PRICING.panelSandwichColorMultiplier)
    ),
    sousBassementTraversePricePerMl: Math.max(
      0,
      toNumber(raw.sousBassementTraversePricePerMl, DEFAULT_PRICING.sousBassementTraversePricePerMl)
    ),
    petitsBoisPricePerMl: Math.max(
      0,
      toNumber(raw.petitsBoisPricePerMl, DEFAULT_PRICING.petitsBoisPricePerMl)
    ),
    obPrice: Math.max(0, toNumber(raw.obPrice, DEFAULT_PRICING.obPrice)),
    grillePrice: Math.max(0, toNumber(raw.grillePrice, DEFAULT_PRICING.grillePrice)),
    lockingHandlePrice: Math.max(
      0,
      toNumber(raw.lockingHandlePrice, DEFAULT_PRICING.lockingHandlePrice)
    ),
    panneauDecoratifPrice: Math.max(
      0,
      toNumber(raw.panneauDecoratifPrice, DEFAULT_PRICING.panneauDecoratifPrice)
    ),
    panneauDecoratifMultiplier: Math.max(
      0,
      toNumber(raw.panneauDecoratifMultiplier, DEFAULT_PRICING.panneauDecoratifMultiplier)
    ),
    posePrices: {
      menuiserie: Math.max(
        0,
        toNumber(posePrices.menuiserie, DEFAULT_PRICING.posePrices.menuiserie)
      ),
      volet: Math.max(0, toNumber(posePrices.volet, DEFAULT_PRICING.posePrices.volet)),
      porte: Math.max(0, toNumber(posePrices.porte, DEFAULT_PRICING.posePrices.porte)),
    },
    glazingPrices: Object.entries(glazingPrices).reduce((accumulator, [glazingId, price]) => {
      const normalized = toNumber(price, null);
      if (normalized === null) return accumulator;
      accumulator[glazingId] = Math.max(0, normalized);
      return accumulator;
    }, {}),
  };
};

const emitChange = () => {
  listeners.forEach((listener) => listener());
};

const bindStorageListener = () => {
  if (!isBrowser() || storageListenerBound) return;

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    cachedPricing = null;
    emitChange();
  });

  storageListenerBound = true;
};

const loadCataloguePricing = () => {
  if (cachedPricing) return cachedPricing;
  if (!isBrowser()) {
    cachedPricing = DEFAULT_PRICING;
    return cachedPricing;
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    cachedPricing = rawValue ? sanitizePricing(JSON.parse(rawValue)) : DEFAULT_PRICING;
  } catch {
    cachedPricing = DEFAULT_PRICING;
  }

  return cachedPricing;
};

const persistCataloguePricing = (pricing) => {
  cachedPricing = sanitizePricing(pricing);

  if (!isBrowser()) return cachedPricing;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedPricing));
  } catch {
    return cachedPricing;
  }

  emitChange();
  return cachedPricing;
};

export function getCataloguePricing() {
  const pricing = loadCataloguePricing();
  return {
    ...pricing,
    posePrices: { ...pricing.posePrices },
    glazingPrices: { ...pricing.glazingPrices },
  };
}

export function setCataloguePricing(patch) {
  const current = loadCataloguePricing();
  return persistCataloguePricing({ ...current, ...patch });
}

export function setCataloguePricingValue(key, value) {
  return setCataloguePricing({ [key]: value });
}

export function setPosePrice(type, value) {
  const current = loadCataloguePricing();
  return persistCataloguePricing({
    ...current,
    posePrices: {
      ...current.posePrices,
      [type]: value,
    },
  });
}

export function setGlazingPrice(glazingId, value) {
  if (!glazingId) return getCataloguePricing();
  const current = loadCataloguePricing();
  return persistCataloguePricing({
    ...current,
    glazingPrices: {
      ...current.glazingPrices,
      [glazingId]: value,
    },
  });
}

export function resetCataloguePricing() {
  return persistCataloguePricing(DEFAULT_PRICING);
}

export function subscribeToCataloguePricing(listener) {
  if (!isBrowser()) {
    return () => {};
  }

  bindStorageListener();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getCataloguePricingSnapshot() {
  return loadCataloguePricing();
}

export function getCataloguePricingServerSnapshot() {
  return EMPTY_SNAPSHOT;
}

