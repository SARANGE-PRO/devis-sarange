/**
 * completion-link-preview.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Textes de l'aperçu d'un lien de bon (fin de chantier, livraison, enlèvement)
 * ou de PV de levée des réserves quand il est partagé (WhatsApp, SMS, e-mail) :
 * titre et description des métadonnées de la page, lignes de l'image
 * d'aperçu. Personnalisés pour le client (nom, numéro de devis ou de bon), et
 * adaptés à l'état du document. Pendant de lib/quote-signature-preview.mjs
 * pour les devis.
 *
 * Module pur : testable par le runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { capitalizeLabel, getCompletionDocTypeLabel } from './completion-certificate.mjs';

const DEFAULT_COMPANY_NAME = 'SARANGE';
const SIGNED_STATUSES = ['received_no_reserves', 'received_with_reserves', 'reserves_lifted'];

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const tidy = (value) => value.replace(/\s+/g, ' ').replace(/\s+([,.:])/g, '$1').trim();

/** Lien général des poseurs (sans devis lié) : textes fixes. */
export const GENERIC_COMPLETION_LINK_TEXTS = Object.freeze({
  status: 'generic',
  title: 'Réception de vos travaux SARANGE',
  description:
    'Validez la réception de vos travaux et signez votre bon en ligne en quelques secondes.',
  headline: 'Réception de vos travaux',
  subline: 'Validez vos travaux et signez en ligne.',
  details: '',
  badge: 'Valider mes travaux',
});

/**
 * @param {object|null} preview  aperçu de session (lib/completion-signature-service.js)
 * @returns {{title: string, description: string, headline: string, subline: string,
 *            details: string, badge: string, status: string}}
 */
export const buildCompletionLinkPreviewTexts = (preview, { companyName } = {}) => {
  const company = text(companyName) || DEFAULT_COMPANY_NAME;

  if (!preview) {
    return {
      status: 'unknown',
      title: `Votre bon ${company} en ligne`,
      description:
        'Vérifiez vos ouvrages et signez votre bon en ligne en quelques secondes. Lien personnel et sécurisé.',
      headline: 'Votre bon en ligne',
      subline: 'Vérifiez et signez en quelques secondes.',
      details: '',
      badge: 'Ouvrir le bon',
    };
  }

  const status = text(preview.status) || 'sent';
  const recipient = text(preview.recipientName);
  const greeting = recipient ? `Bonjour ${recipient}` : 'Bonjour';
  const quoteNumber = text(preview.quoteNumber);
  const completionNumber = text(preview.completionNumber);
  const isLift = preview.mode === 'reserves-lift';
  const docType = text(preview.docType) || 'reception';
  const docLabel = getCompletionDocTypeLabel(docType);
  const isReception = docType === 'reception';
  const details = isLift
    ? completionNumber
      ? `Bon n° ${completionNumber}`
      : ''
    : quoteNumber
      ? `Devis n° ${quoteNumber}`
      : '';
  const isSigned = SIGNED_STATUSES.includes(status);

  if (isLift) {
    if (isSigned) {
      return {
        status,
        title: `PV de levée des réserves ${company} signé`,
        description: tidy(
          `Merci ${recipient || 'à vous'}, le PV de levée des réserves de votre chantier est signé. Vous pouvez le consulter et le télécharger via ce lien.`
        ),
        headline: 'Réserves levées, merci !',
        subline: recipient,
        details,
        badge: 'Consulter le PV signé',
      };
    }
    if (status === 'expired') {
      return {
        status,
        title: `Le lien de votre PV de levée des réserves ${company} a expiré`,
        description: `${greeting}, ce lien n'est plus actif. Contactez ${company} pour recevoir un nouveau lien.`,
        headline: 'Ce lien a expiré',
        subline: recipient,
        details,
        badge: 'Demander un nouveau lien',
      };
    }
    if (status === 'refused') {
      return {
        status,
        title: `PV de levée des réserves ${company} : signature refusée`,
        description: `${greeting}, la signature du PV de levée a été refusée. Contactez ${company} pour toute question.`,
        headline: 'Signature refusée',
        subline: recipient,
        details,
        badge: 'Consulter le PV',
      };
    }
    return {
      status,
      title: `PV de levée des réserves ${company} à signer`,
      description: `${greeting}, les réserves de votre chantier ont été corrigées : vérifiez et signez le PV de levée en ligne en quelques secondes. Lien personnel et sécurisé.`,
      headline: 'Levée des réserves de votre chantier',
      subline: recipient,
      details,
      badge: 'Vérifier et signer',
    };
  }

  if (isSigned) {
    return {
      status,
      title: `${capitalizeLabel(docLabel)} ${company} signé`,
      description: tidy(
        `Merci ${recipient || 'à vous'}, votre ${docLabel} est signé. Vous pouvez le consulter et le télécharger à tout moment via ce lien.`
      ),
      headline: 'Votre bon est signé, merci !',
      subline: recipient,
      details,
      badge: 'Consulter le bon signé',
    };
  }

  if (status === 'expired') {
    return {
      status,
      title: `Le lien de votre ${docLabel} ${company} a expiré`,
      description: `${greeting}, ce lien n'est plus actif. Contactez ${company} pour recevoir un nouveau lien.`,
      headline: 'Ce lien a expiré',
      subline: recipient,
      details,
      badge: 'Demander un nouveau lien',
    };
  }

  if (status === 'refused') {
    return {
      status,
      title: `${capitalizeLabel(docLabel)} ${company} : signature refusée`,
      description: `${greeting}, la signature de votre ${docLabel} a été refusée. Contactez ${company} pour toute question.`,
      headline: 'Signature refusée',
      subline: recipient,
      details,
      badge: 'Consulter le bon',
    };
  }

  const context = isReception
    ? `vos travaux${quoteNumber ? ` (devis n° ${quoteNumber})` : ''} sont terminés : vérifiez vos ouvrages`
    : `vos menuiseries vous ont été remises${quoteNumber ? ` (devis n° ${quoteNumber})` : ''} : vérifiez vos produits`;

  return {
    status,
    title: `Votre ${docLabel} ${company} est prêt à signer`,
    description: `${greeting}, ${context} et signez votre ${docLabel} en ligne en quelques secondes. Lien personnel et sécurisé.`,
    headline: isReception ? 'Vos travaux sont terminés' : 'Vos menuiseries vous ont été remises',
    subline: recipient,
    details,
    badge: 'Vérifier et signer',
  };
};
