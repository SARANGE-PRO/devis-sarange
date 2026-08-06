// ============================================================================
// ÉMISSION DES ÉVÉNEMENTS FINANCIERS vers sarange-finances — contrat v1.
//
// FICHIER JUMEAU de sarange-finances/lib/finance-contract.mjs (constructeurs
// d'enveloppes et dérivation d'identifiants identiques). Toute évolution du
// contrat doit être répercutée dans les deux dépôts.
//
// Principes non négociables :
//  - CRÉATION SEULE dans `fin_events` : l'identifiant du document EST
//    l'identifiant d'événement (déterministe, sans date ni aléa) — un hook
//    rejoué ou une réconciliation retombe sur le même document, jamais de
//    doublon. Le champ `processing` appartient à sarange-finances : il n'est
//    JAMAIS écrit ici.
//  - BEST-EFFORT : l'émission ne lève jamais d'exception — un échec est
//    journalisé en console et n'affecte ni la signature ni les e-mails.
//    (Filet de sécurité : la réconciliation côté sarange-finances re-balaie
//    les sessions signées.)
//  - TERMINOLOGIE : l'échéance finale de 5 % est émise sous `finalReserve*`.
//    Le champ historique `retenueGarantie` des sessions est lu en
//    compatibilité mais jamais réémis.
//
// Module PUR (aucune dépendance, db injectée) : testable par le runner Node.
// ============================================================================

export const FINANCIAL_EVENT_CONTRACT_VERSION = 1;
export const FINANCIAL_EVENTS_COLLECTION = 'fin_events';
export const FINANCIAL_EVENT_SOURCE = 'devis-sarange';

const FINANCIAL_EVENT_TYPES = ['quote-signed', 'completion-received', 'reserves-lifted'];

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toIsoString = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Number.isFinite(value.seconds)) return new Date(value.seconds * 1000).toISOString();
  return '';
};

export const buildFinancialEventId = (eventType, sessionId) => {
  if (!FINANCIAL_EVENT_TYPES.includes(eventType)) {
    throw new Error(`Type d'événement financier inconnu : ${eventType}`);
  }
  const normalizedSessionId = normalizeString(sessionId);
  if (!normalizedSessionId) {
    throw new Error("Identifiant de session manquant pour l'événement financier.");
  }
  return `${eventType}--${normalizedSessionId}`;
};

const sanitizeMilestones = (raw) =>
  (Array.isArray(raw) ? raw : [])
    .map((milestone) => ({
      id: normalizeString(milestone?.id),
      label: normalizeString(milestone?.label),
      percent: toFiniteNumber(milestone?.percent),
      amountTTC: toFiniteNumber(milestone?.amountTTC),
      dueLabel: normalizeString(milestone?.dueLabel),
    }))
    .filter((milestone) => milestone.id && Number.isFinite(milestone.amountTTC));

const sanitizeReserves = (raw) =>
  (Array.isArray(raw) ? raw : [])
    .map((reserve) => ({
      description: normalizeString(reserve?.description),
      delaiJours: toFiniteNumber(reserve?.delaiJours),
    }))
    .filter((reserve) => reserve.description);

const buildClientSnapshot = ({ name, email, phone, address = '' }) => ({
  name: normalizeString(name),
  email: normalizeString(email),
  phone: normalizeString(phone),
  address: normalizeString(address),
});

/** Enveloppe `quote-signed` depuis une session quoteSignatureSessions signée. */
export const buildQuoteSignedEvent = (session) => {
  const sessionId = normalizeString(session?.id || session?.sessionId);
  const eventId = buildFinancialEventId('quote-signed', sessionId);
  const quote = session?.quote || {};
  const recipient = session?.recipient || {};

  return {
    eventId,
    contractVersion: FINANCIAL_EVENT_CONTRACT_VERSION,
    eventType: 'quote-signed',
    sourceApplication: FINANCIAL_EVENT_SOURCE,
    sourceUid: normalizeString(session?.userId),
    quoteId: normalizeString(session?.quoteId),
    sessionId,
    occurredAt: toIsoString(session?.signedAt),
    payload: {
      quoteNumber: normalizeString(quote?.number),
      client: buildClientSnapshot({
        name: recipient?.fullName,
        email: recipient?.email,
        phone: recipient?.phone,
      }),
      totalTTC: toFiniteNumber(quote?.totalTTC),
      totalHT: toFiniteNumber(quote?.totalHT),
      tvaRate:
        quote?.tvaRate === null || quote?.tvaRate === undefined ? null : toFiniteNumber(quote?.tvaRate),
      milestones: sanitizeMilestones(quote?.payment?.milestones),
      selectedVariantId: normalizeString(session?.signature?.selectedVariantId),
      selectedVariantName: normalizeString(session?.signature?.selectedVariantName),
    },
  };
};

/**
 * Enveloppes `completion-received` (bon de fin de chantier signé) et
 * `reserves-lifted` (PV de levée signé, mode 'reserves-lift') depuis une
 * session completionSignatureSessions.
 */
export const buildCompletionEvent = (session) => {
  const sessionId = normalizeString(session?.id || session?.sessionId);
  const isLift = session?.mode === 'reserves-lift';
  const eventType = isLift ? 'reserves-lifted' : 'completion-received';
  const eventId = buildFinancialEventId(eventType, sessionId);
  const balance = session?.balance || {};
  const reserves = sanitizeReserves(session?.reserves);
  const hasReserves = !isLift && reserves.length > 0;
  const clientData = session?.clientData || {};

  const base = {
    eventId,
    contractVersion: FINANCIAL_EVENT_CONTRACT_VERSION,
    eventType,
    sourceApplication: FINANCIAL_EVENT_SOURCE,
    sourceUid: normalizeString(session?.userId),
    quoteId: normalizeString(session?.quoteId),
    sessionId,
    occurredAt: toIsoString(session?.signedAt),
  };

  const client = buildClientSnapshot({
    name:
      normalizeString(session?.clientName) ||
      [clientData?.prenom, clientData?.nom].map(normalizeString).filter(Boolean).join(' '),
    email: session?.clientEmail,
    phone: clientData?.telephone,
    address: [clientData?.adresseChantier, clientData?.codePostalChantier, clientData?.villeChantier]
      .map(normalizeString)
      .filter(Boolean)
      .join(' '),
  });

  if (isLift) {
    return {
      ...base,
      payload: {
        quoteNumber: normalizeString(session?.quoteNumber),
        client,
        liftNumber: normalizeString(session?.completionNumber),
        completionNumber: normalizeString(session?.originalCompletionNumber || session?.completionNumber),
        finalReserveAmount: toFiniteNumber(session?.amountDue),
        paymentReference: normalizeString(session?.paymentReference),
        reserves,
      },
    };
  }

  return {
    ...base,
    payload: {
      quoteNumber: normalizeString(session?.quoteNumber),
      client,
      completionNumber: normalizeString(session?.completionNumber),
      docType: normalizeString(session?.docType) || 'reception',
      hasReserves,
      reserves,
      invoiceReference: normalizeString(session?.invoiceReference),
      balance: {
        totalTTC: toFiniteNumber(balance?.totalDevisTTC ?? session?.totalDevisTTC),
        depositReceived: toFiniteNumber(balance?.acompteRecu ?? session?.acompteRecu),
        balanceBeforeFinalReserve: toFiniteNumber(balance?.soldeAvantRetenue),
        // Lecture de compatibilité du nom historique — jamais réémis tel quel.
        finalReserveAmount: toFiniteNumber(balance?.finalReserveAmount ?? balance?.retenueGarantie),
        amountDue: toFiniteNumber(balance?.soldeAPercevoir),
      },
    },
  };
};

const isAlreadyExistsError = (error) =>
  error?.code === 6 || /already exists/i.test(error?.message || '');

/**
 * Écrit un événement dans `fin_events` en création seule. Ne lève JAMAIS :
 * retourne { status: 'created' | 'existing' | 'disabled' | 'error' }.
 * `db` = Firestore Admin (injecté par l'appelant).
 */
export const emitFinancialEvent = async (db, event) => {
  try {
    if (process.env.FINANCIAL_EVENTS_DISABLED === '1') {
      return { status: 'disabled' };
    }
    if (!db || !event?.eventId) {
      throw new Error('Base Admin ou événement manquant.');
    }
    await db
      .collection(FINANCIAL_EVENTS_COLLECTION)
      .doc(event.eventId)
      .create({
        ...event,
        receivedAt: new Date().toISOString(),
        emittedBy: FINANCIAL_EVENT_SOURCE,
      });
    return { status: 'created', eventId: event.eventId };
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      return { status: 'existing', eventId: event?.eventId };
    }
    console.error(
      `Événement financier non émis (${event?.eventId || 'id inconnu'}) — non bloquant:`,
      error?.message
    );
    return { status: 'error', eventId: event?.eventId, error: error?.message };
  }
};

/**
 * Émission best-effort de `quote-signed` : construit ET écrit, sans jamais
 * lever. À appeler après la persistance du statut signé.
 */
export const emitQuoteSignedEvent = async (db, session) => {
  try {
    if (!session?.userId || !session?.quoteId) {
      return { status: 'skipped', reason: 'session sans userId/quoteId' };
    }
    return await emitFinancialEvent(db, buildQuoteSignedEvent(session));
  } catch (error) {
    console.error('Événement quote-signed non émis — non bloquant:', error?.message);
    return { status: 'error', error: error?.message };
  }
};

/**
 * Émission best-effort de `completion-received` / `reserves-lifted` depuis la
 * session de bon de fin de chantier signée (le mode 'reserves-lift' détermine
 * le type). Les sessions génériques (sans devis lié) sont ignorées.
 */
export const emitCompletionEvent = async (db, session) => {
  try {
    if (!session?.userId || !session?.quoteId) {
      return { status: 'skipped', reason: 'session sans userId/quoteId' };
    }
    return await emitFinancialEvent(db, buildCompletionEvent(session));
  } catch (error) {
    console.error('Événement de réception non émis — non bloquant:', error?.message);
    return { status: 'error', error: error?.message };
  }
};
