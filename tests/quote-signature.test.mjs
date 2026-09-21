import assert from 'node:assert/strict';

import {
  getQuoteSignatureReminderMeta,
  getQuoteDisplayStatus,
  getQuoteNumberDisplay,
  normalizeQuoteSignatureStatus,
  quoteNeedsResend,
  quoteNumberMatchesSearch,
} from '../lib/quote-signature.js';

// Recherche par numéro : avec ou sans « DV », avec ou sans séparateurs, ou par
// une partie du numéro.
assert.equal(quoteNumberMatchesSearch('DV-262341234', 'DV-262341234'), true);
assert.equal(quoteNumberMatchesSearch('DV-262341234', 'dv 262341234'), true);
assert.equal(quoteNumberMatchesSearch('DV-262341234', 'dv262341234'), true);
assert.equal(quoteNumberMatchesSearch('DV-262341234', '262341234'), true);
assert.equal(quoteNumberMatchesSearch('DV-262341234', '1234'), true, 'fin du numéro');
assert.equal(quoteNumberMatchesSearch('DV-262341234', '2623'), true, 'début du numéro');
assert.equal(quoteNumberMatchesSearch('262341234', 'DV 262341234'), true, 'numéro stocké sans préfixe');
// Trop court, autre numéro, terme non numérique, numéro absent : aucun faux positif.
assert.equal(quoteNumberMatchesSearch('DV-262341234', '26'), false);
assert.equal(quoteNumberMatchesSearch('DV-262341234', '999999'), false);
assert.equal(quoteNumberMatchesSearch('DV-262341234', 'dupont'), false);
assert.equal(quoteNumberMatchesSearch('DV-262341234', 'dv'), false);
assert.equal(quoteNumberMatchesSearch('', '262341234'), false);
assert.equal(quoteNumberMatchesSearch(undefined, '262341234'), false);

assert.equal(normalizeQuoteSignatureStatus('SIGNED'), 'signed');
assert.equal(normalizeQuoteSignatureStatus(' viewed '), 'viewed');
assert.equal(normalizeQuoteSignatureStatus('unknown'), 'draft');
assert.equal(getQuoteNumberDisplay('DV-261261514'), '261261514');
assert.equal(getQuoteNumberDisplay('261261514'), '261261514');

assert.equal(
  getQuoteDisplayStatus({
    status: 'draft',
    signatureWorkflow: {
      status: 'viewed',
    },
  }),
  'viewed'
);

assert.equal(
  quoteNeedsResend({
    signatureWorkflow: {
      needsResend: true,
    },
  }),
  true
);

assert.deepEqual(getQuoteSignatureReminderMeta(2), {
  level: 2,
  label: 'Relance J+10',
  shortLabel: 'J+10',
});

console.log('quote-signature helpers ok');
