/**
 * vies-response.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Interprétation d'une réponse de VIES (Commission européenne).
 *
 * VIES répond presque toujours HTTP 200, y compris quand il n'a PAS pu
 * interroger l'État membre : le champ `userError` distingue alors un numéro
 * réellement invalide (INVALID) d'une saturation passagère du serveur national
 * (MS_MAX_CONCURRENT_REQ, fréquente côté français) ou d'une indisponibilité.
 * Confondre les deux ferait passer un service saturé pour un numéro faux, ou
 * l'inverse : on classe donc chaque réponse avant d'en tirer une conclusion.
 *
 * Module pur : testable par le runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const VIES_RESULTS = Object.freeze({
  // L'État membre confirme le numéro.
  VALID: 'valid',
  // L'État membre a répondu : le numéro n'est pas (ou plus) valide.
  INVALID: 'invalid',
  // VIES ou l'État membre n'a pas pu traiter la demande : à retenter.
  TRANSIENT: 'transient',
  // Erreur définitive côté VIES (accès bloqué, service en maintenance…).
  ERROR: 'error',
});

// Codes VIES signalant une indisponibilité PASSAGÈRE.
const TRANSIENT_USER_ERRORS = new Set([
  'MS_MAX_CONCURRENT_REQ',
  'MS_MAX_CONCURRENT_REQ_TIME',
  'GLOBAL_MAX_CONCURRENT_REQ',
  'GLOBAL_MAX_CONCURRENT_REQ_TIME',
  'MS_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
  'TIMEOUT',
  'SERVER_BUSY',
]);

// Codes VIES signifiant que le NUMÉRO lui-même est en cause.
const INVALID_USER_ERRORS = new Set(['INVALID', 'INVALID_INPUT', 'INVALID_REQUESTER_INFO']);

const readUserError = (body) => {
  const direct = body?.userError;
  if (typeof direct === 'string' && direct.trim()) return direct.trim().toUpperCase();

  // Format de l'API « check-vat-number » : erreurs enveloppées.
  const wrapped = Array.isArray(body?.errorWrappers) ? body.errorWrappers[0]?.error : '';
  return typeof wrapped === 'string' ? wrapped.trim().toUpperCase() : '';
};

/**
 * Classe une réponse VIES.
 * @param {number} status code HTTP (0 si la requête n'a pas abouti)
 * @param {object|null} body corps JSON, ou null s'il est illisible
 */
export const classifyViesResponse = (status, body) => {
  if (status === 200) {
    // Page de maintenance ou corps illisible : le service ne répond pas
    // normalement, on retentera.
    if (!body || typeof body !== 'object') return VIES_RESULTS.TRANSIENT;

    if (body.isValid === true || body.valid === true) return VIES_RESULTS.VALID;

    const userError = readUserError(body);
    if (!userError || INVALID_USER_ERRORS.has(userError)) return VIES_RESULTS.INVALID;
    if (TRANSIENT_USER_ERRORS.has(userError)) return VIES_RESULTS.TRANSIENT;

    return VIES_RESULTS.ERROR;
  }

  if (status === 0 || status === 408 || status === 429 || status >= 500) {
    return VIES_RESULTS.TRANSIENT;
  }

  return VIES_RESULTS.ERROR;
};

/** Libellé court d'un résultat VIES, pour les messages de diagnostic. */
export const describeViesResult = (result) => {
  switch (result) {
    case VIES_RESULTS.VALID:
      return 'numéro confirmé';
    case VIES_RESULTS.INVALID:
      return 'numéro non reconnu';
    case VIES_RESULTS.TRANSIENT:
      return 'service saturé ou indisponible';
    case VIES_RESULTS.ERROR:
      return 'erreur du service';
    default:
      return 'non consulté';
  }
};
