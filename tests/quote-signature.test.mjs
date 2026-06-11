import assert from 'node:assert/strict';

import {
  getQuoteSignatureReminderMeta,
  getQuoteDisplayStatus,
  getQuoteNumberDisplay,
  normalizeQuoteSignatureStatus,
  quoteNeedsResend,
} from '../lib/quote-signature.js';

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
