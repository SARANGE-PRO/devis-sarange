import {
  getCatalogueCoefficients,
  sanitizeCoefficientMap,
} from './catalogue-coefficients.js';
import { getCataloguePricing, sanitizePricing } from './catalogue-pricing.js';
import {
  getCustomGlazingOptions,
  sanitizeCustomGlazingOptions,
} from './glazing.js';

export const CATALOGUE_SCHEMA_VERSION = 1;

export function normalizeCataloguePayload(payload = {}) {
  return {
    coefficients: sanitizeCoefficientMap(payload?.coefficients),
    pricing: sanitizePricing(payload?.pricing),
    customGlazingOptions: sanitizeCustomGlazingOptions(payload?.customGlazingOptions),
  };
}

export function buildCatalogueRecord(payload = {}) {
  return {
    schemaVersion: CATALOGUE_SCHEMA_VERSION,
    ...normalizeCataloguePayload(payload),
  };
}

export function getCurrentCataloguePayload() {
  return {
    coefficients: getCatalogueCoefficients(),
    pricing: getCataloguePricing(),
    customGlazingOptions: getCustomGlazingOptions(),
  };
}
