/**
 * quote-signature-preview.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Textes de l'aperçu d'un lien de signature quand il est partagé (WhatsApp,
 * SMS, e-mail) : titre et description des métadonnées de la page, et lignes de
 * l'image d'aperçu. Personnalisés pour le client, afin qu'il comprenne d'un
 * coup d'œil qu'il s'agit de SON devis, à signer.
 *
 * Module pur (aucun import) : testable par le runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const DEFAULT_COMPANY_NAME = 'SARANGE';

const text = (value) => (typeof value === 'string' ? value.trim() : '');

const formatAmount = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return `${new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount)} TTC`;
};

/**
 * @param {object|null} preview  aperçu de session (lib/quote-signature-service.js)
 * @returns {{title: string, description: string, headline: string, subline: string,
 *            details: string, badge: string, status: string}}
 */
export const buildSignatureLinkPreviewTexts = (preview, { companyName } = {}) => {
  const company = text(companyName) || DEFAULT_COMPANY_NAME;

  if (!preview) {
    return {
      status: 'unknown',
      title: `Votre devis ${company} en ligne`,
      description:
        'Consultez votre devis et signez-le en ligne en quelques secondes. Lien personnel et sécurisé.',
      headline: 'Votre devis en ligne',
      subline: 'Consultez-le et signez-le en quelques secondes.',
      details: '',
      badge: 'Ouvrir le devis',
    };
  }

  const status = text(preview.status) || 'sent';
  const number = text(preview.quoteNumber);
  const numberLabel = number ? `n° ${number}` : '';
  const recipient = text(preview.recipientName);
  const greeting = recipient ? `Bonjour ${recipient}` : 'Bonjour';
  const amount = preview.variantsMode ? '' : formatAmount(preview.totalTTC);
  const details = [numberLabel ? `Devis ${numberLabel}` : 'Votre devis', amount]
    .filter(Boolean)
    .join(' · ');
  const isSignature = (text(preview.deliveryMode) || 'signature') === 'signature';

  if (status === 'signed') {
    return {
      status,
      title: `Devis ${company} ${numberLabel} signé`.replace(/\s+/g, ' ').trim(),
      description: `Merci ${recipient || 'à vous'}, votre devis ${numberLabel} est signé. Vous pouvez le consulter et le télécharger à tout moment via ce lien.`
        .replace(/\s+/g, ' ')
        .trim(),
      headline: 'Votre devis est signé, merci !',
      subline: recipient,
      details,
      badge: 'Consulter le devis signé',
    };
  }

  if (status === 'expired') {
    return {
      status,
      title: `Le lien de votre devis ${company} ${numberLabel} a expiré`.replace(/\s+/g, ' ').trim(),
      description: `${greeting}, ce lien n'est plus actif. Contactez ${company} pour recevoir un nouveau lien de signature.`,
      headline: 'Ce lien a expiré',
      subline: recipient,
      details,
      badge: 'Demander un nouveau lien',
    };
  }

  if (status === 'refused') {
    return {
      status,
      title: `Devis ${company} ${numberLabel} : signature refusée`.replace(/\s+/g, ' ').trim(),
      description: `${greeting}, la signature de votre devis ${numberLabel} a été refusée. Contactez ${company} pour toute question.`
        .replace(/\s+/g, ' ')
        .trim(),
      headline: 'Signature refusée',
      subline: recipient,
      details,
      badge: 'Consulter le devis',
    };
  }

  if (!isSignature) {
    return {
      status,
      title: `Votre devis ${company} ${numberLabel}`.replace(/\s+/g, ' ').trim(),
      description: `${greeting}, votre devis ${numberLabel}${amount ? ` (${amount})` : ''} est disponible en ligne : ouvrez ce lien pour le consulter.`
        .replace(/\s+/g, ' ')
        .trim(),
      headline: 'Votre devis est disponible',
      subline: recipient,
      details,
      badge: 'Consulter le devis',
    };
  }

  return {
    status,
    title: `Votre devis ${company} ${numberLabel} est prêt à être signé`
      .replace(/\s+/g, ' ')
      .trim(),
    description: `${greeting}, votre devis ${numberLabel}${amount ? ` (${amount})` : ''} vous attend : ouvrez ce lien pour le consulter et le signer en ligne en quelques secondes. Lien personnel et sécurisé.`
      .replace(/\s+/g, ' ')
      .trim(),
    headline: 'Votre devis est prêt à être signé',
    subline: recipient,
    details,
    badge: 'Signer en ligne',
  };
};
