/**
 * access-rules.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Qui a le droit d'utiliser devis-sarange, et qui peut gérer cette liste.
 *
 * Deux sources, réunies :
 *  - la configuration d'environnement (NEXT_PUBLIC_DEVIS_ALLOWED_EMAILS,
 *    DEVIS_ADMIN_EMAILS), historique, toujours honorée ;
 *  - le document Firestore `appAccess/devis` géré depuis Paramètres par un
 *    administrateur : { enforced, allowedEmails, admins }.
 *
 * Tant que la liste n'est pas APPLIQUÉE (enforced = false) et qu'aucune
 * adresse n'est configurée dans l'environnement, l'accès reste ouvert : c'est
 * le comportement historique, aucun verrouillage involontaire. Les
 * administrateurs, eux, sont toujours reconnus (adresse vérifiée).
 *
 * Module pur (aucun import) : testable par le runner Node, partagé par le
 * navigateur (messages) et le serveur (décision).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const MAX_ACCESS_EMAILS = 50;

export const ACCESS_ROLES = Object.freeze({ USER: 'user', ADMIN: 'admin' });

export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export const parseEmailList = (value) =>
  (Array.isArray(value) ? value : String(value || '').split(/[\s,;]+/))
    .map(normalizeEmail)
    .filter((entry) => entry.includes('@'))
    .filter((entry, index, list) => list.indexOf(entry) === index);

/** Configuration normalisée (document Firestore ou objet partiel). */
export const normalizeAccessConfig = (raw) => ({
  enforced: raw?.enforced === true,
  allowedEmails: parseEmailList(raw?.allowedEmails).slice(0, MAX_ACCESS_EMAILS),
  admins: parseEmailList(raw?.admins).slice(0, MAX_ACCESS_EMAILS),
});

/**
 * Décision d'accès pour un compte connecté.
 * @param {object} input
 * @param {string} input.email
 * @param {boolean} [input.emailVerified=true]  false pour un compte e-mail/mot
 *        de passe non confirmé : il ne peut endosser aucun droit nominatif,
 *        sinon n'importe qui saisirait l'adresse d'un administrateur.
 * @param {object} input.config   document `appAccess/devis` (ou null)
 * @param {string[]|string} [input.envAllowed]  NEXT_PUBLIC_DEVIS_ALLOWED_EMAILS
 * @param {string[]|string} [input.envAdmins]   DEVIS_ADMIN_EMAILS
 * @returns {{allowed: boolean, isAdmin: boolean, enforced: boolean, reason: string}}
 *   reason : 'admin' | 'listed' | 'open' | 'not-listed' | 'unverified' | 'no-email'
 */
export const evaluateAccess = ({ email, emailVerified = true, config, envAllowed = [], envAdmins = [] }) => {
  const normalized = normalizeEmail(email);
  const settings = normalizeAccessConfig(config);
  const envAllowedList = parseEmailList(envAllowed);
  const envAdminList = parseEmailList(envAdmins);

  // La liste d'environnement historique, si elle est renseignée, restreint
  // l'accès au même titre que l'application de la liste gérée dans l'app.
  const enforced = settings.enforced || envAllowedList.length > 0;
  const base = { allowed: false, isAdmin: false, enforced };

  if (!normalized) return { ...base, reason: 'no-email' };

  const listedAdmin = settings.admins.includes(normalized) || envAdminList.includes(normalized);
  const listedUser = settings.allowedEmails.includes(normalized) || envAllowedList.includes(normalized);

  if ((listedAdmin || listedUser) && emailVerified === false) {
    return enforced ? { ...base, reason: 'unverified' } : { ...base, allowed: true, reason: 'open' };
  }

  if (listedAdmin) return { ...base, allowed: true, isAdmin: true, reason: 'admin' };
  if (!enforced) return { ...base, allowed: true, reason: 'open' };
  return listedUser ? { ...base, allowed: true, reason: 'listed' } : { ...base, reason: 'not-listed' };
};

/** Message affiché sur l'écran de connexion quand l'accès est refusé. */
export const describeAccessDenial = ({ email, reason } = {}) => {
  const address = normalizeEmail(email);
  if (reason === 'unverified') {
    return `L'adresse ${address} n'est pas vérifiée. Connectez-vous avec le bouton Google (ou confirmez votre adresse e-mail) pour utiliser l'accès qui vous a été accordé.`;
  }
  if (reason === 'no-email') {
    return "Ce compte n'a pas d'adresse e-mail : impossible de vérifier son accès à l'application.";
  }
  return `Le compte ${address || 'utilisé'} n'est pas autorisé sur cette application. Demandez à l'administrateur de l'ajouter dans Paramètres, section « Accès à l'application ».`;
};

/** Texte prêt à coller (SMS, WhatsApp, e-mail) pour inviter un compte autorisé. */
export const buildAccessInvitationText = ({ email, appUrl }) =>
  [
    'Bonjour,',
    `vous avez maintenant accès à l'application de devis SARANGE : ${appUrl}`,
    `Connectez-vous avec le bouton Google et le compte ${normalizeEmail(email)}.`,
    'Vous y retrouverez vos propres devis, clients et catalogue.',
  ].join('\n');

/**
 * Nouvelle configuration après une action d'administration. Lève une erreur
 * (message lisible) si l'action est invalide.
 * @param {object} config
 * @param {object} action
 * @param {'add'|'remove'|'set-enforced'} action.action
 * @param {string} [action.email]
 * @param {'user'|'admin'} [action.role='user']
 * @param {boolean} [action.enforced]
 * @param {string} [action.actorEmail]  adresse de l'administrateur qui agit :
 *        il ne peut ni se retirer ni se rétrograder lui-même (verrouillage).
 */
export const applyAccessAction = (config, { action, email, role = ACCESS_ROLES.USER, enforced, actorEmail } = {}) => {
  const settings = normalizeAccessConfig(config);

  if (action === 'set-enforced') {
    return { ...settings, enforced: enforced === true };
  }

  const target = normalizeEmail(email);
  if (!target || !target.includes('@')) {
    throw new Error('Indiquez une adresse e-mail valide.');
  }

  const actor = normalizeEmail(actorEmail);
  const touchesActor = Boolean(actor) && actor === target;

  if (action === 'add') {
    if (touchesActor && role !== ACCESS_ROLES.ADMIN) {
      throw new Error('Vous ne pouvez pas retirer votre propre rôle d’administrateur.');
    }
    const allowedEmails = settings.allowedEmails.filter((entry) => entry !== target);
    const admins = settings.admins.filter((entry) => entry !== target);
    if (role === ACCESS_ROLES.ADMIN) admins.push(target);
    else allowedEmails.push(target);
    if (allowedEmails.length > MAX_ACCESS_EMAILS || admins.length > MAX_ACCESS_EMAILS) {
      throw new Error(`Au plus ${MAX_ACCESS_EMAILS} adresses.`);
    }
    return { ...settings, allowedEmails, admins };
  }

  if (action === 'remove') {
    if (touchesActor) {
      throw new Error('Vous ne pouvez pas retirer votre propre accès.');
    }
    return {
      ...settings,
      allowedEmails: settings.allowedEmails.filter((entry) => entry !== target),
      admins: settings.admins.filter((entry) => entry !== target),
    };
  }

  throw new Error('Action inconnue.');
};
