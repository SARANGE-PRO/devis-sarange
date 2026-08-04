import 'server-only';

import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';

import nodemailer from 'nodemailer';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { COMMERCIAL_DISCOUNT_PRODUCT_ID, getCompositeDimensions, getDisplayProductLabel } from './products';
import { CONTRACT_TYPES, resolveContractType } from './line-nature.mjs';
import { getClientFullName } from './client-cloud';
import { getFirebaseAdminDb, getFirebaseAdminStorage, isFirebaseAdminConfigured } from './firebase/admin';
import { matchCgvSnapshotEntry, cgvSnapshotEntryHasRetentionClause } from './cgv-templates.mjs';
import { toPdfPoints, topMmToPdfY, drawAtAnchor } from './pdf-signature-anchors.mjs';
import { buildCompletionPdfDocument, buildReservesLiftPdfDocument } from './completion-pdf-generator';
import {
  computeCompletionBalance,
  generateCompletionNumber,
  generateLiftNumber,
  getCompletionReminderMeta,
  getCompletionDocTypeLabel,
  getCompletionRatingCriteria,
  normalizeCompletionDocType,
  DEFAULT_RESERVE_LIFT_DELAY_DAYS,
  buildCompletionSignaturePageHref,
} from './completion-certificate.mjs';

const SESSION_COLLECTION = 'completionSignatureSessions';
const GENERIC_COLLECTION = 'genericCompletionSessions';
const STORAGE_ROOT = 'completion-certificates';
const PDF_CONTENT_TYPE = 'application/pdf';
const DEFAULT_FROM_NAME = 'SARANGE Menuiseries';
const GOOGLE_REVIEW_URL = 'https://g.page/r/CVmW4o9QAUpHEBE/review';

let smtpTransportPromise = null;

const createHttpError = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

const normalizeEnv = (value) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';

const getPublicBaseUrl = () =>
  normalizeEnv(process.env.QUOTE_SIGNATURE_BASE_URL || process.env.NEXT_PUBLIC_APP_URL).replace(/\/+$/, '');

const buildAbsoluteUrl = (path) => {
  const baseUrl = getPublicBaseUrl();
  if (!baseUrl) return path;
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
};

const getSmtpConfig = () => ({
  host: normalizeEnv(process.env.SMTP_HOST),
  port: Number.parseInt(process.env.SMTP_PORT || '', 10) || 0,
  secure: normalizeEnv(process.env.SMTP_SECURE).toLowerCase() === 'true',
  user: normalizeEnv(process.env.SMTP_USER),
  pass: normalizeEnv(process.env.SMTP_PASS),
  fromEmail: normalizeEnv(process.env.QUOTE_SIGNATURE_FROM_EMAIL),
  fromName: normalizeEnv(process.env.QUOTE_SIGNATURE_FROM_NAME) || DEFAULT_FROM_NAME,
  internalEmail: normalizeEnv(process.env.QUOTE_SIGNATURE_INTERNAL_EMAIL),
  replyTo: normalizeEnv(process.env.QUOTE_SIGNATURE_REPLY_TO),
});

const ensureServerConfig = ({ requireEmail = false } = {}) => {
  if (!isFirebaseAdminConfigured()) {
    throw createHttpError(
      "Le bon de fin de chantier n'est pas configuré. Vérifiez les variables Firebase Admin.",
      503
    );
  }
  if (requireEmail) {
    const smtp = getSmtpConfig();
    if (!smtp.host || !smtp.port || !smtp.fromEmail) {
      throw createHttpError(
        "Le bon de fin de chantier n'est pas configuré. Vérifiez la configuration SMTP.",
        503
      );
    }
  }
};

const getSmtpTransport = async () => {
  if (!smtpTransportPromise) {
    smtpTransportPromise = Promise.resolve().then(() => {
      const config = getSmtpConfig();
      return nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
      });
    });
  }
  return smtpTransportPromise;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatCurrency = (value) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);

const DISPLAY_TIME_ZONE = 'Europe/Paris';

const formatDateLabel = (value) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: DISPLAY_TIME_ZONE }).format(
    value instanceof Date ? value : new Date(value)
  );

const buildSessionId = (prefix = 'cc') => `${prefix}_${crypto.randomBytes(16).toString('hex')}`;

const readSessionDocumentRef = (db, sessionId) => db.collection(SESSION_COLLECTION).doc(sessionId);
const readGenericDocumentRef = (db, sessionId) => db.collection(GENERIC_COLLECTION).doc(sessionId);
const readQuoteDocumentRef = (db, userId, quoteId) =>
  db.collection('users').doc(userId).collection('quotes').doc(quoteId);

const uploadPdfBuffer = async (path, buffer) => {
  const bucket = getFirebaseAdminStorage().bucket();
  await bucket.file(path).save(buffer, {
    resumable: false,
    metadata: { contentType: PDF_CONTENT_TYPE, cacheControl: 'private, max-age=0, no-store' },
  });
  return path;
};

const downloadPdfBuffer = async (path) => {
  const bucket = getFirebaseAdminStorage().bucket();
  const [buffer] = await bucket.file(path).download();
  return buffer;
};

/**
 * Ouvrages listés sur le bon : uniquement les MENUISERIES réellement posées.
 * Les lignes de service et d'ajustement du devis (gestion des déchets,
 * métrage technique, forfait déplacement, remise commerciale, lignes de
 * texte libre) n'ont pas leur place sur un PV de réception : le client
 * réceptionne des ouvrages, pas une remise. Ces identifiants reprennent la
 * liste NON_MENUISERIE de lib/products.js (répartition de commission), sans
 * `custom-product` : un produit sur mesure est un vrai ouvrage à réceptionner.
 *
 * Libellé : l'intitulé COURT exact du récapitulatif du devis
 * (getDisplayProductLabel(productLabel), voir Cart.jsx/QuoteSummary.jsx),
 * jamais la désignation longue.
 */
const EXCLUDED_OUVRAGE_PRODUCT_IDS = new Set([
  'text-only',
  'gestion-dechets',
  'metrage-technique-validation',
  'forfait-deplacement',
  COMMERCIAL_DISCOUNT_PRODUCT_ID,
]);

// Dimensions L × H en mm : celles saisies sur la ligne, ou celles calculées
// du châssis composé. Best-effort silencieux (un composite corrompu ne doit
// jamais faire échouer le bon : la ligne sort simplement sans dimensions).
const getItemDimensionsLabel = (item) => {
  let widthMm = Number(item?.widthMm) || 0;
  let heightMm = Number(item?.heightMm) || 0;

  if ((!widthMm || !heightMm) && item?.isComposite) {
    try {
      const dims = getCompositeDimensions(item.composition, item.modules);
      widthMm = Number(dims?.width) || 0;
      heightMm = Number(dims?.height) || 0;
    } catch {
      return '';
    }
  }

  return widthMm > 0 && heightMm > 0 ? `L ${widthMm} × H ${heightMm} mm` : '';
};

export const buildOuvrageLinesFromCartItems = (cartItems = []) =>
  (Array.isArray(cartItems) ? cartItems : [])
    .filter((item) => item && !EXCLUDED_OUVRAGE_PRODUCT_IDS.has(item.productId))
    .map((item) => ({
      designation:
        getDisplayProductLabel(item.productLabel || item.customLabel || item.sheetName) ||
        'Menuiserie sur mesure',
      dimensions: getItemDimensionsLabel(item),
      repere: item.repere || '',
      qte: item.quantity || 1,
    }));

/* -------------------------------------------------------------------------- */
/*  Gabarit e-mail — REPRIS À L'IDENTIQUE des e-mails devis                   */
/*  (lib/quote-signature-service.js : layout responsive, header sombre à      */
/*  l'accent orange, bouton "bulletproof", footer). Dupliqué plutôt          */
/*  qu'importé, ces helpers étant privés au service devis (même principe que  */
/*  COMPANY dans completion-pdf-generator.js : ne jamais coupler le flux du   */
/*  bon au service critique du devis).                                        */
/* -------------------------------------------------------------------------- */

const SUPPORT_PHONE = '09 86 71 34 44';
const COMPANY_ADDRESS = '5 rue Gaspard Monge, Combs-la-Ville 77380';

const getResponsiveEmailLayout = ({ preheaderText = '', contentHtml = '' }) => `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <title>SARANGE Menuiseries</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    @media only screen and (max-width: 480px) {
      .sg-content { padding: 24px 16px !important; }
      .sg-block { padding: 14px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; width: 100%; word-break: break-word; -webkit-font-smoothing: antialiased; background-color: #f1f5f9;">
  <div style="display: none; max-height: 0px; overflow: hidden; mso-hide: all; font-size: 1px; color: #f1f5f9; line-height: 1px;">
    ${preheaderText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9" style="padding: 20px 0;">
    <tr>
      <td align="center" valign="top">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(15, 23, 42, 0.05); font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a;">
          ${contentHtml}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const getBulletproofEmailButton = (link, text, colorCode) => `
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 35px 0;">
    <tr>
      <td align="center">
        <table border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center" bgcolor="${colorCode}" style="border-radius: 50px;">
              <a href="${link}" target="_blank" style="font-size: 16px; font-family: Helvetica, Arial, sans-serif; color: #ffffff; text-decoration: none; border-radius: 50px; padding: 16px 35px; border: 1px solid ${colorCode}; display: inline-block; font-weight: bold;">
                ${text}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;

const getEmailHeaderHtml = ({ accentColor = '#f97316', subtitle = 'Menuiseries sur-mesure', notificationLabel = '' } = {}) => `
  <tr>
    <td bgcolor="#0f172a" align="center" style="padding: 35px 20px; border-bottom: 4px solid ${accentColor};">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -1px;">
        SARANGE<span style="color: ${accentColor};">.</span>${
  notificationLabel
    ? ` <span style="color: #64748b; font-weight: normal; font-size: 16px;">| ${escapeHtml(notificationLabel)}</span>`
    : ''
}
      </h1>
      ${subtitle ? `<p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 13px; text-transform: uppercase; letter-spacing: 2px;">${subtitle}</p>` : ''}
    </td>
  </tr>`;

const getEmailFooterHtml = () => `
  <tr>
    <td bgcolor="#f8fafc" style="border-top: 1px solid #e2e8f0; padding: 30px; text-align: center;">
      <p style="margin: 0 0 10px 0; color: #0f172a; font-weight: bold; font-size: 16px;">L'équipe SARANGE</p>
      <p style="margin: 0 0 15px 0; color: #64748b; font-size: 14px;">Une question ? Contactez-nous au <strong>${SUPPORT_PHONE}</strong></p>
      <p style="margin: 0; color: #94a3b8; font-size: 12px;">© ${new Date().getFullYear()} SARANGE Menuiseries — ${COMPANY_ADDRESS}</p>
    </td>
  </tr>`;

/* -------------------------------------------------------------------------- */
/*  Flux lié à un devis (token, session Firestore)                            */
/* -------------------------------------------------------------------------- */

const buildCompletionEmailHtml = ({ clientName, signingUrl, quoteNumber, docType = 'reception' }) => {
  const isReception = normalizeCompletionDocType(docType) === 'reception';
  const docLabel = getCompletionDocTypeLabel(docType);

  return getResponsiveEmailLayout({
    preheaderText: isReception
      ? 'Vos travaux sont terminés : vérifiez vos ouvrages et signez votre bon de fin de chantier en ligne…'
      : `Vos menuiseries vous ont été remises : vérifiez vos produits et signez votre ${docLabel} en ligne…`,
    contentHtml: `
      ${getEmailHeaderHtml({})}
      <tr>
        <td class="sg-content" style="padding: 40px 30px;">
          <h2 style="margin-top: 0; color: #0f172a; font-size: 20px;">Bonjour ${escapeHtml(clientName || 'Madame, Monsieur')},</h2>
          <p style="line-height: 1.6; color: #475569; font-size: 16px;">${
            isReception
              ? `Vos travaux (devis <strong>n°${escapeHtml(quoteNumber)}</strong>) sont terminés. Merci de votre confiance !`
              : `Vos menuiseries (devis <strong>n°${escapeHtml(quoteNumber)}</strong>) vous ont été remises. Merci de votre confiance !`
          }</p>
          <p style="line-height: 1.6; color: #475569; font-size: 16px;">Il ne reste qu'une étape : <strong style="color: #f97316;">${
            isReception
              ? 'vérifier vos ouvrages et signer votre bon de fin de chantier'
              : `vérifier vos produits et signer votre ${docLabel}`
          }</strong> sur notre plateforme sécurisée.</p>

          <div class="sg-block" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #f97316; padding: 25px; margin: 35px 0; border-radius: 8px;">
            <h3 style="margin-top: 0; margin-bottom: 20px; color: #0f172a; font-size: 16px;">✅ Comment ça se passe :</h3>
            <p style="margin: 0 0 12px 0; color: #334155; line-height: 1.5; font-size: 15px;"><strong>1.</strong> ${
              isReception
                ? 'Vérifiez chaque ouvrage installé (conforme, ou signalez un point à corriger).'
                : 'Vérifiez chaque produit remis (conforme, ou signalez un point à corriger).'
            }</p>
            <p style="margin: 0 0 12px 0; color: #334155; line-height: 1.5; font-size: 15px;"><strong>2.</strong> Donnez-nous votre avis sur la prestation.</p>
            <p style="margin: 0; color: #334155; line-height: 1.5; font-size: 15px;"><strong>3.</strong> Signez électroniquement : vous recevrez aussitôt votre exemplaire par e-mail.</p>
          </div>

          ${getBulletproofEmailButton(escapeHtml(signingUrl), `🖋️ Signer mon ${docLabel}`, '#f97316')}

          <p style="margin: 22px 0 0 0; color: #64748b; font-size: 13px; text-align: center;">${
            isReception
              ? 'La signature du bon déclenche les garanties légales de vos ouvrages (parfait achèvement, bon fonctionnement, décennale).'
              : 'La signature du bon atteste la remise de vos produits ; leurs garanties légales et fabricant continuent de s\'appliquer.'
          }</p>
        </td>
      </tr>
      ${getEmailFooterHtml()}
    `,
  });
};

const buildLiftEmailHtml = ({ clientName, signingUrl, completionNumber }) =>
  getResponsiveEmailLayout({
    preheaderText: 'Les réserves de votre chantier ont été corrigées : signez le PV de levée en ligne…',
    contentHtml: `
      ${getEmailHeaderHtml({})}
      <tr>
        <td class="sg-content" style="padding: 40px 30px;">
          <h2 style="margin-top: 0; color: #0f172a; font-size: 20px;">Bonjour ${escapeHtml(clientName || 'Madame, Monsieur')},</h2>
          <p style="line-height: 1.6; color: #475569; font-size: 16px;">Notre équipe est intervenue pour corriger les réserves formulées lors de la réception de vos travaux (bon <strong>n°${escapeHtml(completionNumber)}</strong>).</p>
          <p style="line-height: 1.6; color: #475569; font-size: 16px;">Pour clore votre dossier, il ne reste qu'à <strong style="color: #f97316;">constater la levée des réserves et signer le PV</strong> :</p>
          ${getBulletproofEmailButton(escapeHtml(signingUrl), '🖋️ Signer le PV de levée des réserves', '#f97316')}
          <p style="margin: 22px 0 0 0; color: #64748b; font-size: 13px; text-align: center;">Vous recevrez aussitôt votre exemplaire signé par e-mail.</p>
        </td>
      </tr>
      ${getEmailFooterHtml()}
    `,
  });

const buildSignedConfirmationHtml = ({ clientName, hasReserves, completionNumber, allFiveStars = false, isLift = false, docType = 'reception' }) => {
  const isReception = normalizeCompletionDocType(docType) === 'reception';
  const docLabel = getCompletionDocTypeLabel(docType);

  return getResponsiveEmailLayout({
    preheaderText: isLift
      ? 'Votre PV de levée des réserves signé est en pièce jointe. Votre dossier est clos !'
      : `Votre ${docLabel} signé est en pièce jointe. Merci de votre confiance !`,
    contentHtml: `
      ${getEmailHeaderHtml({ notificationLabel: isLift ? 'Levée des réserves' : isReception ? 'Bon de fin de chantier' : docLabel.replace(/^bon/, 'Bon') })}
      <tr>
        <td class="sg-content" style="padding: 40px 30px;">
          <h2 style="margin-top: 0; color: #0f172a; font-size: 20px;">Bonjour ${escapeHtml(clientName || 'Madame, Monsieur')},</h2>
          ${
            isLift
              ? `<p style="line-height: 1.6; color: #475569; font-size: 16px;">Votre PV de levée des réserves <strong>n°${escapeHtml(completionNumber)}</strong> a bien été signé : votre dossier est désormais <strong>clos</strong>. Vous trouverez votre exemplaire signé en pièce jointe.</p>`
              : `<p style="line-height: 1.6; color: #475569; font-size: 16px;">Votre ${docLabel} <strong>n°${escapeHtml(completionNumber)}</strong> a bien été signé${hasReserves ? ', <strong>avec réserves</strong>' : ', <strong>sans réserve</strong>'}. Vous trouverez votre exemplaire signé en pièce jointe.</p>`
          }
          ${
            isLift
              ? `<p style="line-height: 1.6; color: #475569; font-size: 16px;">Vos ouvrages restent couverts par les garanties légales applicables depuis la date de réception initiale.</p>`
              : hasReserves
              ? `<div class="sg-block" style="background-color: #fff7ed; border: 1px solid #fdba74; border-left: 4px solid #f97316; padding: 20px; margin: 25px 0; border-radius: 8px;">
                   <p style="margin: 0; color: #9a3412; line-height: 1.6; font-size: 15px;"><strong>Vos réserves sont prises en compte.</strong> Notre équipe vous recontactera pour ${isReception ? "planifier l'intervention de levée dans le délai convenu" : 'corriger les points signalés dans le délai convenu'}.</p>
                 </div>`
              : isReception
              ? `<p style="line-height: 1.6; color: #475569; font-size: 16px;">À compter de ce jour, vos ouvrages sont couverts par les garanties légales : parfait achèvement (1 an), bon fonctionnement (2 ans) et garantie décennale (10 ans).</p>`
              : `<p style="line-height: 1.6; color: #475569; font-size: 16px;">Vos produits bénéficient des garanties légales de conformité et des garanties propres de leurs fabricants.</p>`
          }
          <p style="line-height: 1.6; color: #475569; font-size: 16px;">Conservez précieusement ce document${isLift ? '.' : ' : il marque le point de départ de vos garanties.'}</p>
          ${
            // Sollicitation d'avis Google UNIQUEMENT quand les 3 critères sont
            // à 5 étoiles (choix produit assumé, voir mémo : ne jamais élargir
            // sans redemander).
            allFiveStars
              ? `<div class="sg-block" style="background-color: #f0fdf4; border: 1px solid #86efac; border-left: 4px solid #22c55e; padding: 25px; margin: 30px 0 0 0; border-radius: 8px; text-align: center;">
                   <p style="margin: 0 0 6px 0; color: #0f172a; font-weight: bold; font-size: 17px;">Merci pour votre confiance ! ⭐⭐⭐⭐⭐</p>
                   <p style="margin: 0; color: #475569; line-height: 1.6; font-size: 15px;">Toute l'équipe SARANGE vous remercie pour votre évaluation. Votre satisfaction est notre plus belle réussite. Pourriez-vous prendre 30 secondes pour partager votre expérience sur Google ? Cela aide grandement de futurs clients à nous faire confiance.</p>
                   ${getBulletproofEmailButton(GOOGLE_REVIEW_URL, '⭐ Partager mon avis sur Google', '#f97316')}
                 </div>`
              : ''
          }
        </td>
      </tr>
      ${getEmailFooterHtml()}
    `,
  });
};

const buildInternalCompletionHtml = ({ clientName, completionNumber, hasReserves, quoteNumber, adresse, reserves = [], ratings = null, photoLinks = [], docType = 'reception' }) => {
  const reserveItems = (Array.isArray(reserves) ? reserves : [])
    .map(
      (reserve, index) =>
        `<p style="margin: 0 0 8px 0; color: #9a3412; line-height: 1.5; font-size: 14px;"><strong>${index + 1}.</strong> ${escapeHtml(reserve.description)} <em>(délai : ${Number(reserve.delaiJours) || 30} j)</em></p>`
    )
    .join('');
  const ratingCriteria = getCompletionRatingCriteria(docType);
  const ratingLine = ratings
    ? `<p style="line-height: 1.6; color: #64748b; font-size: 14px;">Notes du client : ${ratingCriteria
        .map((criterion) => `${criterion.label.toLowerCase()} ${ratings[criterion.key]}/5`)
        .join(' · ')}</p>`
    : '';
  const photoLinksHtml = photoLinks.length
    ? `<p style="line-height: 1.8; color: #475569; font-size: 14px;"><strong>${photoLinks.length} photo(s) du client</strong> (les ${Math.min(photoLinks.length, MAX_EMAIL_PHOTO_ATTACHMENTS)} premières en pièces jointes, toutes consultables un an) : ${photoLinks
        .map((link) => `<a href="${link.url}" target="_blank" style="color: #f97316; font-weight: bold;">${escapeHtml(link.name)}</a>`)
        .join(' · ')}</p>`
    : '';

  return getResponsiveEmailLayout({
    preheaderText: `Bon de fin de chantier signé par ${clientName || 'un client'}${hasReserves ? ' (avec réserves)' : ''}.`,
    contentHtml: `
      ${getEmailHeaderHtml({ subtitle: '', notificationLabel: 'Notification interne' })}
      <tr>
        <td class="sg-content" style="padding: 40px 30px;">
          <h2 style="margin-top: 0; color: #0f172a; font-size: 20px;">${
            hasReserves
              ? '⚠️ Bon signé AVEC réserves'
              : `✅ ${getCompletionDocTypeLabel(docType).replace(/^bon/, 'Bon')} signé`
          }</h2>
          <p style="line-height: 1.6; color: #475569; font-size: 16px;"><strong>${escapeHtml(clientName || 'Client')}</strong> vient de signer le bon <strong>n°${escapeHtml(completionNumber)}</strong>${quoteNumber ? ` (devis n°${escapeHtml(quoteNumber)})` : ''}.</p>
          ${adresse ? `<p style="line-height: 1.6; color: #475569; font-size: 16px;">Chantier : ${escapeHtml(adresse)}</p>` : ''}
          ${ratingLine}
          ${photoLinksHtml}
          ${
            hasReserves
              ? `<div class="sg-block" style="background-color: #fff7ed; border: 1px solid #fdba74; border-left: 4px solid #f97316; padding: 20px; margin: 25px 0; border-radius: 8px;">
                   <p style="margin: 0 0 12px 0; color: #9a3412; line-height: 1.6; font-size: 15px;"><strong>Réserves formulées — planifier l'intervention de levée :</strong></p>
                   ${reserveItems}
                 </div>`
              : ''
          }
          <p style="line-height: 1.6; color: #475569; font-size: 16px;">Document signé en pièce jointe.</p>
        </td>
      </tr>
      ${getEmailFooterHtml()}
    `,
  });
};

const buildInternalRefusalHtml = ({ reason }) =>
  getResponsiveEmailLayout({
    preheaderText: 'Un client a refusé de signer un bon de fin de chantier.',
    contentHtml: `
      ${getEmailHeaderHtml({ accentColor: '#e11d48', subtitle: '', notificationLabel: 'Notification interne' })}
      <tr>
        <td class="sg-content" style="padding: 40px 30px;">
          <h2 style="margin-top: 0; color: #0f172a; font-size: 20px;">⚠️ Bon de fin de chantier refusé</h2>
          <p style="line-height: 1.6; color: #475569; font-size: 16px;">Un client a refusé de signer un bon de fin de chantier.</p>
          ${reason ? `<p style="line-height: 1.6; color: #475569; font-size: 16px;">Motif indiqué : <strong>${escapeHtml(reason)}</strong></p>` : ''}
        </td>
      </tr>
      ${getEmailFooterHtml()}
    `,
  });

export const createAndSendQuoteLinkedCompletion = async ({
  userId,
  quoteId,
  acompteRecu,
  invoiceReference,
  // 'email' : envoi du lien de signature par e-mail (comportement historique).
  // 'link'  : création de la session SEULEMENT — l'URL est renvoyée pour que
  //           l'utilisateur la copie et l'envoie lui-même (SMS, WhatsApp...).
  deliveryMode = 'email',
  // Fourniture SEULE uniquement : 'enlevement' | 'livraison', choisi
  // manuellement dans la modale (la détection pose/sans-pose est automatique,
  // le mode de remise ne l'est jamais).
  deliveryType = '',
  // Adresse saisie dans la modale : prime sur celle du devis (client qui a
  // changé d'e-mail, envoi à un conjoint...). L'e-mail du devis reste le
  // pré-rempli, jamais une contrainte.
  overrideEmail = '',
}) => {
  ensureServerConfig({ requireEmail: deliveryMode === 'email' });

  if (!['email', 'link'].includes(deliveryMode)) {
    throw createHttpError("Mode d'envoi invalide.", 400);
  }

  const trimmedRef = normalizeEnv(invoiceReference);
  if (!trimmedRef) {
    throw createHttpError('La référence facture est obligatoire.', 400);
  }
  const acompte = Number(acompteRecu);
  if (!Number.isFinite(acompte) || acompte < 0) {
    throw createHttpError('Acompte invalide.', 400);
  }

  const db = getFirebaseAdminDb();
  const quoteRef = readQuoteDocumentRef(db, userId, quoteId);
  const quoteSnapshot = await quoteRef.get();
  if (!quoteSnapshot.exists) {
    throw createHttpError('Devis introuvable.', 404);
  }
  const quoteData = quoteSnapshot.data();

  // Volontairement PAS de blocage sur le statut de signature numérique : de
  // nombreux devis sont signés sur PAPIER (rendez-vous client), un état que
  // l'app ne peut pas observer. On fait confiance au jugement de
  // l'utilisateur plutôt que d'imposer un état qu'on ne peut pas vérifier.

  const clientData = quoteData?.payload?.clientData || {};
  const clientEmail = normalizeEnv(overrideEmail).slice(0, 254) || normalizeEnv(clientData.email);
  if (deliveryMode === 'email' && !clientEmail) {
    throw createHttpError("Renseignez une adresse e-mail, ou créez un lien à copier.", 400);
  }
  const clientName = getClientFullName(clientData) || '';

  // Adresse du chantier, même logique que le bloc « Adresse chantier » du
  // devis (buildClientLines dans lib/pdf-generator.js) : si le client a coché
  // « même adresse », les champs chantier sont VIDES et l'adresse réelle est
  // dans les champs de facturation.
  const useBillingAddress = clientData?.memeAdresseChantier === true || !clientData?.adresseChantier;
  const jobSiteAddress = useBillingAddress ? clientData?.adresse : clientData?.adresseChantier;
  const jobSitePostalCode = useBillingAddress ? clientData?.codePostal : clientData?.codePostalChantier;
  const jobSiteCity = useBillingAddress ? clientData?.ville : clientData?.villeChantier;

  // Lignes effectives : la variante retenue à la signature (ou active) pour
  // un devis multi-variantes, les lignes racine sinon.
  const payload = quoteData?.payload || {};
  let cartItems = Array.isArray(payload.cartItems) ? payload.cartItems : [];
  let quoteSettings = payload.quoteSettings || {};
  if (payload.variantsMode === true && Array.isArray(payload.variants)) {
    const wantedVariantId =
      quoteData?.signatureWorkflow?.selectedVariantId || payload.activeVariantId || '';
    const variant =
      payload.variants.find((entry) => entry?.id === wantedVariantId) || payload.variants[0] || {};
    cartItems = Array.isArray(variant.cartItems) ? variant.cartItems : [];
    quoteSettings = variant.quoteSettings || {};
  }

  const ouvrages = buildOuvrageLinesFromCartItems(cartItems);
  if (!ouvrages.length) {
    throw createHttpError('Ce devis ne contient aucune menuiserie à réceptionner.', 400);
  }

  // Détection AUTOMATIQUE pose / fourniture seule — même source de vérité que
  // la TVA et les CGV (resolveContractType). Le MODE de remise (enlèvement ou
  // livraison), lui, est un choix manuel de l'utilisateur, jamais deviné.
  const contractType = resolveContractType(cartItems, quoteSettings?.contractTypeOverride);
  const withPose = contractType === CONTRACT_TYPES.AVEC_POSE;
  let docType = 'reception';
  if (!withPose) {
    docType = normalizeCompletionDocType(deliveryType);
    if (docType === 'reception') {
      throw createHttpError(
        'Ce devis est en fourniture seule : choisissez Enlèvement ou Livraison.',
        400
      );
    }
  }

  const cgvSnapshotEntry = matchCgvSnapshotEntry(quoteData?.payload?.cgvSnapshot);
  // La retenue de garantie (loi du 16/07/1971) ne concerne que les marchés de
  // TRAVAUX : jamais de retenue sur un bon d'enlèvement/livraison.
  const retentionEligible = withPose && cgvSnapshotEntryHasRetentionClause(cgvSnapshotEntry);

  const totalDevisTTC = Number(quoteData?.totalTTC) || 0;
  const sessionId = buildSessionId('cc');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const sessionDoc = {
    id: sessionId,
    mode: 'quote-linked',
    docType,
    userId,
    quoteId,
    quoteNumber: quoteData?.quoteNumber || '',
    invoiceReference: trimmedRef,
    acompteRecu: acompte,
    totalDevisTTC,
    clientEmail,
    clientName,
    clientData: {
      nom: clientName,
      adresseChantier: jobSiteAddress || '',
      codePostalChantier: jobSitePostalCode || '',
      villeChantier: jobSiteCity || '',
    },
    ouvrages,
    retentionEligible,
    reserveLiftDelayDays: DEFAULT_RESERVE_LIFT_DELAY_DAYS,
    status: 'sent',
    reserves: null,
    ratings: null,
    signedPdfPath: null,
    signerName: null,
    signerIp: null,
    userAgent: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    sentAt: now.toISOString(),
    viewedAt: null,
    signedAt: null,
    refusedAt: null,
    expiresAt: expiresAt.toISOString(),
  };

  const sessionRef = readSessionDocumentRef(db, sessionId);
  await sessionRef.set(sessionDoc);

  const signingUrl = buildAbsoluteUrl(buildCompletionSignaturePageHref(sessionId));

  // Même discipline que createAndSendQuoteDelivery (lib/quote-signature-
  // service.js) : si l'e-mail échoue, on ne laisse pas de session
  // fantôme derrière soi (le client n'a rien reçu, il n'y a donc rien à
  // conserver) et on remonte une erreur claire pour permettre un nouvel
  // essai depuis /devis. En mode 'link', aucun e-mail : la session existe
  // dès maintenant, l'URL est remise à l'utilisateur qui la transmet.
  if (deliveryMode === 'email') {
    try {
      const smtp = getSmtpConfig();
      const transport = await getSmtpTransport();
      await transport.sendMail({
        from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
        to: clientEmail,
        replyTo: smtp.replyTo || undefined,
        subject: `📝 Votre ${getCompletionDocTypeLabel(docType)} SARANGE - Devis n°${sessionDoc.quoteNumber.replace(/^DV[-\s]*/i, '')}`,
        html: buildCompletionEmailHtml({ clientName, signingUrl, quoteNumber: sessionDoc.quoteNumber, docType }),
      });
    } catch (error) {
      await sessionRef.delete();
      throw createHttpError(
        error.message || "Envoi impossible. Vérifiez la configuration email.",
        502
      );
    }
  }

  await quoteRef.set(
    {
      completionWorkflow: {
        sessionId,
        status: 'sent',
        signingUrl,
        sentAt: now.toISOString(),
        deliveryMode,
        invoiceReference: trimmedRef,
      },
    },
    { merge: true }
  );

  return { sessionId, signingUrl, deliveryMode };
};

/**
 * Relance manuelle d'un bon (ou d'un PV de levée) non signé, même cadence
 * J+3/J+10/J+30 que les devis. Auth requise : on vérifie que la session
 * appartient bien à l'utilisateur avant tout envoi.
 */
export const sendCompletionReminder = async ({ userId, sessionId, reminderLevel }) => {
  ensureServerConfig({ requireEmail: true });

  const meta = getCompletionReminderMeta(reminderLevel);
  if (!meta) {
    throw createHttpError('Niveau de relance invalide.', 400);
  }

  const db = getFirebaseAdminDb();
  const ref = readSessionDocumentRef(db, sessionId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().userId !== userId) {
    throw createHttpError('Session introuvable.', 404);
  }
  const session = snapshot.data();
  if (!['sent', 'viewed'].includes(session.status)) {
    throw createHttpError('Ce bon a déjà été traité : aucune relance à envoyer.', 409);
  }
  if (!session.clientEmail) {
    throw createHttpError("Aucune adresse e-mail n'est associée à ce bon (lien copié manuellement).", 400);
  }

  const signingUrl = buildAbsoluteUrl(buildCompletionSignaturePageHref(sessionId));
  const smtp = getSmtpConfig();
  const transport = await getSmtpTransport();
  await transport.sendMail({
    from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
    to: session.clientEmail,
    replyTo: smtp.replyTo || undefined,
    subject: `⏰ Rappel : votre ${getCompletionDocTypeLabel(session.docType)} attend votre signature (devis n°${(session.quoteNumber || '').replace(/^DV[-\s]*/i, '')})`,
    html: buildCompletionEmailHtml({
      clientName: session.clientName,
      signingUrl,
      quoteNumber: session.quoteNumber || '',
      docType: session.docType,
    }),
  });

  const now = new Date().toISOString();
  await ref.set({ lastReminderLevel: meta.level, lastReminderAt: now, updatedAt: now }, { merge: true });

  if (session.mode === 'quote-linked' && session.quoteId) {
    await readQuoteDocumentRef(db, userId, session.quoteId).set(
      { completionWorkflow: { lastReminderLevel: meta.level, lastReminderAt: now } },
      { merge: true }
    );
  }

  return { ok: true, level: meta.level };
};

/**
 * Données PUBLIQUES exposées à la page de signature — jamais userId, jamais
 * le solde déjà calculé pour d'autres clients, etc.
 */
export const getCompletionSession = async (sessionId) => {
  ensureServerConfig();
  const db = getFirebaseAdminDb();
  const ref = readSessionDocumentRef(db, sessionId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw createHttpError('Ce lien de bon de fin de chantier est invalide ou a expiré.', 404);
  }
  const data = snapshot.data();

  if (data.expiresAt && new Date(data.expiresAt).getTime() < Date.now() && ['sent', 'viewed'].includes(data.status)) {
    await ref.set({ status: 'expired', updatedAt: new Date().toISOString() }, { merge: true });
    data.status = 'expired';
  }

  if (data.status === 'sent') {
    await ref.set({ status: 'viewed', viewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    data.status = 'viewed';
  }

  // Auto-réparation : une session réclamée par une signature ('signing') qui
  // n'a jamais abouti (crash serveur entre la réclamation et le rollback) est
  // rendue au bout de 5 minutes — le client peut alors réessayer.
  if (data.status === 'signing') {
    const claimedAt = new Date(data.updatedAt || 0).getTime();
    if (!Number.isFinite(claimedAt) || Date.now() - claimedAt > 5 * 60 * 1000) {
      await ref.set({ status: 'viewed', updatedAt: new Date().toISOString() }, { merge: true });
      data.status = 'viewed';
    }
  }

  return {
    id: sessionId,
    mode: data.mode || 'quote-linked',
    docType: normalizeCompletionDocType(data.docType),
    status: data.status,
    quoteNumber: data.quoteNumber,
    clientName: data.clientName,
    clientData: data.clientData,
    ouvrages: data.ouvrages,
    reserveLiftDelayDays: data.reserveLiftDelayDays,
    // PV de levée : les réserves du bon d'origine, à afficher comme levées.
    reserves: data.mode === 'reserves-lift' ? data.reserves || [] : undefined,
    completionNumber: data.mode === 'reserves-lift' ? data.completionNumber || '' : undefined,
    googleReviewUrl: GOOGLE_REVIEW_URL,
  };
};

/**
 * Overlay pdf-lib : dessine la signature + le nom du signataire sur l'ancre
 * capturée par completion-pdf-generator.js. Volontairement plus simple que
 * l'équivalent devis (une seule ancre, pas de tampons multiples).
 */
const applySignatureToCompletionPdf = async ({ pdfBuffer, signatureDataUrl, signatureAnchor, signerName }) => {
  if (!signatureAnchor?.signatureBox || !Number.isFinite(Number(signatureAnchor.pageNumber))) {
    throw createHttpError('Le repère de signature du bon est indisponible.', 500);
  }

  const pdfDocument = await PDFDocument.load(pdfBuffer);
  const match = /^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i.exec(String(signatureDataUrl || ''));
  if (!match) {
    throw createHttpError('Signature invalide.', 400);
  }
  const contentType = match[1].toLowerCase();
  const imageBuffer = Buffer.from(match[2], 'base64');
  const embeddedImage =
    contentType === 'image/jpeg' || contentType === 'image/jpg'
      ? await pdfDocument.embedJpg(imageBuffer)
      : await pdfDocument.embedPng(imageBuffer);
  const regularFont = await pdfDocument.embedFont(StandardFonts.Helvetica);

  const fallbackPage = pdfDocument.getPage(
    Math.min(Math.max(0, Number(signatureAnchor.pageNumber) - 1), pdfDocument.getPageCount() - 1)
  );

  drawAtAnchor(pdfDocument, signatureAnchor, fallbackPage, (page, pageHeight) => {
    const box = signatureAnchor.signatureBox;
    const padding = Number(box.padding || 4);
    const areaLeft = Number(box.x || 0) + padding;
    const areaTop = Number(box.y || 0) + 6;
    const areaWidth = Math.max(8, Number(box.width || 0) - padding * 2);
    const areaHeight = Math.max(8, Number(box.height || 0) - 12);

    const scaled = embeddedImage.scale(1);
    const ratio = scaled.width / scaled.height || 1;
    let imageWidth = toPdfPoints(areaWidth);
    let imageHeight = imageWidth / ratio;
    const maxHeight = toPdfPoints(areaHeight);
    if (imageHeight > maxHeight) {
      imageHeight = maxHeight;
      imageWidth = imageHeight * ratio;
    }

    const imageX = toPdfPoints(areaLeft) + (toPdfPoints(areaWidth) - imageWidth) / 2;
    const imageY = pageHeight - toPdfPoints(areaTop + areaHeight) + (toPdfPoints(areaHeight) - imageHeight) / 2;

    page.drawImage(embeddedImage, { x: imageX, y: imageY, width: imageWidth, height: imageHeight });

    if (signerName) {
      page.drawText(String(signerName).trim(), {
        x: toPdfPoints(areaLeft),
        y: topMmToPdfY(pageHeight, Number(box.y || 0) + Number(box.height || 0) + 4),
        size: 8,
        font: regularFont,
        color: rgb(0.2, 0.23, 0.3),
      });
    }
  });

  return Buffer.from(await pdfDocument.save());
};

const normalizeReserves = (raw, reserveLiftDelayDays) =>
  (Array.isArray(raw) ? raw : [])
    .map((entry) => ({
      description: normalizeEnv(entry?.description).slice(0, 2000),
      delaiJours: Number.isFinite(Number(entry?.delaiJours)) ? Number(entry.delaiJours) : reserveLiftDelayDays,
    }))
    .filter((entry) => entry.description.length > 0);

// Photos de réserves. Deux chemins d'arrivée :
//  1) STAGING (nominal) : chaque photo est téléversée SÉPARÉMENT dès sa
//     sélection via /api/completion-certificates/photo-upload — la limite
//     ~4,5 Mo par requête serverless s'applique alors PAR PHOTO, ce qui
//     autorise jusqu'à 10 photos par bon en qualité 1600 px.
//  2) INLINE (secours) : si un téléversement échoue (réseau chantier), la
//     photo voyage dans le corps JSON de la signature, plafonnée comme avant.
const MAX_RESERVE_PHOTOS = 20;
const MAX_INLINE_PHOTOS = 4;
// Pièces jointes de l'e-mail interne : au-delà, les photos restent
// accessibles par LIENS signés listés dans le corps du message (les serveurs
// SMTP plafonnent couramment les messages à 10-25 Mo).
const MAX_EMAIL_PHOTO_ATTACHMENTS = 6;
const PHOTO_LINK_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_PHOTO_DATAURL_LENGTH = 2_800_000;
const STAGING_PHOTO_ROOT = 'completion-photo-staging';
const STAGED_UPLOAD_ID_PATTERN = /^pu_[a-f0-9]{32}$/;

const parsePhotoDataUrl = (dataUrl) => {
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_PHOTO_DATAURL_LENGTH) return null;
  const match = /^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  return {
    contentType: match[1].toLowerCase() === 'image/png' ? 'image/png' : 'image/jpeg',
    buffer: Buffer.from(match[2], 'base64'),
  };
};

const normalizeReservePhotos = (raw) =>
  (Array.isArray(raw) ? raw : [])
    .slice(0, MAX_INLINE_PHOTOS)
    .map((dataUrl) => parsePhotoDataUrl(dataUrl))
    .filter(Boolean);

const uploadReservePhotos = async (sessionId, photos) => {
  const bucket = getFirebaseAdminStorage().bucket();
  const paths = [];
  const links = [];
  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    const extension = photo.contentType === 'image/png' ? 'png' : 'jpg';
    const path = `${STORAGE_ROOT}/${sessionId}/photos/reserve-${index + 1}.${extension}`;
    const file = bucket.file(path);
    await file.save(photo.buffer, {
      resumable: false,
      metadata: { contentType: photo.contentType, cacheControl: 'private, max-age=0, no-store' },
    });
    paths.push(path);
    // URL signée longue durée pour l'e-mail interne (v2 : la v4 plafonne à
    // 7 jours). Best-effort : sans URL, la photo reste dans Storage et en
    // pièce jointe si elle est dans les premières.
    try {
      const [url] = await file.getSignedUrl({
        version: 'v2',
        action: 'read',
        expires: Date.now() + PHOTO_LINK_EXPIRY_MS,
      });
      links.push({ name: `Photo ${index + 1}`, url });
    } catch {
      // Ignoré : lien absent de l'e-mail, photo toujours stockée.
    }
  }
  return { paths, links };
};

const buildPhotoStagingPrefix = ({ token, uploadId }) =>
  token ? `${STAGING_PHOTO_ROOT}/session/${token}/` : `${STAGING_PHOTO_ROOT}/generic/${uploadId}/`;

/**
 * Téléversement d'UNE photo de réserve, en amont de la signature. Route
 * publique : l'appelant est authentifié soit par le token de session (flux
 * lié à un devis), soit par un uploadId opaque généré ici (flux générique,
 * où aucune session n'existe avant la soumission finale).
 */
export const stageCompletionPhoto = async ({ token = '', uploadId = '', photoDataUrl }) => {
  ensureServerConfig();

  const photo = parsePhotoDataUrl(photoDataUrl);
  if (!photo) {
    throw createHttpError('Photo invalide (JPEG/PNG, 2 Mo maximum).', 400);
  }

  let effectiveUploadId = '';
  if (token) {
    const snapshot = await readSessionDocumentRef(getFirebaseAdminDb(), token).get();
    if (!snapshot.exists || !['sent', 'viewed'].includes(snapshot.data().status)) {
      throw createHttpError('Ce lien de bon de fin de chantier est invalide ou a expiré.', 404);
    }
  } else {
    effectiveUploadId = STAGED_UPLOAD_ID_PATTERN.test(uploadId)
      ? uploadId
      : `pu_${crypto.randomBytes(16).toString('hex')}`;
  }

  const prefix = buildPhotoStagingPrefix({ token, uploadId: effectiveUploadId });
  const bucket = getFirebaseAdminStorage().bucket();
  const [existing] = await bucket.getFiles({ prefix });
  if (existing.length >= MAX_RESERVE_PHOTOS) {
    throw createHttpError(`Nombre maximum de photos atteint (${MAX_RESERVE_PHOTOS}).`, 400);
  }

  const extension = photo.contentType === 'image/png' ? 'png' : 'jpg';
  const path = `${prefix}photo-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${extension}`;
  await bucket.file(path).save(photo.buffer, {
    resumable: false,
    metadata: { contentType: photo.contentType, cacheControl: 'private, max-age=0, no-store' },
  });

  return { uploadId: effectiveUploadId || undefined, count: existing.length + 1 };
};

// Récupère (et purge) les photos mises en staging pour une signature. Le
// téléchargement précède la suppression : un échec en aval laisse les
// fichiers en place pour une nouvelle tentative.
const collectStagedPhotos = async ({ token = '', uploadId = '' }) => {
  if (!token && !STAGED_UPLOAD_ID_PATTERN.test(uploadId)) return { photos: [], cleanup: async () => {} };

  const prefix = buildPhotoStagingPrefix({ token, uploadId });
  const bucket = getFirebaseAdminStorage().bucket();
  const [files] = await bucket.getFiles({ prefix });
  const photos = [];
  for (const file of files.slice(0, MAX_RESERVE_PHOTOS)) {
    try {
      const [buffer] = await file.download();
      photos.push({
        contentType: file.metadata?.contentType === 'image/png' ? 'image/png' : 'image/jpeg',
        buffer,
      });
    } catch {
      // Fichier illisible : ignoré, les autres photos passent.
    }
  }
  const cleanup = async () => {
    await Promise.all(files.map((file) => file.delete().catch(() => {})));
  };
  return { photos, cleanup };
};

const normalizeRatings = (raw) => {
  const criteria = ['pose', 'proprete', 'relation'];
  const ratings = {};
  criteria.forEach((key) => {
    const value = Number(raw?.[key]);
    ratings[key] = Number.isFinite(value) && value >= 1 && value <= 5 ? Math.round(value) : 0;
  });
  return ratings;
};

/**
 * Deux e-mails séparés, chacun isolé dans son propre try/catch — jamais un
 * échec d'envoi ne doit faire remonter une erreur au client : à ce stade, la
 * signature, le PDF et le stockage ont déjà réussi et sont déjà persistés
 * (même discipline que signQuoteSignatureSession dans lib/quote-signature-
 * service.js pour les e-mails de confirmation/notification interne).
 */
const sendSignedConfirmation = async ({
  toEmail,
  clientName,
  hasReserves,
  completionNumber,
  quoteNumber = '',
  adresse = '',
  reserves = [],
  ratings = null,
  allFiveStars = false,
  isLift = false,
  docType = 'reception',
  photos = [],
  photoLinks = [],
  pdfBuffer,
  filename,
}) => {
  const smtp = getSmtpConfig();
  if (!smtp.host || !smtp.fromEmail) return;
  const transport = await getSmtpTransport();
  const attachments = [{ filename, content: pdfBuffer, contentType: PDF_CONTENT_TYPE }];
  // Photos de réserves : e-mail INTERNE uniquement (préparer l'intervention,
  // pas alourdir l'e-mail client). Seules les premières partent en pièces
  // jointes — au-delà, le message dépasserait les plafonds SMTP courants ;
  // TOUTES restent accessibles via les liens signés listés dans le corps.
  const internalAttachments = [
    ...attachments,
    ...photos.slice(0, MAX_EMAIL_PHOTO_ATTACHMENTS).map((photo, index) => ({
      filename: `photo-reserve-${index + 1}.${photo.contentType === 'image/png' ? 'png' : 'jpg'}`,
      content: photo.buffer,
      contentType: photo.contentType,
    })),
  ];

  if (toEmail) {
    try {
      await transport.sendMail({
        from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
        to: toEmail,
        subject: isLift
          ? `🎉 Réserves levées, dossier clos - PV n°${completionNumber.replace(/^LR[-\s]*/i, '')}`
          : normalizeCompletionDocType(docType) === 'reception'
            ? `🎉 Merci ! Réception des travaux validée - Bon n°${completionNumber.replace(/^BFC[-\s]*/i, '')}`
            : `🎉 Merci ! Remise de vos produits validée - Bon n°${completionNumber.replace(/^BFC[-\s]*/i, '')}`,
        html: buildSignedConfirmationHtml({ clientName, hasReserves, completionNumber, allFiveStars, isLift, docType }),
        attachments,
      });
    } catch (error) {
      console.error('[sendSignedConfirmation] E-mail client non envoyé', { message: error?.message });
    }
  }

  if (smtp.internalEmail) {
    try {
      await transport.sendMail({
        from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
        to: smtp.internalEmail,
        subject: isLift
          ? `✅ Réserves LEVÉES : ${clientName || 'Client'} (${completionNumber})`
          : `${
              hasReserves
                ? '⚠️ Bon signé AVEC réserves'
                : `✅ ${getCompletionDocTypeLabel(docType).replace(/^bon/, 'Bon')} signé`
            } : ${clientName || 'Client'} (${completionNumber})${photos.length ? ` — ${photos.length} photo(s)` : ''}`,
        html: buildInternalCompletionHtml({ clientName, completionNumber, hasReserves, quoteNumber, adresse, reserves, ratings, photoLinks, docType }),
        attachments: internalAttachments,
      });
    } catch (error) {
      console.error('[sendSignedConfirmation] E-mail interne non envoyé', { message: error?.message });
    }
  }
};

export const signCompletionSession = async ({
  sessionId,
  reserves,
  reservePhotos,
  ratings,
  signatureDataUrl,
  signerName,
  confirmed,
  signerIp = '',
  userAgent = '',
}) => {
  ensureServerConfig();
  if (confirmed !== true) {
    throw createHttpError('La case de confirmation de réception doit être cochée.', 400);
  }
  if (!signatureDataUrl) {
    throw createHttpError('Signature manquante.', 400);
  }

  const db = getFirebaseAdminDb();
  const ref = readSessionDocumentRef(db, sessionId);

  // Réclamation ATOMIQUE de la session (transaction Firestore) : deux clics
  // rapides sur « Signer » déclenchent deux requêtes concurrentes qui, avec
  // un simple get + check, passeraient toutes les deux le contrôle de statut
  // (double PDF, double e-mail). La transaction garantit qu'une seule
  // l'emporte ; l'autre reçoit un 409 propre.
  const session = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      throw createHttpError('Ce lien de bon de fin de chantier est invalide ou a expiré.', 404);
    }
    const data = snapshot.data();
    if (!['sent', 'viewed'].includes(data.status)) {
      throw createHttpError('Ce bon de fin de chantier a déjà été traité.', 409);
    }
    if (data.expiresAt && new Date(data.expiresAt).getTime() < Date.now()) {
      transaction.set(ref, { status: 'expired', updatedAt: new Date().toISOString() }, { merge: true });
      throw createHttpError('Ce lien de bon de fin de chantier a expiré.', 410);
    }
    transaction.set(ref, { status: 'signing', updatedAt: new Date().toISOString() }, { merge: true });
    return data;
  });

  const isLift = session.mode === 'reserves-lift';
  // PV de levée : les réserves signées sont CELLES DU BON D'ORIGINE (figées
  // dans la session de levée), jamais une saisie du client.
  const normalizedReserves = isLift
    ? normalizeReserves(session.reserves, session.reserveLiftDelayDays)
    : normalizeReserves(reserves, session.reserveLiftDelayDays);
  const hasReserves = !isLift && normalizedReserves.length > 0;
  const normalizedRatings = normalizeRatings(ratings);
  // Photos : d'abord celles téléversées en amont (staging par token), puis
  // les éventuelles photos inline de secours, dans la limite globale.
  const staged = isLift ? { photos: [], cleanup: async () => {} } : await collectStagedPhotos({ token: sessionId });
  const normalizedPhotos = isLift
    ? []
    : [...staged.photos, ...normalizeReservePhotos(reservePhotos)].slice(0, MAX_RESERVE_PHOTOS);

  const balance = computeCompletionBalance({
    totalDevisTTC: session.totalDevisTTC,
    acompteRecu: session.acompteRecu,
    hasReserves,
    retentionEligible: session.retentionEligible,
  });

  // La session est réclamée (statut 'signing') : tout échec de génération,
  // de tampon ou de stockage doit la RENDRE (retour à 'viewed') pour que le
  // client puisse réessayer, jamais la laisser coincée.
  let signedBuffer;
  let signedPath;
  let completionNumber;
  let filename;
  let photoPaths = [];
  let photoLinks = [];
  try {
    completionNumber = isLift ? generateLiftNumber(new Date()) : generateCompletionNumber(new Date());
    const built = await (isLift
      ? buildReservesLiftPdfDocument({
          liftNumber: completionNumber,
          completionNumber: session.completionNumber || '',
          quoteNumber: session.quoteNumber,
          clientData: session.clientData,
          reserves: normalizedReserves,
          retentionWasApplied: session.retentionWasApplied === true,
          issueDate: new Date(),
        })
      : buildCompletionPdfDocument({
          docType: session.docType,
          quoteNumber: session.quoteNumber,
          invoiceReference: session.invoiceReference,
          clientData: session.clientData,
          ouvrages: session.ouvrages,
          hasReserves,
          reserves: normalizedReserves,
          reserveLiftDelayDays: session.reserveLiftDelayDays,
          balance,
          retentionEligible: session.retentionEligible,
          completionNumber,
          issueDate: new Date(),
        }));
    filename = built.filename;

    signedBuffer = await applySignatureToCompletionPdf({
      pdfBuffer: Buffer.from(built.arrayBuffer),
      signatureDataUrl,
      signatureAnchor: built.signatureAnchor,
      signerName: signerName || session.clientName,
    });

    signedPath = `${STORAGE_ROOT}/${sessionId}/${filename}`;
    await uploadPdfBuffer(signedPath, signedBuffer);

    if (normalizedPhotos.length) {
      const uploaded = await uploadReservePhotos(sessionId, normalizedPhotos);
      photoPaths = uploaded.paths;
      photoLinks = uploaded.links;
    }
    await staged.cleanup();
  } catch (error) {
    await ref
      .set({ status: 'viewed', updatedAt: new Date().toISOString() }, { merge: true })
      .catch(() => {});
    throw error;
  }

  const now = new Date();
  const nextStatus = isLift
    ? 'reserves_lifted'
    : hasReserves
      ? 'received_with_reserves'
      : 'received_no_reserves';

  await ref.set(
    {
      status: nextStatus,
      reserves: normalizedReserves,
      ratings: normalizedRatings,
      balance,
      completionNumber,
      signedPdfPath: signedPath,
      reservePhotoPaths: photoPaths,
      signerName: signerName || session.clientName || '',
      signerIp,
      userAgent,
      signedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    { merge: true }
  );

  if (session.userId && session.quoteId) {
    const quoteRef = readQuoteDocumentRef(db, session.userId, session.quoteId);
    if (isLift) {
      // La levée clôt le cycle : le statut affiché sur la fiche devis passe à
      // 'reserves_lifted', et le bon d'origine est marqué levé lui aussi.
      await quoteRef.set(
        {
          completionWorkflow: {
            status: 'reserves_lifted',
            liftNumber: completionNumber,
            liftedAt: now.toISOString(),
          },
        },
        { merge: true }
      );
      if (session.originalSessionId) {
        await readSessionDocumentRef(db, session.originalSessionId)
          .set({ status: 'reserves_lifted', liftedAt: now.toISOString(), liftNumber: completionNumber }, { merge: true })
          .catch(() => {});
      }
    } else {
      await quoteRef.set(
        {
          completionWorkflow: {
            sessionId,
            status: nextStatus,
            completionNumber,
            signedAt: now.toISOString(),
            hasReserves,
          },
        },
        { merge: true }
      );
    }
  }

  // Pas de sollicitation d'avis quand il y a des réserves : elle viendra au
  // PV de levée, une fois le problème corrigé (le client renotera alors).
  const allFiveStars = !hasReserves && Object.values(normalizedRatings).every((value) => value === 5);

  await sendSignedConfirmation({
    toEmail: session.clientEmail,
    clientName: session.clientName,
    hasReserves,
    completionNumber,
    quoteNumber: session.quoteNumber,
    adresse: [session.clientData?.adresseChantier, session.clientData?.villeChantier].filter(Boolean).join(', '),
    reserves: isLift ? [] : normalizedReserves,
    ratings: normalizedRatings,
    allFiveStars,
    isLift,
    docType: session.docType,
    photos: normalizedPhotos,
    photoLinks,
    pdfBuffer: signedBuffer,
    filename,
  });

  return {
    id: sessionId,
    status: nextStatus,
    completionNumber,
    hasReserves,
    allFiveStars,
    googleReviewUrl: GOOGLE_REVIEW_URL,
  };
};

/**
 * Crée la session de PV de levée des réserves depuis /devis et envoie le
 * lien de signature au client. Uniquement pour un bon lié à un devis dont la
 * réception a été signée AVEC réserves.
 */
export const createAndSendReservesLift = async ({ userId, quoteId }) => {
  ensureServerConfig({ requireEmail: true });

  const db = getFirebaseAdminDb();
  const quoteRef = readQuoteDocumentRef(db, userId, quoteId);
  const quoteSnapshot = await quoteRef.get();
  if (!quoteSnapshot.exists) {
    throw createHttpError('Devis introuvable.', 404);
  }
  const workflow = quoteSnapshot.data()?.completionWorkflow || {};
  if (workflow.status !== 'received_with_reserves' || !workflow.sessionId) {
    throw createHttpError("Ce devis n'a pas de bon réceptionné avec réserves à lever.", 409);
  }
  if (workflow.liftSessionId) {
    throw createHttpError('Un PV de levée a déjà été envoyé pour ce bon.', 409);
  }

  const originalSnapshot = await readSessionDocumentRef(db, workflow.sessionId).get();
  if (!originalSnapshot.exists || originalSnapshot.data().userId !== userId) {
    throw createHttpError("Session du bon d'origine introuvable.", 404);
  }
  const original = originalSnapshot.data();
  if (!original.clientEmail) {
    throw createHttpError("Aucune adresse e-mail n'est associée au bon d'origine.", 400);
  }

  const sessionId = buildSessionId('ccl');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  await readSessionDocumentRef(db, sessionId).set({
    id: sessionId,
    mode: 'reserves-lift',
    docType: normalizeCompletionDocType(original.docType),
    userId,
    quoteId,
    originalSessionId: workflow.sessionId,
    quoteNumber: original.quoteNumber || '',
    completionNumber: original.completionNumber || '',
    // La retenue n'a été réellement appliquée que si le bon d'origine était
    // éligible ET réceptionné avec réserves (toujours vrai ici).
    retentionWasApplied: original.retentionEligible === true,
    clientEmail: original.clientEmail,
    clientName: original.clientName || '',
    clientData: original.clientData || {},
    reserves: original.reserves || [],
    reserveLiftDelayDays: original.reserveLiftDelayDays || DEFAULT_RESERVE_LIFT_DELAY_DAYS,
    status: 'sent',
    signedPdfPath: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    sentAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  const signingUrl = buildAbsoluteUrl(buildCompletionSignaturePageHref(sessionId));

  try {
    const smtp = getSmtpConfig();
    const transport = await getSmtpTransport();
    await transport.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to: original.clientEmail,
      replyTo: smtp.replyTo || undefined,
      subject: `📝 Levée des réserves de votre chantier - Bon n°${(original.completionNumber || '').replace(/^BFC[-\s]*/i, '')}`,
      html: buildLiftEmailHtml({
        clientName: original.clientName,
        signingUrl,
        completionNumber: original.completionNumber || '',
      }),
    });
  } catch (error) {
    await readSessionDocumentRef(db, sessionId).delete();
    throw createHttpError(error.message || 'Envoi impossible. Vérifiez la configuration email.', 502);
  }

  await quoteRef.set(
    { completionWorkflow: { liftSessionId: sessionId, liftSentAt: now.toISOString() } },
    { merge: true }
  );

  return { sessionId, signingUrl };
};

export const refuseCompletionSession = async ({ sessionId, reason = '' }) => {
  ensureServerConfig();
  const db = getFirebaseAdminDb();
  const ref = readSessionDocumentRef(db, sessionId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw createHttpError('Ce lien de bon de fin de chantier est invalide ou a expiré.', 404);
  }
  const now = new Date();
  const trimmedReason = normalizeEnv(reason).slice(0, 2000);
  await ref.set(
    {
      status: 'refused',
      refusedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      refusalReason: trimmedReason,
    },
    { merge: true }
  );

  const smtp = getSmtpConfig();
  if (smtp.host && smtp.fromEmail && smtp.internalEmail) {
    try {
      const transport = await getSmtpTransport();
      await transport.sendMail({
        from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
        to: smtp.internalEmail,
        subject: `⚠️ Bon de fin de chantier refusé (${sessionId})`,
        html: buildInternalRefusalHtml({ reason: trimmedReason }),
      });
    } catch (error) {
      console.error('[refuseCompletionSession] E-mail interne non envoyé', { message: error?.message });
    }
  }

  return { id: sessionId, status: 'refused' };
};

export const getCompletionDocument = async (sessionId) => {
  ensureServerConfig();
  const db = getFirebaseAdminDb();
  const snapshot = await readSessionDocumentRef(db, sessionId).get();
  if (!snapshot.exists) {
    throw createHttpError('Document introuvable.', 404);
  }
  const session = snapshot.data();
  if (!session.signedPdfPath) {
    throw createHttpError("Ce bon n'a pas encore été signé.", 404);
  }
  const buffer = await downloadPdfBuffer(session.signedPdfPath);
  return {
    buffer,
    contentType: PDF_CONTENT_TYPE,
    filename: `${session.completionNumber || 'bon-fin-chantier'}.pdf`,
  };
};

/* -------------------------------------------------------------------------- */
/*  Flux générique (sans devis, lien fixe donné aux poseurs) — un seul appel  */
/*  serveur : pas de round-trip "créer puis récupérer par token", tout se     */
/*  passe dans la même session navigateur.                                    */
/* -------------------------------------------------------------------------- */

export const submitGenericCompletion = async ({
  nom,
  prenom,
  email,
  adresse,
  ville = '',
  telephone,
  quoteReference = '',
  reserves,
  reservePhotos,
  photoUploadId = '',
  ratings,
  signatureDataUrl,
  signerIp = '',
  userAgent = '',
}) => {
  // requireEmail porte sur la config SERVEUR (SMTP), pas sur la saisie du
  // client : e-mail et téléphone client restent facultatifs (seuls nom,
  // prénom et adresse bloquent la suite du parcours côté formulaire).
  ensureServerConfig({ requireEmail: true });

  // Plafonds de saisie : la route est PUBLIQUE (lien fixe, sans auth), on ne
  // laisse jamais un champ libre non borné atterrir dans Firestore ou le PDF.
  const cap = (value, max) => normalizeEnv(value).slice(0, max);
  const safeNom = cap(nom, 120);
  const safePrenom = cap(prenom, 120);
  const safeEmail = cap(email, 254);
  const safeAdresse = cap(adresse, 300);
  const safeVille = cap(ville, 120);
  const safeTelephone = cap(telephone, 30);
  const safeQuoteReference = cap(quoteReference, 40);

  const clientName = `${safePrenom} ${safeNom}`.trim();
  if (!clientName || !safeAdresse) {
    throw createHttpError('Nom, prénom et adresse sont obligatoires.', 400);
  }
  if (!signatureDataUrl) {
    throw createHttpError('Signature manquante.', 400);
  }

  const normalizedReserves = normalizeReserves(reserves, DEFAULT_RESERVE_LIFT_DELAY_DAYS);
  const hasReserves = normalizedReserves.length > 0;
  const normalizedRatings = normalizeRatings(ratings);

  const sessionId = buildSessionId('ccg');
  const completionNumber = generateCompletionNumber(new Date());

  const { arrayBuffer, signatureAnchor, filename } = await buildCompletionPdfDocument({
    quoteNumber: safeQuoteReference,
    invoiceReference: '',
    clientData: { nom: clientName, adresseChantier: safeAdresse, codePostalChantier: '', villeChantier: safeVille },
    ouvrages: [
      {
        designation: 'Ensemble des travaux réalisés',
        repere: '',
        qte: 1,
      },
    ],
    hasReserves,
    reserves: normalizedReserves,
    reserveLiftDelayDays: DEFAULT_RESERVE_LIFT_DELAY_DAYS,
    balance: { totalDevisTTC: 0, acompteRecu: 0, soldeAvantRetenue: 0, retenueGarantie: 0, soldeAPercevoir: 0 },
    retentionEligible: false,
    completionNumber,
    issueDate: new Date(),
  });

  const signedBuffer = await applySignatureToCompletionPdf({
    pdfBuffer: Buffer.from(arrayBuffer),
    signatureDataUrl,
    signatureAnchor,
    signerName: clientName,
  });

  const signedPath = `${STORAGE_ROOT}/generic/${sessionId}/${filename}`;
  await uploadPdfBuffer(signedPath, signedBuffer);

  const stagedGeneric = hasReserves
    ? await collectStagedPhotos({ uploadId: photoUploadId })
    : { photos: [], cleanup: async () => {} };
  const normalizedPhotos = hasReserves
    ? [...stagedGeneric.photos, ...normalizeReservePhotos(reservePhotos)].slice(0, MAX_RESERVE_PHOTOS)
    : [];
  const uploadedPhotos = normalizedPhotos.length
    ? await uploadReservePhotos(`generic/${sessionId}`, normalizedPhotos)
    : { paths: [], links: [] };
  await stagedGeneric.cleanup();

  const now = new Date();
  const db = getFirebaseAdminDb();
  await readGenericDocumentRef(db, sessionId).set({
    id: sessionId,
    mode: 'generic',
    nom: safeNom,
    prenom: safePrenom,
    email: safeEmail,
    adresse: safeAdresse,
    ville: safeVille,
    telephone: safeTelephone,
    quoteReference: safeQuoteReference,
    status: hasReserves ? 'received_with_reserves' : 'received_no_reserves',
    reserves: normalizedReserves,
    ratings: normalizedRatings,
    completionNumber,
    signedPdfPath: signedPath,
    reservePhotoPaths: uploadedPhotos.paths,
    signerIp,
    userAgent,
    createdAt: now.toISOString(),
    signedAt: now.toISOString(),
    // Pas de devis d'origine : à rattacher manuellement au bon dossier client
    // par l'utilisateur une fois reçu par e-mail (voir mémo produit).
    reconciled: false,
  });

  // Même règle que le flux lié à un devis : pas de sollicitation d'avis
  // quand un problème est signalé.
  const allFiveStars = !hasReserves && Object.values(normalizedRatings).every((value) => value === 5);

  await sendSignedConfirmation({
    toEmail: safeEmail,
    clientName,
    hasReserves,
    completionNumber,
    quoteNumber: safeQuoteReference,
    adresse: safeAdresse,
    reserves: normalizedReserves,
    ratings: normalizedRatings,
    allFiveStars,
    photos: normalizedPhotos,
    photoLinks: uploadedPhotos.links,
    pdfBuffer: signedBuffer,
    filename,
  });

  return { id: sessionId, completionNumber, hasReserves, allFiveStars, googleReviewUrl: GOOGLE_REVIEW_URL };
};
