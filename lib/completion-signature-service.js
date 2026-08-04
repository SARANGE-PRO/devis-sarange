import 'server-only';

import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';

import nodemailer from 'nodemailer';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { COMMERCIAL_DISCOUNT_PRODUCT_ID, getDisplayProductLabel } from './products';
import { getClientFullName } from './client-cloud';
import { getFirebaseAdminDb, getFirebaseAdminStorage, isFirebaseAdminConfigured } from './firebase/admin';
import { matchCgvSnapshotEntry, cgvSnapshotEntryHasRetentionClause } from './cgv-templates.mjs';
import { toPdfPoints, topMmToPdfY, drawAtAnchor } from './pdf-signature-anchors.mjs';
import { buildCompletionPdfDocument } from './completion-pdf-generator';
import {
  computeCompletionBalance,
  generateCompletionNumber,
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

export const buildOuvrageLinesFromCartItems = (cartItems = []) =>
  (Array.isArray(cartItems) ? cartItems : [])
    .filter((item) => item && !EXCLUDED_OUVRAGE_PRODUCT_IDS.has(item.productId))
    .map((item) => ({
      designation:
        getDisplayProductLabel(item.productLabel || item.customLabel || item.sheetName) ||
        'Menuiserie sur mesure',
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

const buildCompletionEmailHtml = ({ clientName, signingUrl, quoteNumber }) =>
  getResponsiveEmailLayout({
    preheaderText: 'Vos travaux sont terminés : vérifiez vos ouvrages et signez votre bon de fin de chantier en ligne…',
    contentHtml: `
      ${getEmailHeaderHtml({})}
      <tr>
        <td class="sg-content" style="padding: 40px 30px;">
          <h2 style="margin-top: 0; color: #0f172a; font-size: 20px;">Bonjour ${escapeHtml(clientName || 'Madame, Monsieur')},</h2>
          <p style="line-height: 1.6; color: #475569; font-size: 16px;">Vos travaux (devis <strong>n°${escapeHtml(quoteNumber)}</strong>) sont terminés. Merci de votre confiance !</p>
          <p style="line-height: 1.6; color: #475569; font-size: 16px;">Pour finaliser la réception, il ne reste qu'une étape : <strong style="color: #f97316;">vérifier vos ouvrages et signer votre bon de fin de chantier</strong> sur notre plateforme sécurisée.</p>

          <div class="sg-block" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #f97316; padding: 25px; margin: 35px 0; border-radius: 8px;">
            <h3 style="margin-top: 0; margin-bottom: 20px; color: #0f172a; font-size: 16px;">✅ Comment ça se passe :</h3>
            <p style="margin: 0 0 12px 0; color: #334155; line-height: 1.5; font-size: 15px;"><strong>1.</strong> Vérifiez chaque ouvrage installé (conforme, ou signalez un point à corriger).</p>
            <p style="margin: 0 0 12px 0; color: #334155; line-height: 1.5; font-size: 15px;"><strong>2.</strong> Donnez-nous votre avis sur la prestation.</p>
            <p style="margin: 0; color: #334155; line-height: 1.5; font-size: 15px;"><strong>3.</strong> Signez électroniquement : vous recevrez aussitôt votre exemplaire par e-mail.</p>
          </div>

          ${getBulletproofEmailButton(escapeHtml(signingUrl), '🖋️ Signer mon bon de fin de chantier', '#f97316')}

          <p style="margin: 22px 0 0 0; color: #64748b; font-size: 13px; text-align: center;">La signature du bon déclenche les garanties légales de vos ouvrages (parfait achèvement, bon fonctionnement, décennale).</p>
        </td>
      </tr>
      ${getEmailFooterHtml()}
    `,
  });

const buildSignedConfirmationHtml = ({ clientName, hasReserves, completionNumber }) =>
  getResponsiveEmailLayout({
    preheaderText: 'Votre bon de fin de chantier signé est en pièce jointe. Merci de votre confiance !',
    contentHtml: `
      ${getEmailHeaderHtml({ notificationLabel: 'Bon de fin de chantier' })}
      <tr>
        <td class="sg-content" style="padding: 40px 30px;">
          <h2 style="margin-top: 0; color: #0f172a; font-size: 20px;">Bonjour ${escapeHtml(clientName || 'Madame, Monsieur')},</h2>
          <p style="line-height: 1.6; color: #475569; font-size: 16px;">Votre bon de fin de chantier <strong>n°${escapeHtml(completionNumber)}</strong> a bien été signé${hasReserves ? ', <strong>avec réserves</strong>' : ', <strong>sans réserve</strong>'}. Vous trouverez votre exemplaire signé en pièce jointe.</p>
          ${
            hasReserves
              ? `<div class="sg-block" style="background-color: #fff7ed; border: 1px solid #fdba74; border-left: 4px solid #f97316; padding: 20px; margin: 25px 0; border-radius: 8px;">
                   <p style="margin: 0; color: #9a3412; line-height: 1.6; font-size: 15px;"><strong>Vos réserves sont prises en compte.</strong> Notre équipe vous recontactera pour planifier l'intervention de levée dans le délai convenu.</p>
                 </div>`
              : `<p style="line-height: 1.6; color: #475569; font-size: 16px;">À compter de ce jour, vos ouvrages sont couverts par les garanties légales : parfait achèvement (1 an), bon fonctionnement (2 ans) et garantie décennale (10 ans).</p>`
          }
          <p style="line-height: 1.6; color: #475569; font-size: 16px;">Conservez précieusement ce document : il marque le point de départ de vos garanties.</p>
        </td>
      </tr>
      ${getEmailFooterHtml()}
    `,
  });

const buildInternalCompletionHtml = ({ clientName, completionNumber, hasReserves, quoteNumber, adresse }) =>
  getResponsiveEmailLayout({
    preheaderText: `Bon de fin de chantier signé par ${clientName || 'un client'}${hasReserves ? ' (avec réserves)' : ''}.`,
    contentHtml: `
      ${getEmailHeaderHtml({ subtitle: '', notificationLabel: 'Notification interne' })}
      <tr>
        <td class="sg-content" style="padding: 40px 30px;">
          <h2 style="margin-top: 0; color: #0f172a; font-size: 20px;">${hasReserves ? '⚠️ Bon signé AVEC réserves' : '✅ Bon de fin de chantier signé'}</h2>
          <p style="line-height: 1.6; color: #475569; font-size: 16px;"><strong>${escapeHtml(clientName || 'Client')}</strong> vient de signer le bon <strong>n°${escapeHtml(completionNumber)}</strong>${quoteNumber ? ` (devis n°${escapeHtml(quoteNumber)})` : ''}.</p>
          ${adresse ? `<p style="line-height: 1.6; color: #475569; font-size: 16px;">Chantier : ${escapeHtml(adresse)}</p>` : ''}
          ${
            hasReserves
              ? `<div class="sg-block" style="background-color: #fff7ed; border: 1px solid #fdba74; border-left: 4px solid #f97316; padding: 20px; margin: 25px 0; border-radius: 8px;">
                   <p style="margin: 0; color: #9a3412; line-height: 1.6; font-size: 15px;"><strong>Des réserves ont été formulées :</strong> le détail figure sur le document en pièce jointe. Planifier l'intervention de levée.</p>
                 </div>`
              : ''
          }
          <p style="line-height: 1.6; color: #475569; font-size: 16px;">Document signé en pièce jointe.</p>
        </td>
      </tr>
      ${getEmailFooterHtml()}
    `,
  });

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

export const createAndSendQuoteLinkedCompletion = async ({ userId, quoteId, acompteRecu, invoiceReference }) => {
  ensureServerConfig({ requireEmail: true });

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
  const clientEmail = normalizeEnv(clientData.email);
  if (!clientEmail) {
    throw createHttpError("Le client n'a pas d'adresse e-mail enregistrée sur ce devis.", 400);
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

  const cartItems = Array.isArray(quoteData?.payload?.cartItems) ? quoteData.payload.cartItems : [];
  const ouvrages = buildOuvrageLinesFromCartItems(cartItems);
  if (!ouvrages.length) {
    throw createHttpError('Ce devis ne contient aucune menuiserie à réceptionner.', 400);
  }

  const cgvSnapshotEntry = matchCgvSnapshotEntry(quoteData?.payload?.cgvSnapshot);
  const retentionEligible = cgvSnapshotEntryHasRetentionClause(cgvSnapshotEntry);

  const totalDevisTTC = Number(quoteData?.totalTTC) || 0;
  const sessionId = buildSessionId('cc');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const sessionDoc = {
    id: sessionId,
    mode: 'quote-linked',
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
  // essai depuis /devis.
  try {
    const smtp = getSmtpConfig();
    const transport = await getSmtpTransport();
    await transport.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to: clientEmail,
      replyTo: smtp.replyTo || undefined,
      subject: `📝 Votre bon de fin de chantier SARANGE - Devis n°${sessionDoc.quoteNumber.replace(/^DV[-\s]*/i, '')}`,
      html: buildCompletionEmailHtml({ clientName, signingUrl, quoteNumber: sessionDoc.quoteNumber }),
    });
  } catch (error) {
    await sessionRef.delete();
    throw createHttpError(
      error.message || "Envoi impossible. Vérifiez la configuration email.",
      502
    );
  }

  await quoteRef.set(
    {
      completionWorkflow: {
        sessionId,
        status: 'sent',
        signingUrl,
        sentAt: now.toISOString(),
        invoiceReference: trimmedRef,
      },
    },
    { merge: true }
  );

  return { sessionId, signingUrl };
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

  if (data.expiresAt && new Date(data.expiresAt).getTime() < Date.now() && data.status === 'sent') {
    await ref.set({ status: 'expired', updatedAt: new Date().toISOString() }, { merge: true });
    data.status = 'expired';
  }

  if (data.status === 'sent') {
    await ref.set({ status: 'viewed', viewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    data.status = 'viewed';
  }

  return {
    id: sessionId,
    status: data.status,
    quoteNumber: data.quoteNumber,
    clientName: data.clientName,
    clientData: data.clientData,
    ouvrages: data.ouvrages,
    reserveLiftDelayDays: data.reserveLiftDelayDays,
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
  pdfBuffer,
  filename,
}) => {
  const smtp = getSmtpConfig();
  if (!smtp.host || !smtp.fromEmail) return;
  const transport = await getSmtpTransport();
  const attachments = [{ filename, content: pdfBuffer, contentType: PDF_CONTENT_TYPE }];

  if (toEmail) {
    try {
      await transport.sendMail({
        from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
        to: toEmail,
        subject: `🎉 Merci ! Réception des travaux validée - Bon n°${completionNumber.replace(/^BFC[-\s]*/i, '')}`,
        html: buildSignedConfirmationHtml({ clientName, hasReserves, completionNumber }),
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
        subject: `${hasReserves ? '⚠️ Bon signé AVEC réserves' : '✅ Bon de fin de chantier signé'} : ${
          clientName || 'Client'
        } (${completionNumber})`,
        html: buildInternalCompletionHtml({ clientName, completionNumber, hasReserves, quoteNumber, adresse }),
        attachments,
      });
    } catch (error) {
      console.error('[sendSignedConfirmation] E-mail interne non envoyé', { message: error?.message });
    }
  }
};

export const signCompletionSession = async ({
  sessionId,
  reserves,
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
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw createHttpError('Ce lien de bon de fin de chantier est invalide ou a expiré.', 404);
  }
  const session = snapshot.data();
  if (!['sent', 'viewed'].includes(session.status)) {
    throw createHttpError('Ce bon de fin de chantier a déjà été traité.', 409);
  }

  const normalizedReserves = normalizeReserves(reserves, session.reserveLiftDelayDays);
  const hasReserves = normalizedReserves.length > 0;
  const normalizedRatings = normalizeRatings(ratings);

  const balance = computeCompletionBalance({
    totalDevisTTC: session.totalDevisTTC,
    acompteRecu: session.acompteRecu,
    hasReserves,
    retentionEligible: session.retentionEligible,
  });

  const completionNumber = generateCompletionNumber(new Date());
  const { arrayBuffer, signatureAnchor, filename } = buildCompletionPdfDocument({
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
  });

  const signedBuffer = await applySignatureToCompletionPdf({
    pdfBuffer: Buffer.from(arrayBuffer),
    signatureDataUrl,
    signatureAnchor,
    signerName: signerName || session.clientName,
  });

  const signedPath = `${STORAGE_ROOT}/${sessionId}/${filename}`;
  await uploadPdfBuffer(signedPath, signedBuffer);

  const now = new Date();
  const nextStatus = hasReserves ? 'received_with_reserves' : 'received_no_reserves';

  await ref.set(
    {
      status: nextStatus,
      reserves: normalizedReserves,
      ratings: normalizedRatings,
      balance,
      completionNumber,
      signedPdfPath: signedPath,
      signerName: signerName || session.clientName || '',
      signerIp,
      userAgent,
      signedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    { merge: true }
  );

  if (session.mode === 'quote-linked' && session.userId && session.quoteId) {
    const quoteRef = readQuoteDocumentRef(db, session.userId, session.quoteId);
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

  await sendSignedConfirmation({
    toEmail: session.clientEmail,
    clientName: session.clientName,
    hasReserves,
    completionNumber,
    quoteNumber: session.quoteNumber,
    adresse: [session.clientData?.adresseChantier, session.clientData?.villeChantier].filter(Boolean).join(', '),
    pdfBuffer: signedBuffer,
    filename,
  });

  const allFiveStars = Object.values(normalizedRatings).every((value) => value === 5);

  return {
    id: sessionId,
    status: nextStatus,
    completionNumber,
    hasReserves,
    allFiveStars,
    googleReviewUrl: GOOGLE_REVIEW_URL,
  };
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
  ratings,
  signatureDataUrl,
  signerIp = '',
  userAgent = '',
}) => {
  // requireEmail porte sur la config SERVEUR (SMTP), pas sur la saisie du
  // client : e-mail et téléphone client restent facultatifs (seuls nom,
  // prénom et adresse bloquent la suite du parcours côté formulaire).
  ensureServerConfig({ requireEmail: true });

  const clientName = `${normalizeEnv(prenom)} ${normalizeEnv(nom)}`.trim();
  if (!clientName || !normalizeEnv(adresse)) {
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

  const { arrayBuffer, signatureAnchor, filename } = buildCompletionPdfDocument({
    quoteNumber: normalizeEnv(quoteReference),
    invoiceReference: '',
    clientData: { nom: clientName, adresseChantier: adresse, codePostalChantier: '', villeChantier: normalizeEnv(ville) },
    ouvrages: [
      {
        designation: hasReserves ? 'Travaux réalisés (validation générale, avec réserves)' : 'Travaux réalisés (validation générale)',
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

  const now = new Date();
  const db = getFirebaseAdminDb();
  await readGenericDocumentRef(db, sessionId).set({
    id: sessionId,
    mode: 'generic',
    nom: normalizeEnv(nom),
    prenom: normalizeEnv(prenom),
    email: normalizeEnv(email),
    adresse: normalizeEnv(adresse),
    ville: normalizeEnv(ville),
    telephone: normalizeEnv(telephone),
    quoteReference: normalizeEnv(quoteReference),
    status: hasReserves ? 'received_with_reserves' : 'received_no_reserves',
    reserves: normalizedReserves,
    ratings: normalizedRatings,
    completionNumber,
    signedPdfPath: signedPath,
    signerIp,
    userAgent,
    createdAt: now.toISOString(),
    signedAt: now.toISOString(),
    // Pas de devis d'origine : à rattacher manuellement au bon dossier client
    // par l'utilisateur une fois reçu par e-mail (voir mémo produit).
    reconciled: false,
  });

  await sendSignedConfirmation({
    toEmail: normalizeEnv(email),
    clientName,
    hasReserves,
    completionNumber,
    quoteNumber: normalizeEnv(quoteReference),
    adresse: normalizeEnv(adresse),
    pdfBuffer: signedBuffer,
    filename,
  });

  const allFiveStars = Object.values(normalizedRatings).every((value) => value === 5);

  return { id: sessionId, completionNumber, hasReserves, allFiveStars, googleReviewUrl: GOOGLE_REVIEW_URL };
};
