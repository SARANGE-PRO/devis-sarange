/**
 * quote-follow-up.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Suivi des devis envoyés : où en est chaque devis dans la chaîne de relance
 * (J+3, J+10, J+30 après l'envoi), à date, sur le modèle des relances de
 * factures de sarange-finances. RIEN N'EST ENVOYÉ AUTOMATIQUEMENT : le suivi
 * propose la relance due, l'envoi reste un clic après relecture.
 *
 * Entrée : un devis de « Mes devis » (`signatureWorkflow` résumé par
 * lib/quote-signature-service.js). Module pur, importe lib/quote-signature.js.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getQuoteDisplayStatus,
  getQuoteSignatureWorkflow,
  quoteNeedsResend,
} from './quote-signature.js';

/** Étapes, dans l'ordre : niveau = celui de l'e-mail de relance du serveur. */
export const QUOTE_REMINDER_STEPS = Object.freeze([
  { level: 1, offsetDays: 3, label: 'Relance J+3', shortLabel: 'J+3' },
  { level: 2, offsetDays: 10, label: 'Relance J+10', shortLabel: 'J+10' },
  { level: 3, offsetDays: 30, label: 'Relance J+30', shortLabel: 'J+30' },
]);

/** Délai minimal entre deux relances : pas d'acharnement en cas de rattrapage. */
export const MIN_GAP_DAYS = 3;

export const FOLLOW_UP_STATUS = Object.freeze({
  // Relance due aujourd'hui (ou en retard).
  A_RELANCER: 'a-relancer',
  // Prochaine relance plus tard.
  EN_ATTENTE: 'en-attente',
  // Les trois relances sont parties, toujours sans signature.
  SANS_REPONSE: 'sans-reponse',
  // Devis modifié après l'envoi : à renvoyer avant toute relance.
  A_RENVOYER: 'a-renvoyer',
  // Envoyé par e-mail simple (PDF joint, sans lien de signature) : suivi manuel.
  EMAIL_SIMPLE: 'email-simple',
  // Non envoyé, signé, refusé ou archivé : hors suivi.
  HORS_SUIVI: 'hors-suivi',
});

const DAY_MS = 86_400_000;

/** Horodatage Firestore (toDate / {seconds}), Date ou ISO → millisecondes, 0 si absent. */
export const toTimestampMs = (value) => {
  if (!value) return 0;
  let date;
  if (typeof value?.toDate === 'function') date = value.toDate();
  else if (value instanceof Date) date = value;
  else if (typeof value === 'object' && typeof value.seconds === 'number') {
    date = new Date(value.seconds * 1000);
  } else date = new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const startOfDay = (ms) => {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** Jours calendaires entre deux instants (minuit à minuit). */
export const daysBetweenMs = (fromMs, toMs) =>
  Math.round((startOfDay(toMs) - startOfDay(fromMs)) / DAY_MS);

export const getQuoteReminderStep = (level) =>
  QUOTE_REMINDER_STEPS.find((step) => step.level === Number(level)) || null;

/**
 * État du suivi d'un devis, à date.
 * @returns {{ status: string, displayStatus: string, sentAtMs: number,
 *   daysSinceSent: number, viewedAtMs: number, lastReminderLevel: number,
 *   lastReminderAtMs: number, expiresAtMs: number, linkExpired: boolean,
 *   nextLevel: number, nextDateMs: number, nextLabel: string }}
 */
export const computeQuoteFollowUpState = (quote, { now = Date.now() } = {}) => {
  const workflow = getQuoteSignatureWorkflow(quote);
  const displayStatus = getQuoteDisplayStatus(quote);
  const sentAtMs = toTimestampMs(workflow.sentAt);
  const lastReminderAtMs = toTimestampMs(workflow.lastReminderAt);
  const expiresAtMs = toTimestampMs(workflow.expiresAt);
  const base = {
    status: FOLLOW_UP_STATUS.HORS_SUIVI,
    displayStatus,
    sentAtMs,
    daysSinceSent: sentAtMs ? Math.max(0, daysBetweenMs(sentAtMs, now)) : 0,
    viewedAtMs: toTimestampMs(workflow.viewedAt),
    lastReminderLevel: Number(workflow.lastReminderLevel) || 0,
    lastReminderAtMs,
    expiresAtMs,
    linkExpired: false,
    nextLevel: 0,
    nextDateMs: 0,
    nextLabel: '',
  };

  // Jamais envoyé depuis l'app, ou conclu : rien à suivre.
  if (!workflow.sessionId || !sentAtMs) return base;
  if (['signed', 'refused', 'archived'].includes(displayStatus)) return base;

  if (quoteNeedsResend(quote)) return { ...base, status: FOLLOW_UP_STATUS.A_RENVOYER };
  if (workflow.deliveryMode !== 'signature') return { ...base, status: FOLLOW_UP_STATUS.EMAIL_SIMPLE };

  // Lien expiré : une relance le réactive (lib/quote-signature-service.js),
  // le devis reste donc dans la chaîne, avec la mention.
  const linkExpired =
    displayStatus === 'expired' || (expiresAtMs > 0 && expiresAtMs < now);

  const next = QUOTE_REMINDER_STEPS.find((step) => step.level > base.lastReminderLevel);
  if (!next) return { ...base, linkExpired, status: FOLLOW_UP_STATUS.SANS_REPONSE };

  let nextDateMs = sentAtMs + next.offsetDays * DAY_MS;
  if (lastReminderAtMs) {
    nextDateMs = Math.max(nextDateMs, lastReminderAtMs + MIN_GAP_DAYS * DAY_MS);
  }
  const due = startOfDay(nextDateMs) <= startOfDay(now);

  return {
    ...base,
    linkExpired,
    nextLevel: next.level,
    nextDateMs,
    nextLabel: next.label,
    status: due ? FOLLOW_UP_STATUS.A_RELANCER : FOLLOW_UP_STATUS.EN_ATTENTE,
  };
};

/**
 * Devis à suivre, par groupe, dans l'ordre d'affichage : à relancer (les plus
 * anciens d'abord), prochaines relances (la plus proche d'abord), à renvoyer,
 * envoyés par e-mail simple, sans réponse après trois relances.
 */
export const groupQuotesForFollowUp = (quotes, { now = Date.now() } = {}) => {
  const items = (Array.isArray(quotes) ? quotes : [])
    .map((quote) => ({ quote, state: computeQuoteFollowUpState(quote, { now }) }))
    .filter((item) => item.state.status !== FOLLOW_UP_STATUS.HORS_SUIVI);
  const by = (status) => items.filter((item) => item.state.status === status);
  const oldestFirst = (a, b) => b.state.daysSinceSent - a.state.daysSinceSent;

  return {
    count: items.length,
    due: by(FOLLOW_UP_STATUS.A_RELANCER).sort(oldestFirst),
    upcoming: by(FOLLOW_UP_STATUS.EN_ATTENTE).sort((a, b) => a.state.nextDateMs - b.state.nextDateMs),
    resend: by(FOLLOW_UP_STATUS.A_RENVOYER).sort(oldestFirst),
    emailOnly: by(FOLLOW_UP_STATUS.EMAIL_SIMPLE).sort(oldestFirst),
    unanswered: by(FOLLOW_UP_STATUS.SANS_REPONSE).sort(oldestFirst),
  };
};

/** Nombre de devis qui demandent une action aujourd'hui : relance due ou renvoi. */
export const countQuotesToFollowUp = (quotes, options) => {
  const groups = groupQuotesForFollowUp(quotes, options);
  return groups.due.length + groups.resend.length;
};
