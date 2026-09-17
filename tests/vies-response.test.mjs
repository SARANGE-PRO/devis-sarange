import assert from 'node:assert/strict';
import { VIES_RESULTS, classifyViesResponse, describeViesResult } from '../lib/vies-response.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('numéro confirmé par l’État membre', () => {
  assert.equal(classifyViesResponse(200, { isValid: true, userError: 'VALID' }), VIES_RESULTS.VALID);
  // Format de l'API « check-vat-number ».
  assert.equal(classifyViesResponse(200, { valid: true }), VIES_RESULTS.VALID);
});

run('numéro réellement invalide : l’État membre a répondu', () => {
  assert.equal(
    classifyViesResponse(200, { isValid: false, userError: 'INVALID' }),
    VIES_RESULTS.INVALID
  );
  assert.equal(
    classifyViesResponse(200, { isValid: false, userError: 'INVALID_INPUT' }),
    VIES_RESULTS.INVALID
  );
  // Aucun code d'erreur : réponse négative ordinaire.
  assert.equal(classifyViesResponse(200, { valid: false }), VIES_RESULTS.INVALID);
});

run('saturation ou indisponibilité passagère : à retenter, jamais « invalide »', () => {
  // Cas constaté le 17/09/2026 sur le serveur français : HTTP 200 mais
  // isValid=false avec MS_MAX_CONCURRENT_REQ. Le confondre avec un numéro
  // invalide serait faux.
  assert.equal(
    classifyViesResponse(200, { isValid: false, userError: 'MS_MAX_CONCURRENT_REQ' }),
    VIES_RESULTS.TRANSIENT
  );
  assert.equal(
    classifyViesResponse(200, { isValid: false, userError: 'MS_UNAVAILABLE' }),
    VIES_RESULTS.TRANSIENT
  );
  assert.equal(
    classifyViesResponse(200, { isValid: false, userError: 'TIMEOUT' }),
    VIES_RESULTS.TRANSIENT
  );
  // Format enveloppé de « check-vat-number ».
  assert.equal(
    classifyViesResponse(200, {
      actionSucceed: false,
      errorWrappers: [{ error: 'MS_MAX_CONCURRENT_REQ' }],
    }),
    VIES_RESULTS.TRANSIENT
  );
  // Corps illisible (page de maintenance), erreurs serveur, réseau.
  assert.equal(classifyViesResponse(200, null), VIES_RESULTS.TRANSIENT);
  assert.equal(classifyViesResponse(503, null), VIES_RESULTS.TRANSIENT);
  assert.equal(classifyViesResponse(429, null), VIES_RESULTS.TRANSIENT);
  assert.equal(classifyViesResponse(0, null), VIES_RESULTS.TRANSIENT);
});

run('erreur définitive du service', () => {
  assert.equal(
    classifyViesResponse(200, { isValid: false, userError: 'IP_BLOCKED' }),
    VIES_RESULTS.ERROR
  );
  assert.equal(classifyViesResponse(400, { message: 'Bad Request' }), VIES_RESULTS.ERROR);
  assert.equal(classifyViesResponse(404, null), VIES_RESULTS.ERROR);
});

run('libellés de diagnostic', () => {
  assert.equal(describeViesResult(VIES_RESULTS.VALID), 'numéro confirmé');
  assert.equal(describeViesResult(VIES_RESULTS.INVALID), 'numéro non reconnu');
  assert.equal(describeViesResult(VIES_RESULTS.TRANSIENT), 'service saturé ou indisponible');
  assert.equal(describeViesResult(VIES_RESULTS.ERROR), 'erreur du service');
  assert.equal(describeViesResult(undefined), 'non consulté');
});

console.log('Tous les tests d’interprétation des réponses VIES ont reussi.');
