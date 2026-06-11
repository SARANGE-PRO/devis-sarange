const STATUS_FALLBACK = 'draft';

export const QUOTE_SIGNATURE_STATUSES = [
  'draft',
  'sent',
  'viewed',
  'signed',
  'refused',
  'expired',
  'archived',
];

export const QUOTE_SIGNATURE_STATUS_META = {
  draft: {
    label: 'Non envoyé',
    className: 'bg-slate-100 text-slate-600',
  },
  sent: {
    label: 'Envoyé',
    className: 'bg-blue-100 text-blue-700',
  },
  viewed: {
    label: 'Consulté',
    className: 'bg-cyan-100 text-cyan-700',
  },
  signed: {
    label: 'Signé',
    className: 'bg-green-100 text-green-700',
  },
  refused: {
    label: 'Refusé',
    className: 'bg-rose-100 text-rose-700',
  },
  expired: {
    label: 'Expiré',
    className: 'bg-amber-100 text-amber-700',
  },
  archived: {
    label: 'Archivé',
    className: 'bg-orange-100 text-orange-700',
  },
};

export const DEFAULT_SIGNATURE_EXPIRY_DAYS = 30;
export const QUOTE_SIGNATURE_REMINDER_META = {
  1: {
    level: 1,
    label: 'Relance J+3',
    shortLabel: 'J+3',
  },
  2: {
    level: 2,
    label: 'Relance J+10',
    shortLabel: 'J+10',
  },
  3: {
    level: 3,
    label: 'Relance J+30',
    shortLabel: 'J+30',
  },
};

const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === '[object Object]';

export const normalizeQuoteSignatureStatus = (value) => {
  if (typeof value !== 'string') return STATUS_FALLBACK;
  const normalized = value.trim().toLowerCase();
  return QUOTE_SIGNATURE_STATUSES.includes(normalized) ? normalized : STATUS_FALLBACK;
};

export const getQuoteNumberDisplay = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!normalized) return '';
  return normalized.replace(/^DV[-\s]*/i, '');
};

export const getQuoteSignatureStatusMeta = (status) =>
  QUOTE_SIGNATURE_STATUS_META[normalizeQuoteSignatureStatus(status)] ||
  QUOTE_SIGNATURE_STATUS_META[STATUS_FALLBACK];

export const getQuoteSignatureReminderMeta = (level) =>
  QUOTE_SIGNATURE_REMINDER_META[Number(level)] || null;

export const getQuoteSignatureWorkflow = (quote) =>
  isPlainObject(quote?.signatureWorkflow) ? quote.signatureWorkflow : {};

export const getQuoteDisplayStatus = (quote) =>
  normalizeQuoteSignatureStatus(
    getQuoteSignatureWorkflow(quote).status || quote?.status || STATUS_FALLBACK
  );

export const isQuoteSigned = (quote) => getQuoteDisplayStatus(quote) === 'signed';

export const quoteNeedsResend = (quote) =>
  getQuoteSignatureWorkflow(quote).needsResend === true;

export const canQuoteBeSent = (quote) => {
  const status = getQuoteDisplayStatus(quote);
  if (status === 'signed' && !quoteNeedsResend(quote)) return false;
  return status !== 'archived';
};

export const buildSignaturePageHref = (sessionId) =>
  `/signature/${encodeURIComponent(String(sessionId || ''))}`;

export const buildSignatureDocumentHref = (sessionId, type = 'original') =>
  `/api/quote-signatures/${encodeURIComponent(String(sessionId || ''))}/document?type=${encodeURIComponent(type)}`;

export const getSignatureExpiryDays = () => {
  const rawValue = Number.parseInt(process.env.NEXT_PUBLIC_QUOTE_SIGNATURE_EXPIRY_DAYS, 10);
  if (Number.isFinite(rawValue) && rawValue > 0) {
    return rawValue;
  }
  return DEFAULT_SIGNATURE_EXPIRY_DAYS;
};
