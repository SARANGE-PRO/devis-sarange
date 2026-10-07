/**
 * demandes.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Demandes de devis reçues par e-mail (page admin /demande).
 *
 * Chaîne : le script Apps Script `sarange-inbox-scan.gs` (dépôt site-sarange)
 * lit la boîte contact@sarange.fr, écarte le bruit évident et pousse chaque
 * fil candidat vers /api/demandes/intake. C'est ICI que se décide, de façon
 * testable, si le fil est une demande de devis (score), avec quelle confiance,
 * et s'il mérite le libellé Gmail « DEVIS A FAIRE ». L'analyse fine (lignes
 * produit, infos manquantes, relance) est faite à la demande par Claude
 * (lib/demande-analysis.js) et rangée dans `analysis`.
 *
 * Module pur (aucun import) : partagé par le serveur, le navigateur et les
 * tests Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const DEMANDE_STATUSES = Object.freeze([
  Object.freeze({ value: 'nouvelle', label: 'Nouvelle' }),
  Object.freeze({ value: 'a-chiffrer', label: 'À chiffrer' }),
  Object.freeze({ value: 'devis-envoye', label: 'Devis envoyé' }),
  Object.freeze({ value: 'sans-suite', label: 'Sans suite' }),
]);

export const DEFAULT_DEMANDE_STATUS = 'nouvelle';

export const DEMANDE_CONFIDENCES = Object.freeze({
  HAUTE: 'haute',
  MOYENNE: 'moyenne',
  BASSE: 'basse',
});

/** Score minimal pour enregistrer le fil (en dessous : bruit, rien n'est stocké). */
export const MIN_SCORE_TO_STORE = 3;
/** Score à partir duquel le fil reçoit le libellé Gmail « DEVIS A FAIRE ». */
export const MIN_SCORE_FOR_LABEL = 7;
export const MAX_SCORE = 12;

export const MAX_DEMANDE_MESSAGES = 20;
export const MAX_MESSAGE_BODY_LENGTH = 15000;
export const MAX_SUBJECT_LENGTH = 300;
export const MAX_NOTES_LENGTH = 4000;
/** Plafond par pièce jointe transmise en base64 (limite hébergeur ~4,5 Mo par requête). */
export const MAX_ATTACHMENT_BYTES = 2.5 * 1024 * 1024;
export const MAX_ATTACHMENTS_TOTAL_BYTES = 3 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_DEMANDE = 12;

/** Types lisibles par l'analyse (PDF et images) ; le reste n'est que listé. */
export const ANALYZABLE_CONTENT_TYPES = Object.freeze([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const asString = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value));
const trimString = (value, max = 500) => asString(value).trim().slice(0, max);
const asBoolean = (value) => value === true || value === 'true';
const asInteger = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
};
const asNumber = (value, fallback = 0) => {
  const number = Number(typeof value === 'string' ? value.replace(',', '.') : value);
  return Number.isFinite(number) ? number : fallback;
};
const uniqueStrings = (list, max = 50) => {
  const seen = new Set();
  const result = [];
  for (const entry of Array.isArray(list) ? list : []) {
    const value = trimString(entry, 300);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= max) break;
  }
  return result;
};

export const normalizeDemandeStatus = (value) => {
  const normalized = asString(value).trim().toLowerCase();
  return DEMANDE_STATUSES.some((status) => status.value === normalized)
    ? normalized
    : DEFAULT_DEMANDE_STATUS;
};

export const demandeStatusLabel = (value) =>
  DEMANDE_STATUSES.find((status) => status.value === normalizeDemandeStatus(value))?.label || '';

export const confidenceFromScore = (score) => {
  const value = asInteger(score, 0);
  if (value >= MIN_SCORE_FOR_LABEL) return DEMANDE_CONFIDENCES.HAUTE;
  if (value >= MIN_SCORE_TO_STORE + 1) return DEMANDE_CONFIDENCES.MOYENNE;
  return DEMANDE_CONFIDENCES.BASSE;
};

export const confidenceLabel = (value) =>
  ({ haute: 'Confiance haute', moyenne: 'Confiance moyenne', basse: 'À vérifier' })[value] || '';

// ---------------------------------------------------------------------------
// Texte des e-mails
// ---------------------------------------------------------------------------

/**
 * Retire les citations de la réponse précédente (« Le 6 oct. 2026 à 15:40, X a
 * écrit : » suivi des lignes « > ») et les séparateurs de transfert, pour ne
 * garder que ce que l'expéditeur a réellement écrit. Tolérant : en cas de
 * doute, on garde le texte.
 */
export const stripQuotedReply = (text) => {
  const lines = asString(text).replace(/\r\n?/g, '\n').split('\n');
  const kept = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const nextTrimmed = (lines[index + 1] || '').trim();
    // En-tête de citation Gmail / Outlook (fr/en), éventuellement sur 2 lignes.
    const quoteHeader =
      /^(Le|On)\s.+\s(a écrit|wrote)\s?:?\s*$/i.test(trimmed) ||
      (/^(De|From)\s?:\s.+$/i.test(trimmed) && /^(Envoyé|Sent|Date)\s?:/i.test(nextTrimmed)) ||
      /^-{2,}\s*(Message (transféré|d'origine)|Original Message|Forwarded message)\s*-{2,}$/i.test(trimmed);
    if (quoteHeader) break;
    if (trimmed.startsWith('>')) continue;
    kept.push(line);
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const PHONE_PATTERN = /(?:\+33\s?[1-9]|0[1-9])(?:[\s.-]?\d{2}){4}\b/g;
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const POSTAL_CITY_PATTERN = /\b(\d{5})\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{2,40})/g;
// « 1200 x 1200 », « 920 X 2160 », « 1100 mm × 1300 », « L 1100 x H 1300 »
const DIMENSION_PATTERN =
  /\b(?:L\s*:?\s*)?(\d{2,4})\s*(?:mm|cm)?\s*[x×X*]\s*(?:H\s*:?\s*|hauteur\s*:?\s*)?(\d{2,4})\s*(?:mm|cm)?\b/g;

export const extractPhones = (text) =>
  uniqueStrings(
    (asString(text).match(PHONE_PATTERN) || []).map((entry) => entry.replace(/[\s.-]/g, '')),
    5
  );

export const extractEmails = (text) =>
  uniqueStrings((asString(text).match(EMAIL_PATTERN) || []).map((entry) => entry.toLowerCase()), 5);

export const extractDimensions = (text) => {
  const found = [];
  const source = asString(text);
  let match;
  DIMENSION_PATTERN.lastIndex = 0;
  while ((match = DIMENSION_PATTERN.exec(source)) && found.length < 40) {
    found.push(`${match[1]} x ${match[2]}`);
  }
  return uniqueStrings(found, 40);
};

const CITY_STOP_WORDS = /^(x|mm|cm|et|ou|le|la|les|avec|pour|dans|sur|a|à)$/i;

export const extractPostalCity = (text) => {
  const source = asString(text);
  POSTAL_CITY_PATTERN.lastIndex = 0;
  let match;
  while ((match = POSTAL_CITY_PATTERN.exec(source))) {
    const postalCode = match[1];
    // Codes postaux français : 01000 à 95999 (plus DOM 97/98).
    if (/^00|^99/.test(postalCode)) continue;
    const words = match[2].trim().split(/\s+/);
    const cityWords = [];
    for (const word of words) {
      if (CITY_STOP_WORDS.test(word)) break;
      // Un mot en minuscules après la ville est déjà la suite de la phrase.
      if (cityWords.length > 0 && /^[a-zà-ÿ]/.test(word)) break;
      cityWords.push(word);
      if (cityWords.length >= 4) break;
    }
    const city = cityWords.join(' ').replace(/[,.;:]+$/, '');
    if (!city || CITY_STOP_WORDS.test(city)) continue;
    return { postalCode, city };
  }
  return { postalCode: '', city: '' };
};

const PRODUCT_FAMILIES = Object.freeze([
  { key: 'fenêtre', pattern: /\bfen[êe]tres?\b/i },
  { key: 'porte-fenêtre', pattern: /\bportes?[\s-]fen[êe]tres?\b/i },
  { key: 'baie coulissante', pattern: /\b(baies?|coulissants?)\b/i },
  { key: 'châssis fixe', pattern: /\bch[âa]ssis\b/i },
  { key: 'porte', pattern: /\bportes?\s+(d'entr[ée]e|de service|alu|pvc|bois)\b/i },
  { key: 'porte de garage', pattern: /\bportes?\s+de\s+garage\b/i },
  { key: 'volet roulant', pattern: /\bvolets?\s+roulants?\b/i },
  { key: 'volet battant', pattern: /\bvolets?\s+battants?\b/i },
  { key: 'volet', pattern: /\bvolets?\b/i },
  { key: 'portail', pattern: /\bportails?\b/i },
  { key: 'véranda', pattern: /\bv[ée]randas?\b/i },
  { key: 'fenêtre de toit', pattern: /\b(velux|fen[êe]tres?\s+de\s+toit)\b/i },
  { key: 'store', pattern: /\bstores?\b/i },
  { key: 'moustiquaire', pattern: /\bmoustiquaires?\b/i },
  { key: 'vitrage', pattern: /\b(vitrages?|double\s+vitrage|triple\s+vitrage)\b/i },
  { key: 'menuiserie', pattern: /\bmenuiseries?\b/i },
]);

const REQUEST_KEYWORDS =
  /\b(devis|chiffrages?|chiffrer|demande de prix|tarifs?|cotation|offre de prix|estimation|meilleure offre|meilleur prix)\b/i;
const MATERIAL_KEYWORDS = /\b(pvc|alu|aluminium|bois|ral\s?\d{4}|anthracite|anodis[ée]|bicolore?)\b/i;
const SERVICE_KEYWORDS = /\b(pose|fourniture|d[ée]pose|installation)\b/i;
const VENDOR_PITCH =
  /(je me permets de vous (proposer|contacter (afin|pour) (de )?vous proposer)|nos services|partenariat|tarifs? professionnels?|nous (vous )?proposons|je vous propose|fabricant|grossiste|votre fournisseur|offre commerciale|prospection|candidature|recrutement|int[ée]rim|renfort|apporteur d'affaires|d[ée]veloppez votre|visibilit[ée])/i;
const TRANSACTIONAL_SUBJECT =
  /\b(facture|factures|proforma|pro forma|confirmation|votre commande|commande n|bon de livraison|livraison pr[ée]vue|relev[ée]|newsletter|promo|avis|notification|rappel de paiement|virement|re[çc]u)\b/i;
const NOREPLY_SENDER =
  /(no-?reply|noreply|ne-pas-repondre|nepasrepondre|notification|mailer-daemon|newsletter|marketing|info@news|e-receipt)/i;

/**
 * Score heuristique 0..MAX_SCORE : « ce fil ressemble-t-il à une demande de
 * devis adressée à Sarange ? ». Volontairement simple et lisible : chaque
 * indice vaut quelques points, le bruit connu en retire.
 */
export const scoreDemande = ({ subject = '', body = '', fromEmail = '', attachments = [] } = {}) => {
  const subjectText = asString(subject);
  const bodyText = asString(body);
  const fullText = `${subjectText}\n${bodyText}`;
  const matched = [];
  let score = 0;

  if (REQUEST_KEYWORDS.test(subjectText)) {
    score += 3;
    matched.push('objet : demande');
  }
  if (REQUEST_KEYWORDS.test(bodyText)) {
    score += 2;
    matched.push('corps : demande');
  }

  const dimensions = extractDimensions(fullText);
  if (dimensions.length > 0) {
    score += 2;
    matched.push(`cotes (${dimensions.length})`);
    if (dimensions.length >= 3) score += 1;
  } else if (/\b(largeur|hauteur|dimensions?|cotes?)\b/i.test(fullText)) {
    score += 1;
    matched.push('dimensions mentionnées');
  }

  const products = PRODUCT_FAMILIES.filter((family) => family.pattern.test(fullText)).map(
    (family) => family.key
  );
  if (products.length > 0) {
    score += Math.min(3, products.length);
    matched.push(`produits : ${products.slice(0, 4).join(', ')}`);
  }

  if (MATERIAL_KEYWORDS.test(fullText)) {
    score += 1;
    matched.push('matériau / couleur');
  }
  if (SERVICE_KEYWORDS.test(fullText)) {
    score += 1;
    matched.push('pose / fourniture');
  }

  const phones = extractPhones(bodyText);
  if (phones.length > 0) {
    score += 1;
    matched.push('téléphone');
  }
  const { postalCode, city } = extractPostalCity(fullText);
  if (postalCode) {
    score += 1;
    matched.push(`lieu : ${postalCode} ${city}`.trim());
  }

  const usefulAttachments = (Array.isArray(attachments) ? attachments : []).filter((entry) =>
    /^(application\/pdf|image\/)/i.test(asString(entry?.contentType))
  );
  if (usefulAttachments.length > 0) {
    score += 1;
    matched.push(`pièces jointes (${usefulAttachments.length})`);
  }

  if (VENDOR_PITCH.test(fullText)) {
    score -= 3;
    matched.push('démarchage (-3)');
  }
  if (TRANSACTIONAL_SUBJECT.test(subjectText)) {
    score -= 2;
    matched.push('objet transactionnel (-2)');
  }
  if (NOREPLY_SENDER.test(asString(fromEmail))) {
    score -= 3;
    matched.push('expéditeur automatique (-3)');
  }

  score = Math.max(0, Math.min(MAX_SCORE, score));

  return {
    score,
    confidence: confidenceFromScore(score),
    shouldStore: score >= MIN_SCORE_TO_STORE,
    shouldLabel: score >= MIN_SCORE_FOR_LABEL,
    matched,
    dimensions,
    products,
    phones,
    emails: extractEmails(bodyText),
    postalCode,
    city,
  };
};

// ---------------------------------------------------------------------------
// Charge utile reçue du script Apps Script (route /api/demandes/intake)
// ---------------------------------------------------------------------------

const sanitizeAttachment = (raw, budget) => {
  const name = trimString(raw?.name, 200) || 'piece-jointe';
  const contentType = trimString(raw?.contentType, 100).toLowerCase() || 'application/octet-stream';
  const size = Math.max(0, asInteger(raw?.size, 0));
  const dataBase64 = typeof raw?.dataBase64 === 'string' ? raw.dataBase64.trim() : '';
  const analyzable = ANALYZABLE_CONTENT_TYPES.includes(contentType);
  let kept = '';
  if (dataBase64 && analyzable) {
    const approxBytes = Math.floor((dataBase64.length * 3) / 4);
    if (approxBytes > 0 && approxBytes <= MAX_ATTACHMENT_BYTES && budget.remaining >= approxBytes) {
      kept = dataBase64;
      budget.remaining -= approxBytes;
    }
  }
  return { name, contentType, size, dataBase64: kept, analyzable };
};

const sanitizeMessage = (raw, budget) => {
  const body = stripQuotedReply(raw?.body).slice(0, MAX_MESSAGE_BODY_LENGTH);
  const attachments = (Array.isArray(raw?.attachments) ? raw.attachments : [])
    .slice(0, MAX_ATTACHMENTS_PER_DEMANDE)
    .map((entry) => sanitizeAttachment(entry, budget));
  const date = asString(raw?.date).trim();
  const parsedDate = new Date(date);
  return {
    id: trimString(raw?.id, 100),
    date: date && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : '',
    from: trimString(raw?.from, 200).toLowerCase(),
    fromName: trimString(raw?.fromName, 200),
    to: trimString(raw?.to, 500),
    body,
    attachments,
  };
};

/**
 * Valide et normalise la charge utile du scan. Lève une erreur (statusCode
 * 400) si le fil est inexploitable. Ne décide rien : le score vient après.
 */
export const sanitizeIntakePayload = (raw) => {
  const threadId = trimString(raw?.threadId, 100);
  if (!threadId) {
    throw Object.assign(new Error('threadId manquant.'), { statusCode: 400 });
  }
  const budget = { remaining: MAX_ATTACHMENTS_TOTAL_BYTES };
  const messages = (Array.isArray(raw?.messages) ? raw.messages : [])
    .slice(0, MAX_DEMANDE_MESSAGES)
    .map((entry) => sanitizeMessage(entry, budget))
    .filter((entry) => entry.body || entry.attachments.length > 0);
  if (messages.length === 0) {
    throw Object.assign(new Error('Aucun message exploitable dans ce fil.'), { statusCode: 400 });
  }
  const permalink = asString(raw?.permalink).trim();
  return {
    threadId,
    permalink: /^https:\/\/mail\.google\.com\//.test(permalink)
      ? permalink.slice(0, 500)
      : `https://mail.google.com/mail/u/0/#all/${threadId}`,
    subject: trimString(raw?.subject, MAX_SUBJECT_LENGTH),
    inSpam: asBoolean(raw?.inSpam),
    messages,
    scannedAt: new Date().toISOString(),
  };
};

/** Identité et score d'un fil à partir de la charge utile normalisée. */
export const describeIntake = (payload) => {
  const first = payload.messages[0];
  const last = payload.messages[payload.messages.length - 1];
  const bodies = payload.messages.map((entry) => entry.body).join('\n\n');
  const attachments = payload.messages.flatMap((entry) => entry.attachments);
  const scoring = scoreDemande({
    subject: payload.subject,
    body: bodies,
    fromEmail: first.from,
    attachments,
  });
  const domain = first.from.includes('@') ? first.from.split('@')[1] : '';
  return {
    from: { email: first.from, name: first.fromName, domain },
    receivedAt: first.date || payload.scannedAt,
    lastMessageAt: last.date || first.date || payload.scannedAt,
    messageCount: payload.messages.length,
    attachmentCount: attachments.length,
    hints: {
      score: scoring.score,
      confidence: scoring.confidence,
      matched: scoring.matched,
      dimensions: scoring.dimensions,
      products: scoring.products,
      phones: scoring.phones,
      emails: scoring.emails,
      postalCode: scoring.postalCode,
      city: scoring.city,
    },
    shouldStore: scoring.shouldStore,
    shouldLabel: scoring.shouldLabel,
  };
};

// ---------------------------------------------------------------------------
// Analyse Claude : schéma de sortie structurée et normalisation
// ---------------------------------------------------------------------------

export const LINE_CATEGORIES = Object.freeze([
  'fenetre',
  'porte-fenetre',
  'baie-coulissante',
  'chassis-fixe',
  'porte-entree',
  'porte-service',
  'porte-garage',
  'volet-roulant',
  'volet-battant',
  'portail',
  'cloture',
  'veranda',
  'fenetre-de-toit',
  'store',
  'moustiquaire',
  'garde-corps',
  'autre',
]);

export const LINE_CATEGORY_LABELS = Object.freeze({
  fenetre: 'Fenêtre',
  'porte-fenetre': 'Porte-fenêtre',
  'baie-coulissante': 'Baie coulissante',
  'chassis-fixe': 'Châssis fixe',
  'porte-entree': "Porte d'entrée",
  'porte-service': 'Porte de service',
  'porte-garage': 'Porte de garage',
  'volet-roulant': 'Volet roulant',
  'volet-battant': 'Volet battant',
  portail: 'Portail',
  cloture: 'Clôture',
  veranda: 'Véranda',
  'fenetre-de-toit': 'Fenêtre de toit',
  store: 'Store',
  moustiquaire: 'Moustiquaire',
  'garde-corps': 'Garde-corps',
  autre: 'Autre',
});

export const REQUESTER_TYPES = Object.freeze([
  'particulier',
  'professionnel',
  'architecte',
  'syndic',
  'bailleur',
  'collectivite',
  'inconnu',
]);

export const REQUESTER_TYPE_LABELS = Object.freeze({
  particulier: 'Particulier',
  professionnel: 'Professionnel',
  architecte: 'Architecte / maîtrise d’œuvre',
  syndic: 'Syndic',
  bailleur: 'Bailleur / gestionnaire',
  collectivite: 'Collectivité / association',
  inconnu: 'Non précisé',
});

export const MATERIALS = Object.freeze(['pvc', 'aluminium', 'bois', 'mixte', 'acier', 'inconnu']);
export const PRESTATIONS = Object.freeze(['fourniture-seule', 'fourniture-et-pose', 'pose-seule', 'inconnue']);
export const PRESTATION_LABELS = Object.freeze({
  'fourniture-seule': 'Fourniture seule',
  'fourniture-et-pose': 'Fourniture et pose',
  'pose-seule': 'Pose seule',
  inconnue: 'Non précisée',
});
export const HOUSING_AGES = Object.freeze(['plus-de-2-ans', 'moins-de-2-ans', 'neuf', 'inconnu']);
export const HOUSING_AGE_LABELS = Object.freeze({
  'plus-de-2-ans': 'Logement de plus de 2 ans',
  'moins-de-2-ans': 'Logement de moins de 2 ans',
  neuf: 'Construction neuve',
  inconnu: 'Ancienneté inconnue',
});
export const ATTACHMENT_NATURES = Object.freeze([
  'plan',
  'photo',
  'devis-concurrent',
  'cctp',
  'releve-cotes',
  'autre',
]);
export const PRIORITIES = Object.freeze(['haute', 'normale', 'basse']);

const stringProperty = (description) => ({ type: 'string', description });
const integerProperty = (description) => ({ type: 'integer', description });
const numberProperty = (description) => ({ type: 'number', description });
const booleanProperty = (description) => ({ type: 'boolean', description });
const enumProperty = (values, description) => ({ type: 'string', enum: [...values], description });
const stringArray = (description) => ({ type: 'array', items: { type: 'string' }, description });
const objectSchema = (properties, description) => ({
  type: 'object',
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/**
 * Schéma JSON de la sortie structurée. Toutes les propriétés sont requises et
 * `additionalProperties: false` partout (exigence de l'API). Les inconnues
 * valent '' / 0 / 'inconnu' : jamais null.
 */
export const ANALYSIS_JSON_SCHEMA = objectSchema({
  estDemandeDevis: booleanProperty(
    'true si le fil est bien une demande de devis ou de prix adressée à Sarange.'
  ),
  confiance: integerProperty('Confiance de 0 à 100 dans le fait que ce soit une demande de devis.'),
  resume: stringProperty('Une phrase en français résumant la demande (quoi, combien, où, pour qui).'),
  demandeur: objectSchema(
    {
      type: enumProperty(REQUESTER_TYPES, 'Nature du demandeur.'),
      nom: stringProperty('Nom de famille ou raison sociale tel qu’écrit. Vide si inconnu.'),
      prenom: stringProperty('Prénom si connu, sinon vide.'),
      societe: stringProperty('Société si le demandeur est un professionnel, sinon vide.'),
      telephone: stringProperty('Téléphone tel qu’écrit, sinon vide.'),
      email: stringProperty('Adresse e-mail du demandeur, sinon vide.'),
    },
    'Qui demande.'
  ),
  chantier: objectSchema(
    {
      adresse: stringProperty('Numéro et rue du chantier, sinon vide.'),
      codePostal: stringProperty('Code postal à 5 chiffres, sinon vide.'),
      ville: stringProperty('Ville, sinon vide.'),
      complement: stringProperty(
        'Étage, type de logement, accès, contraintes de copropriété : sinon vide.'
      ),
    },
    'Où se situe le chantier.'
  ),
  prestation: enumProperty(PRESTATIONS, 'Ce que le demandeur attend de Sarange.'),
  deposeExistant: booleanProperty(
    'true si la dépose de l’existant est demandée ou implicite (remplacement).'
  ),
  logementAnciennete: enumProperty(
    HOUSING_AGES,
    'Ancienneté du logement (pilote le taux de TVA). inconnu si rien ne l’indique.'
  ),
  lignes: {
    type: 'array',
    description:
      'Une ligne par produit distinct demandé. Fusionner les produits identiques en ajustant la quantité.',
    items: objectSchema({
      quantite: integerProperty('Quantité, 1 par défaut.'),
      categorie: enumProperty(LINE_CATEGORIES, 'Famille de produit.'),
      designation: stringProperty(
        'Libellé court et lisible (ex : « Fenêtre PVC blanc 2 vantaux, 1 OB »).'
      ),
      materiau: enumProperty(MATERIALS, 'Matériau.'),
      couleur: stringProperty('Couleur ou RAL tel qu’écrit, sinon vide.'),
      largeurMm: integerProperty(
        'Largeur en millimètres, 0 si inconnue. Convention française : largeur avant hauteur.'
      ),
      hauteurMm: integerProperty('Hauteur en millimètres, 0 si inconnue.'),
      vantaux: integerProperty('Nombre de vantaux, 0 si inconnu.'),
      ouverture: stringProperty(
        'Type d’ouverture (oscillo-battant, coulissant, fixe, battant…), sinon vide.'
      ),
      vitrage: stringProperty('Vitrage demandé (double, feuilleté, dépoli…), sinon vide.'),
      options: stringArray(
        'Options demandées (motorisation, serrure 5 points, seuil PMR, moustiquaire…).'
      ),
      piece: stringProperty('Pièce ou localisation (cuisine, séjour, chambre…), sinon vide.'),
      commentaire: stringProperty('Toute précision utile au chiffrage, sinon vide.'),
    }),
  },
  exigences: objectSchema(
    {
      uwMax: numberProperty('Uw maximal exigé en W/m²K, 0 si non précisé.'),
      swMax: numberProperty('Sw maximal exigé, 0 si non précisé.'),
      swMin: numberProperty('Sw minimal exigé, 0 si non précisé.'),
      delai: stringProperty('Délai ou date souhaitée, sinon vide.'),
      budget: stringProperty('Budget annoncé, sinon vide.'),
      autres: stringArray(
        'Autres exigences (garantie, marque de moteur, séparation fourniture/pose, acoustique…).'
      ),
    },
    'Contraintes techniques et commerciales exprimées.'
  ),
  piecesJointes: {
    type: 'array',
    description: 'Une entrée par pièce jointe listée ou lue.',
    items: objectSchema({
      nom: stringProperty('Nom du fichier.'),
      nature: enumProperty(ATTACHMENT_NATURES, 'Nature du document.'),
      contenuUtile: stringProperty(
        'Ce que le document apporte au chiffrage (cotes relevées, modèle, prix concurrent…), vide si non lu.'
      ),
    }),
  },
  infosManquantes: stringArray(
    'Informations indispensables au devis qui manquent (cotes, adresse, pose ou non, couleur, type de porte…).'
  ),
  questionsAPoser: stringArray(
    'Questions courtes à poser au demandeur, une par information manquante.'
  ),
  messageRelance: stringProperty(
    'Message e-mail en français, vouvoiement, prêt à envoyer, posant ces questions. Vide si rien ne manque.'
  ),
  priorite: enumProperty(PRIORITIES, 'Priorité de traitement.'),
  prioriteRaison: stringProperty(
    'Pourquoi cette priorité (volume, urgence, pro récurrent, concurrence…).'
  ),
  prochaineAction: stringProperty('Prochaine action concrète pour le bureau, en une phrase.'),
});

const normalizeLine = (raw) => ({
  quantite: Math.max(1, asInteger(raw?.quantite, 1)),
  categorie: LINE_CATEGORIES.includes(raw?.categorie) ? raw.categorie : 'autre',
  designation: trimString(raw?.designation, 200),
  materiau: MATERIALS.includes(raw?.materiau) ? raw.materiau : 'inconnu',
  couleur: trimString(raw?.couleur, 100),
  largeurMm: Math.max(0, asInteger(raw?.largeurMm, 0)),
  hauteurMm: Math.max(0, asInteger(raw?.hauteurMm, 0)),
  vantaux: Math.max(0, asInteger(raw?.vantaux, 0)),
  ouverture: trimString(raw?.ouverture, 100),
  vitrage: trimString(raw?.vitrage, 200),
  options: uniqueStrings(raw?.options, 12),
  piece: trimString(raw?.piece, 100),
  commentaire: trimString(raw?.commentaire, 500),
});

/** Résultat d'analyse sûr pour l'affichage, quelle que soit la réponse brute. */
export const normalizeAnalysis = (raw) => ({
  estDemandeDevis: asBoolean(raw?.estDemandeDevis),
  confiance: Math.max(0, Math.min(100, asInteger(raw?.confiance, 0))),
  resume: trimString(raw?.resume, 600),
  demandeur: {
    type: REQUESTER_TYPES.includes(raw?.demandeur?.type) ? raw.demandeur.type : 'inconnu',
    nom: trimString(raw?.demandeur?.nom, 150),
    prenom: trimString(raw?.demandeur?.prenom, 100),
    societe: trimString(raw?.demandeur?.societe, 150),
    telephone: trimString(raw?.demandeur?.telephone, 40),
    email: trimString(raw?.demandeur?.email, 200).toLowerCase(),
  },
  chantier: {
    adresse: trimString(raw?.chantier?.adresse, 200),
    codePostal: trimString(raw?.chantier?.codePostal, 10),
    ville: trimString(raw?.chantier?.ville, 100),
    complement: trimString(raw?.chantier?.complement, 400),
  },
  prestation: PRESTATIONS.includes(raw?.prestation) ? raw.prestation : 'inconnue',
  deposeExistant: asBoolean(raw?.deposeExistant),
  logementAnciennete: HOUSING_AGES.includes(raw?.logementAnciennete)
    ? raw.logementAnciennete
    : 'inconnu',
  lignes: (Array.isArray(raw?.lignes) ? raw.lignes : []).slice(0, 60).map(normalizeLine),
  exigences: {
    uwMax: Math.max(0, asNumber(raw?.exigences?.uwMax, 0)),
    swMax: Math.max(0, asNumber(raw?.exigences?.swMax, 0)),
    swMin: Math.max(0, asNumber(raw?.exigences?.swMin, 0)),
    delai: trimString(raw?.exigences?.delai, 200),
    budget: trimString(raw?.exigences?.budget, 200),
    autres: uniqueStrings(raw?.exigences?.autres, 20),
  },
  piecesJointes: (Array.isArray(raw?.piecesJointes) ? raw.piecesJointes : [])
    .slice(0, 20)
    .map((entry) => ({
      nom: trimString(entry?.nom, 200),
      nature: ATTACHMENT_NATURES.includes(entry?.nature) ? entry.nature : 'autre',
      contenuUtile: trimString(entry?.contenuUtile, 600),
    })),
  infosManquantes: uniqueStrings(raw?.infosManquantes, 20),
  questionsAPoser: uniqueStrings(raw?.questionsAPoser, 20),
  messageRelance: trimString(raw?.messageRelance, 4000),
  priorite: PRIORITIES.includes(raw?.priorite) ? raw.priorite : 'normale',
  prioriteRaison: trimString(raw?.prioriteRaison, 400),
  prochaineAction: trimString(raw?.prochaineAction, 400),
});

// ---------------------------------------------------------------------------
// Vers la fiche client et l'affichage
// ---------------------------------------------------------------------------

const splitDisplayName = (value) => {
  const cleaned = trimString(value, 200).replace(/["']/g, '').trim();
  if (!cleaned || cleaned.includes('@')) return { prenom: '', nom: '' };
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return { prenom: '', nom: parts[0] };
  // « Prénom Nom » : le dernier mot est le nom.
  return { prenom: parts.slice(0, -1).join(' '), nom: parts[parts.length - 1] };
};

/**
 * Données de fiche client (schéma de lib/client-cloud) à partir d'une demande :
 * l'analyse Claude si elle existe, sinon les indices du scan. Ne crée rien.
 */
export const buildClientDataFromDemande = (demande = {}) => {
  const analysis = demande?.analysis;
  const hints = demande?.hints || {};
  const fromName = splitDisplayName(demande?.from?.name);
  const requesterType = analysis?.demandeur?.type || 'inconnu';
  const isPro = requesterType !== 'particulier' && requesterType !== 'inconnu';
  const societe = analysis?.demandeur?.societe || '';
  const nom = societe || analysis?.demandeur?.nom || fromName.nom;
  const prenom = societe ? '' : analysis?.demandeur?.prenom || fromName.prenom;
  const chantierProvided = Boolean(analysis?.chantier?.adresse || analysis?.chantier?.ville);
  return {
    clientType: isPro ? 'professionnel' : 'particulier',
    nom: trimString(nom, 150),
    prenom: trimString(prenom, 100),
    telephone: analysis?.demandeur?.telephone || hints.phones?.[0] || '',
    email: analysis?.demandeur?.email || demande?.from?.email || '',
    adresse: chantierProvided ? analysis.chantier.adresse : '',
    codePostal: chantierProvided ? analysis.chantier.codePostal : hints.postalCode || '',
    ville: chantierProvided ? analysis.chantier.ville : hints.city || '',
  };
};

/** Une ligne de résumé pour la liste : l'analyse si elle existe, sinon les indices. */
export const buildDemandeSummary = (demande = {}) => {
  if (demande?.analysis?.resume) return demande.analysis.resume;
  const hints = demande?.hints || {};
  const parts = [];
  if (hints.products?.length) parts.push(hints.products.slice(0, 3).join(', '));
  if (hints.dimensions?.length) {
    parts.push(`${hints.dimensions.length} cote${hints.dimensions.length > 1 ? 's' : ''}`);
  }
  const attachmentCount = asInteger(demande?.attachmentCount, 0);
  if (attachmentCount > 0) {
    parts.push(`${attachmentCount} pièce${attachmentCount > 1 ? 's' : ''} jointe${attachmentCount > 1 ? 's' : ''}`);
  }
  return parts.join(' · ') || trimString(demande?.subject, 120) || 'Demande sans détail';
};

export const demandeDisplayName = (demande = {}) => {
  const analysis = demande?.analysis;
  if (analysis?.demandeur?.societe) return analysis.demandeur.societe;
  const full = [analysis?.demandeur?.prenom, analysis?.demandeur?.nom].filter(Boolean).join(' ');
  if (full) return full;
  return demande?.from?.name || demande?.from?.email || 'Expéditeur inconnu';
};

export const demandeCity = (demande = {}) =>
  demande?.analysis?.chantier?.ville || demande?.hints?.city || '';

/** Enregistrement Firestore → objet sûr pour l'API et l'écran (sans base64). */
export const normalizeDemande = (raw = {}) => ({
  id: trimString(raw?.id, 100),
  subject: trimString(raw?.subject, MAX_SUBJECT_LENGTH),
  permalink: trimString(raw?.permalink, 500),
  inSpam: asBoolean(raw?.inSpam),
  status: normalizeDemandeStatus(raw?.status),
  notes: trimString(raw?.notes, MAX_NOTES_LENGTH),
  from: {
    email: trimString(raw?.from?.email, 200).toLowerCase(),
    name: trimString(raw?.from?.name, 200),
    domain: trimString(raw?.from?.domain, 200).toLowerCase(),
  },
  receivedAt: trimString(raw?.receivedAt, 40),
  lastMessageAt: trimString(raw?.lastMessageAt, 40),
  messageCount: Math.max(0, asInteger(raw?.messageCount, 0)),
  attachmentCount: Math.max(0, asInteger(raw?.attachmentCount, 0)),
  hasNewMessages: asBoolean(raw?.hasNewMessages),
  hints: {
    score: Math.max(0, asInteger(raw?.hints?.score, 0)),
    confidence: Object.values(DEMANDE_CONFIDENCES).includes(raw?.hints?.confidence)
      ? raw.hints.confidence
      : confidenceFromScore(raw?.hints?.score),
    matched: uniqueStrings(raw?.hints?.matched, 20),
    dimensions: uniqueStrings(raw?.hints?.dimensions, 40),
    products: uniqueStrings(raw?.hints?.products, 16),
    phones: uniqueStrings(raw?.hints?.phones, 5),
    emails: uniqueStrings(raw?.hints?.emails, 5),
    postalCode: trimString(raw?.hints?.postalCode, 10),
    city: trimString(raw?.hints?.city, 100),
  },
  messages: (Array.isArray(raw?.messages) ? raw.messages : []).map((entry) => ({
    id: trimString(entry?.id, 100),
    date: trimString(entry?.date, 40),
    from: trimString(entry?.from, 200).toLowerCase(),
    fromName: trimString(entry?.fromName, 200),
    body: asString(entry?.body).slice(0, MAX_MESSAGE_BODY_LENGTH),
    attachments: (Array.isArray(entry?.attachments) ? entry.attachments : []).map((attachment) => ({
      name: trimString(attachment?.name, 200),
      contentType: trimString(attachment?.contentType, 100),
      size: Math.max(0, asInteger(attachment?.size, 0)),
      path: trimString(attachment?.path, 500),
      analyzable: asBoolean(attachment?.analyzable) && Boolean(attachment?.path),
    })),
  })),
  clientId: trimString(raw?.clientId, 200),
  clientCreatedAt: trimString(raw?.clientCreatedAt, 40),
  analysis: raw?.analysis ? normalizeAnalysis(raw.analysis) : null,
  analysisMeta: raw?.analysisMeta
    ? {
        model: trimString(raw.analysisMeta.model, 100),
        analyzedAt: trimString(raw.analysisMeta.analyzedAt, 40),
        analyzedBy: trimString(raw.analysisMeta.analyzedBy, 200),
        inputTokens: Math.max(0, asInteger(raw.analysisMeta.inputTokens, 0)),
        outputTokens: Math.max(0, asInteger(raw.analysisMeta.outputTokens, 0)),
      }
    : null,
  createdAt: trimString(raw?.createdAt, 40),
  updatedAt: trimString(raw?.updatedAt, 40),
});

/** Version allégée pour la liste (sans corps de messages). */
export const toDemandeListItem = (demande) => {
  const normalized = normalizeDemande(demande);
  return {
    ...normalized,
    messages: [],
    summary: buildDemandeSummary(normalized),
    displayName: demandeDisplayName(normalized),
    city: demandeCity(normalized),
    analyzed: Boolean(normalized.analysis),
  };
};
