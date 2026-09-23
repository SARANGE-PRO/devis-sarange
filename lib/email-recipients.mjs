/**
 * email-recipients.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Destinataires d'un envoi de devis, saisis dans la fenêtre de vérification :
 * une ou plusieurs adresses séparées par des virgules, points-virgules,
 * espaces ou retours à la ligne. Le premier destinataire est le client de la
 * session (relances, confirmation de signature) ; les autres reçoivent les
 * mêmes e-mails.
 *
 * Module pur (aucun import) : testable par le runner Node, partagé par la
 * fenêtre de vérification et le serveur.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const MAX_RECIPIENTS = 5;

// Forme raisonnable d'une adresse : pas une validation RFC complète, assez
// pour écarter une faute de frappe évidente.
const EMAIL_PATTERN = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']{2,}$/;

export const isEmailAddress = (value) => EMAIL_PATTERN.test(String(value || '').trim());

/**
 * Adresses distinctes (casse ignorée), dans l'ordre de saisie, adresses
 * invalides comprises : à contrôler avec validateRecipientEmails.
 */
export const parseRecipientEmails = (value) => {
  const source = Array.isArray(value) ? value.join(' ') : String(value || '');
  const seen = new Set();
  const result = [];

  source
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().replace(/^<|>$/g, ''))
    .filter(Boolean)
    .forEach((entry) => {
      const key = entry.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push(entry);
    });

  return result;
};

/**
 * @returns {string|null} message d'erreur, ou null si la liste est utilisable
 */
export const validateRecipientEmails = (emails) => {
  const list = Array.isArray(emails) ? emails : parseRecipientEmails(emails);
  if (!list.length) return 'Indiquez au moins une adresse e-mail.';
  if (list.length > MAX_RECIPIENTS) return `Au plus ${MAX_RECIPIENTS} destinataires par envoi.`;
  const invalid = list.find((entry) => !isEmailAddress(entry));
  if (invalid) return `« ${invalid} » n'est pas une adresse e-mail valide.`;
  return null;
};

export const formatRecipientEmails = (emails) =>
  (Array.isArray(emails) ? emails : parseRecipientEmails(emails)).join(', ');
