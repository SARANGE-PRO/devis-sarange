/**
 * email-custom-message.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Objet et message personnels de l'e-mail d'envoi d'un devis, modifiables dans
 * la fenêtre de vérification. Seul le message d'introduction est libre : le
 * reste du gabarit (bouton de signature, étapes, règlement, mentions) reste
 * figé, pour qu'un e-mail ne parte jamais sans son lien ni ses informations.
 *
 * Module pur (aucun import) : testable par le runner Node, partagé par le
 * serveur (rendu HTML) et la fenêtre de vérification (aperçu).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const MAX_CUSTOM_SUBJECT_LENGTH = 150;
export const MAX_CUSTOM_MESSAGE_LENGTH = 2000;

// Repère remplacé par le message dans l'aperçu texte : l'utilisateur voit son
// texte s'insérer dans le mail au fil de la saisie.
export const CUSTOM_MESSAGE_PLACEHOLDER = '[[MESSAGE]]';

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Objet sur une seule ligne, espaces repliés, longueur bornée. */
export const normalizeCustomSubject = (value) =>
  typeof value === 'string'
    ? value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CUSTOM_SUBJECT_LENGTH)
    : '';

/**
 * Message : retours à la ligne unifiés, fins de ligne nettoyées, jamais plus
 * d'une ligne vide d'affilée, longueur bornée.
 */
export const normalizeCustomMessage = (value) =>
  typeof value === 'string'
    ? value
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/g, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, MAX_CUSTOM_MESSAGE_LENGTH)
    : '';

const resolveCustomText = (value, defaultText, normalize) => {
  const normalized = normalize(value);
  if (!normalized) return null;
  // Texte identique au gabarit : rien de personnalisé à enregistrer, le
  // gabarit (avec sa mise en forme) reste utilisé.
  return normalized === normalize(defaultText) ? null : normalized;
};

/** Objet personnalisé, ou null si vide ou identique à l'objet par défaut. */
export const resolveCustomSubject = (value, defaultSubject) =>
  resolveCustomText(value, defaultSubject, normalizeCustomSubject);

/** Message personnalisé, ou null si vide ou identique au message par défaut. */
export const resolveCustomMessage = (value, defaultMessage) =>
  resolveCustomText(value, defaultMessage, normalizeCustomMessage);

/**
 * Message en HTML pour le gabarit : un paragraphe par bloc séparé d'une ligne
 * vide, retour à la ligne simple conservé, texte échappé (jamais de HTML
 * injecté depuis la saisie).
 */
export const customMessageToHtml = (
  text,
  { paragraphStyle = 'line-height: 1.6; color: #475569; font-size: 16px;' } = {}
) =>
  normalizeCustomMessage(text)
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => `<p style="${paragraphStyle}">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
