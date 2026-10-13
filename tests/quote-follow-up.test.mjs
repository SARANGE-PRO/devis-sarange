import assert from 'node:assert/strict';

import {
  FOLLOW_UP_STATUS,
  MIN_GAP_DAYS,
  QUOTE_REMINDER_STEPS,
  computeQuoteFollowUpState,
  countQuotesToFollowUp,
  daysBetweenMs,
  groupQuotesForFollowUp,
  toTimestampMs,
} from '../lib/quote-follow-up.mjs';

const DAY = 86_400_000;
const now = new Date(2026, 9, 13, 10, 0).getTime();
const daysAgo = (days) => new Date(now - days * DAY);

const sent = (daysSinceSent, extra = {}) => ({
  id: `q-${daysSinceSent}`,
  clientName: 'Client',
  signatureWorkflow: {
    sessionId: 'qs_x',
    deliveryMode: 'signature',
    status: 'sent',
    sentAt: daysAgo(daysSinceSent),
    expiresAt: new Date(daysAgo(daysSinceSent).getTime() + 30 * DAY),
    ...extra,
  },
});

// Horodatages : Date, ISO, Timestamp Firestore (toDate ou {seconds}).
assert.equal(toTimestampMs(null), 0);
assert.equal(toTimestampMs('n’importe quoi'), 0);
assert.equal(toTimestampMs(new Date(now)), now);
assert.equal(toTimestampMs(new Date(now).toISOString()), now);
assert.equal(toTimestampMs({ toDate: () => new Date(now) }), now);
assert.equal(toTimestampMs({ seconds: Math.floor(now / 1000), nanoseconds: 0 }), Math.floor(now / 1000) * 1000);
assert.equal(daysBetweenMs(daysAgo(3).getTime(), now), 3);
assert.equal(daysBetweenMs(new Date(2026, 9, 12, 23, 59).getTime(), new Date(2026, 9, 13, 0, 1).getTime()), 1, 'minuit à minuit');

assert.deepEqual(QUOTE_REMINDER_STEPS.map((step) => step.offsetDays), [3, 10, 30]);

// Hors suivi : brouillon, signé, refusé, archivé, ou sans session d'envoi.
assert.equal(computeQuoteFollowUpState({ status: 'draft' }, { now }).status, FOLLOW_UP_STATUS.HORS_SUIVI);
assert.equal(computeQuoteFollowUpState(sent(5, { status: 'signed' }), { now }).status, FOLLOW_UP_STATUS.HORS_SUIVI);
assert.equal(computeQuoteFollowUpState(sent(5, { status: 'refused' }), { now }).status, FOLLOW_UP_STATUS.HORS_SUIVI);
assert.equal(computeQuoteFollowUpState(sent(5, { status: 'archived' }), { now }).status, FOLLOW_UP_STATUS.HORS_SUIVI);
assert.equal(computeQuoteFollowUpState(sent(5, { sessionId: '' }), { now }).status, FOLLOW_UP_STATUS.HORS_SUIVI);

// Chaîne : J+3 due à partir du 3e jour, avant c'est « en attente ».
const fresh = computeQuoteFollowUpState(sent(1), { now });
assert.equal(fresh.status, FOLLOW_UP_STATUS.EN_ATTENTE);
assert.equal(fresh.nextLevel, 1);
assert.equal(fresh.daysSinceSent, 1);
assert.equal(daysBetweenMs(now, fresh.nextDateMs), 2);

const due1 = computeQuoteFollowUpState(sent(3), { now });
assert.equal(due1.status, FOLLOW_UP_STATUS.A_RELANCER);
assert.equal(due1.nextLevel, 1);
assert.equal(due1.nextLabel, 'Relance J+3');

// J+3 envoyée au 4e jour : la J+10 attend le 10e jour (pas 3 jours après).
const after1 = computeQuoteFollowUpState(sent(6, { lastReminderLevel: 1, lastReminderAt: daysAgo(2) }), { now });
assert.equal(after1.status, FOLLOW_UP_STATUS.EN_ATTENTE);
assert.equal(after1.nextLevel, 2);
assert.equal(daysBetweenMs(now, after1.nextDateMs), 4);

// J+3 envoyée très tard (12e jour) : la J+10 respecte le délai minimal.
const late = computeQuoteFollowUpState(sent(12, { lastReminderLevel: 1, lastReminderAt: daysAgo(0) }), { now });
assert.equal(late.status, FOLLOW_UP_STATUS.EN_ATTENTE);
assert.equal(daysBetweenMs(now, late.nextDateMs), MIN_GAP_DAYS);

const due3 = computeQuoteFollowUpState(sent(31, { lastReminderLevel: 2, lastReminderAt: daysAgo(20) }), { now });
assert.equal(due3.status, FOLLOW_UP_STATUS.A_RELANCER);
assert.equal(due3.nextLevel, 3);

// Trois relances parties : sans réponse ; lien expiré signalé mais devis gardé.
const done = computeQuoteFollowUpState(sent(40, { lastReminderLevel: 3, lastReminderAt: daysAgo(9) }), { now });
assert.equal(done.status, FOLLOW_UP_STATUS.SANS_REPONSE);
assert.equal(done.linkExpired, true, 'expiresAt dépassé');
assert.equal(computeQuoteFollowUpState(sent(5, { status: 'expired' }), { now }).linkExpired, true);
assert.equal(computeQuoteFollowUpState(sent(5, { status: 'viewed', viewedAt: daysAgo(4) }), { now }).viewedAtMs, daysAgo(4).getTime());

// Modifié après envoi : à renvoyer, avant toute relance.
assert.equal(computeQuoteFollowUpState(sent(5, { needsResend: true }), { now }).status, FOLLOW_UP_STATUS.A_RENVOYER);
// Envoyé par e-mail simple : pas de lien, suivi manuel.
assert.equal(computeQuoteFollowUpState(sent(5, { deliveryMode: 'email' }), { now }).status, FOLLOW_UP_STATUS.EMAIL_SIMPLE);

// Groupes et compteur.
const groups = groupQuotesForFollowUp(
  [
    sent(1),
    sent(3),
    sent(12),
    sent(5, { needsResend: true }),
    sent(5, { deliveryMode: 'email' }),
    sent(40, { lastReminderLevel: 3, lastReminderAt: daysAgo(9) }),
    sent(5, { status: 'signed' }),
    { id: 'draft', status: 'draft' },
  ],
  { now }
);
assert.equal(groups.count, 6);
assert.deepEqual(groups.due.map((item) => item.quote.id), ['q-12', 'q-3'], 'les plus anciens d’abord');
assert.deepEqual(groups.upcoming.map((item) => item.quote.id), ['q-1']);
assert.equal(groups.resend.length, 1);
assert.equal(groups.emailOnly.length, 1);
assert.equal(groups.unanswered.length, 1);
assert.equal(countQuotesToFollowUp(groups.due.map((item) => item.quote).concat(groups.resend.map((item) => item.quote)), { now }), 3);
assert.equal(countQuotesToFollowUp([], { now }), 0);
assert.equal(countQuotesToFollowUp(undefined, { now }), 0);

console.log('quote-follow-up ok');
