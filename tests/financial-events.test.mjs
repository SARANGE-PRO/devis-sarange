import assert from 'node:assert/strict';

import {
  buildCompletionEvent,
  buildFinancialEventId,
  buildQuoteSignedEvent,
  emitCompletionEvent,
  emitFinancialEvent,
  emitQuoteSignedEvent,
} from '../lib/financial-events.mjs';

// ---------------------------------------------------------------------------
// Fausse base Admin : capture les create(), peut simuler ALREADY_EXISTS ou
// une panne totale.
// ---------------------------------------------------------------------------

const createFakeDb = ({ failWith = null } = {}) => {
  const created = new Map();
  return {
    created,
    collection(name) {
      return {
        doc(id) {
          return {
            async create(data) {
              if (failWith) throw failWith;
              const key = `${name}/${id}`;
              if (created.has(key)) {
                const error = new Error('6 ALREADY_EXISTS: Document already exists');
                error.code = 6;
                throw error;
              }
              created.set(key, data);
            },
          };
        },
      };
    },
  };
};

// ---------------------------------------------------------------------------
// Identifiants déterministes — mêmes règles que sarange-finances
// ---------------------------------------------------------------------------

assert.equal(buildFinancialEventId('quote-signed', 'qs_1'), 'quote-signed--qs_1');
assert.throws(() => buildFinancialEventId('autre', 'x'), /inconnu/);

// ---------------------------------------------------------------------------
// quote-signed : enveloppe construite depuis la session signée
// ---------------------------------------------------------------------------

const quoteSession = {
  id: 'qs_1',
  userId: 'uid-1',
  quoteId: 'quote-1',
  signedAt: new Date('2026-08-01T10:00:00Z'),
  recipient: { fullName: 'Marie Dupont', email: 'marie@example.fr', phone: '06 01 02 03 04' },
  quote: {
    number: 'DV-1',
    totalTTC: 10000,
    totalHT: 9090.91,
    tvaRate: 10,
    payment: {
      milestones: [
        { id: 'deposit', label: 'Acompte', percent: 40, amountTTC: 4000, dueLabel: 'À la commande' },
        { id: 'balance', label: 'Solde', percent: 60, amountTTC: 6000, dueLabel: "À l'achèvement" },
      ],
    },
  },
};

const quoteEvent = buildQuoteSignedEvent(quoteSession);
assert.equal(quoteEvent.eventId, 'quote-signed--qs_1');
assert.equal(quoteEvent.payload.milestones.length, 2);
assert.equal(quoteEvent.payload.client.name, 'Marie Dupont');
assert.equal(quoteEvent.occurredAt, '2026-08-01T10:00:00.000Z');

// ---------------------------------------------------------------------------
// completion-received : compat retenueGarantie → finalReserveAmount, jamais
// de retenueGarantie dans l'événement émis
// ---------------------------------------------------------------------------

const completionSession = {
  id: 'cc_2',
  userId: 'uid-1',
  quoteId: 'quote-1',
  signedAt: '2026-08-04T15:00:00.000Z',
  quoteNumber: 'DV-1',
  clientName: 'Marie Dupont',
  clientEmail: 'marie@example.fr',
  completionNumber: 'BFC-1',
  docType: 'reception',
  invoiceReference: 'REF-1',
  reserves: [{ description: 'Joint à reprendre', delaiJours: 15 }],
  balance: {
    totalDevisTTC: 10000,
    acompteRecu: 4000,
    soldeAvantRetenue: 6000,
    retenueGarantie: 500,
    soldeAPercevoir: 5500,
  },
};

const completionEvent = buildCompletionEvent(completionSession);
assert.equal(completionEvent.eventType, 'completion-received');
assert.equal(completionEvent.payload.hasReserves, true);
assert.equal(completionEvent.payload.balance.finalReserveAmount, 500);
assert.ok(
  !JSON.stringify(completionEvent).includes('retenueGarantie'),
  'le terme historique retenueGarantie ne doit jamais être émis'
);

// PV de levée : type reserves-lifted, numéro d'origine préservé.
const liftEvent = buildCompletionEvent({
  ...completionSession,
  id: 'ccl_3',
  mode: 'reserves-lift',
  completionNumber: 'LR-9',
  originalCompletionNumber: 'BFC-1',
  amountDue: 500,
  paymentReference: 'VIR-5PC',
});
assert.equal(liftEvent.eventType, 'reserves-lifted');
assert.equal(liftEvent.eventId, 'reserves-lifted--ccl_3');
assert.equal(liftEvent.payload.liftNumber, 'LR-9');
assert.equal(liftEvent.payload.completionNumber, 'BFC-1');
assert.equal(liftEvent.payload.finalReserveAmount, 500);

// ---------------------------------------------------------------------------
// Émission : création seule, idempotente, jamais d'exception
// ---------------------------------------------------------------------------

{
  const db = createFakeDb();
  const first = await emitFinancialEvent(db, quoteEvent);
  assert.equal(first.status, 'created');
  assert.ok(db.created.has('fin_events/quote-signed--qs_1'));

  const stored = db.created.get('fin_events/quote-signed--qs_1');
  assert.equal(stored.emittedBy, 'devis-sarange');
  assert.ok(stored.receivedAt, 'receivedAt est posé à l’écriture');
  assert.ok(!('processing' in stored), 'le champ processing appartient à sarange-finances');

  // Ré-émission (hook rejoué) → même document, aucun doublon, aucun crash.
  const second = await emitFinancialEvent(db, quoteEvent);
  assert.equal(second.status, 'existing');
  assert.equal(db.created.size, 1);
}

{
  // Panne Firestore totale → retour 'error', jamais d'exception.
  const db = createFakeDb({ failWith: new Error('UNAVAILABLE: réseau coupé') });
  const result = await emitFinancialEvent(db, quoteEvent);
  assert.equal(result.status, 'error');
}

{
  // Kill-switch d'urgence.
  process.env.FINANCIAL_EVENTS_DISABLED = '1';
  const db = createFakeDb();
  const result = await emitFinancialEvent(db, quoteEvent);
  assert.equal(result.status, 'disabled');
  assert.equal(db.created.size, 0);
  delete process.env.FINANCIAL_EVENTS_DISABLED;
}

{
  // Wrappers best-effort : session invalide → 'skipped'/'error', sans lever.
  const db = createFakeDb();
  assert.equal((await emitQuoteSignedEvent(db, {})).status, 'skipped');
  assert.equal((await emitCompletionEvent(db, { userId: 'u' })).status, 'skipped');
  assert.equal((await emitQuoteSignedEvent(db, { userId: 'u', quoteId: 'q' })).status, 'error');
  assert.equal(db.created.size, 0);

  const ok = await emitCompletionEvent(db, { ...completionSession });
  assert.equal(ok.status, 'created');
}

console.log('financial-events.test.mjs : OK');
