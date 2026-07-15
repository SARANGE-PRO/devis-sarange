import 'server-only';

import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import nodemailer from 'nodemailer';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { buildPanelSelections } from './panel-selections.mjs';

import {
  getClientFullName,
  getClientJobSiteFullName,
  sanitizeClientData,
} from '@/lib/client-cloud';
import {
  getFirebaseAdminDb,
  getFirebaseAdminStorage,
  isFirebaseAdminConfigured,
} from '@/lib/firebase/admin';
import { getPaymentMilestones, normalizeQuoteSettings } from '@/lib/quote-settings.mjs';
import {
  DEFAULT_SIGNATURE_EXPIRY_DAYS,
  buildSignatureDocumentHref,
  buildSignaturePageHref,
  getQuoteNumberDisplay,
  normalizeQuoteSignatureStatus,
} from '@/lib/quote-signature';

const SESSION_COLLECTION = 'quoteSignatureSessions';
const STORAGE_ROOT = 'quote-signatures';
const SESSION_SOURCE = 'SignatureDevisAPI-adapted';
const DEFAULT_FROM_NAME = 'SARANGE Menuiseries';
const PDF_CONTENT_TYPE = 'application/pdf';
const MM_TO_PT = 72 / 25.4;
const SUPPORT_PHONE = '09 86 71 34 44';
const COMPANY_ADDRESS = '5 rue Gaspard Monge, Combs-la-Ville 77380';
const BANK_IBAN = 'FR76 1010 7002 2500 0170 5433 705';
const BANK_BIC = 'BREDFRPPXXX';

let smtpTransportPromise = null;

const createHttpError = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

const normalizeEnv = (value) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';

const ensureServerConfig = ({ requireEmail = false, requirePublicUrl = false } = {}) => {
  if (!isFirebaseAdminConfigured()) {
    throw createHttpError(
      "La signature de devis n'est pas configurée. Vérifiez les variables Firebase Admin.",
      503
    );
  }

  if (requireEmail) {
    const smtpConfig = getSmtpConfig();
    if (!smtpConfig.host || !smtpConfig.port || !smtpConfig.fromEmail) {
      throw createHttpError(
        "La signature de devis n'est pas configurée. Vérifiez la configuration SMTP.",
        503
      );
    }
  }

  if (requirePublicUrl && !getPublicBaseUrl()) {
    throw createHttpError(
      "La signature de devis n'est pas configurée. Renseignez QUOTE_SIGNATURE_BASE_URL.",
      503
    );
  }
};

const getPublicBaseUrl = () =>
  normalizeEnv(process.env.QUOTE_SIGNATURE_BASE_URL || process.env.NEXT_PUBLIC_APP_URL).replace(
    /\/+$/,
    ''
  );

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

const getSignatureExpiryDays = () => {
  const value = Number.parseInt(
    process.env.QUOTE_SIGNATURE_EXPIRY_DAYS ||
    process.env.NEXT_PUBLIC_QUOTE_SIGNATURE_EXPIRY_DAYS ||
    '',
    10
  );
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SIGNATURE_EXPIRY_DAYS;
};

const getSmtpTransport = async () => {
  if (!smtpTransportPromise) {
    smtpTransportPromise = Promise.resolve().then(() => {
      const config = getSmtpConfig();
      return nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth:
          config.user && config.pass
            ? {
              user: config.user,
              pass: config.pass,
            }
            : undefined,
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

const formatPercentLabel = (value) => {
  const numeric = Number(value || 0);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/\.?0+$/, '');
};

const quoteIncludesMeasurementVisit = (quoteData) =>
  Array.isArray(quoteData?.payload?.cartItems) &&
  quoteData.payload.cartItems.some((item) => item?.includePose === true);

const getDepositSettlementNotice = (hasMeasurementVisit) =>
  hasMeasurementVisit
    ? "L'acompte peut être réglé à la commande par virement, ou par chèque ou virement lors de la prise de côtes."
    : "L'acompte peut être réglé à la commande par virement ou par chèque.";

const buildPaymentModel = (quoteData, totalTTC) => {
  const settings = normalizeQuoteSettings(quoteData?.payload?.quoteSettings || {});
  const milestones = getPaymentMilestones(settings, totalTTC);
  const depositMilestone = milestones[0] || null;

  return {
    settings,
    milestones,
    depositPercent: Number(depositMilestone?.percent || 0),
    depositAmount: Number(depositMilestone?.amountTTC || 0),
    depositDueLabel: depositMilestone?.dueLabel || '',
    hasKnownTotal: Number(totalTTC || 0) > 0,
  };
};

const buildSignatureLink = (session) =>
  session.deliveryMode === 'signature' ? buildAbsoluteUrl(buildSignaturePageHref(session.id)) : '';

const formatCurrency = (value) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value || 0));

// Fuseau horaire de référence : le serveur (Vercel) tourne en UTC, on force
// donc l'heure de Paris pour que les dates affichées correspondent à l'heure
// réelle du client (ex. signature à 16h00 et non 14h00 UTC).
const DISPLAY_TIME_ZONE = 'Europe/Paris';

const formatDateLabel = (value) =>
  new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(value instanceof Date ? value : new Date(value));

const formatDateTimeLabel = (value) =>
  new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(value instanceof Date ? value : new Date(value));

const getDisplayQuoteNumber = (value) => getQuoteNumberDisplay(value) || normalizeEnv(value);

const getEscapedDisplayQuoteNumber = (value) => escapeHtml(getDisplayQuoteNumber(value));

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
    /* Optimisation mobile : on réduit drastiquement les paddings imbriqués
       sur petits écrans pour que les encarts (coordonnées bancaires, étapes)
       respirent et prennent toute la largeur. */
    @media only screen and (max-width: 480px) {
      .sg-content { padding: 24px 16px !important; }
      .sg-block { padding: 14px !important; }
      .sg-bank-cell { padding-left: 10px !important; padding-right: 10px !important; }
      .sg-inner { padding: 10px 10px !important; }
      .sg-step-indent { width: 30px !important; padding-right: 4px !important; }
      .sg-step-num { width: 24px !important; height: 24px !important; line-height: 24px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; width: 100%; word-break: break-word; -webkit-font-smoothing: antialiased; background-color: #f1f5f9;">
  <div style="display: none; max-height: 0px; overflow: hidden; mso-hide: all; font-size: 1px; color: #f1f5f9; line-height: 1px;">
    ${preheaderText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
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

const getBulletproofEmailButton = (link, text, colorCode) =>
  `
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

const getEmailHeaderHtml = ({
  accentColor = '#f97316',
  subtitle = 'Menuiseries sur-mesure',
  notificationLabel = '',
  padding = '35px 20px',
}) => `
  <tr>
    <td bgcolor="#0f172a" align="center" style="padding: ${padding}; border-bottom: 4px solid ${accentColor};">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -1px;">
        SARANGE<span style="color: ${accentColor};">.</span>${notificationLabel
    ? ` <span style="color: #64748b; font-weight: normal; font-size: 16px;">| ${escapeHtml(notificationLabel)}</span>`
    : ''
  }
      </h1>
      ${subtitle
    ? `<p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 13px; text-transform: uppercase; letter-spacing: 2px;">${subtitle}</p>`
    : ''
  }
    </td>
  </tr>`;

const getEmailFooterHtml = ({
  compact = false,
  note = `Une question ? Contactez-nous au <strong>${SUPPORT_PHONE}</strong>`,
} = {}) => `
  <tr>
    <td bgcolor="#f8fafc" style="border-top: 1px solid #e2e8f0; padding: ${compact ? '20px' : '30px'}; text-align: center;">
      ${compact
    ? ''
    : `<p style="margin: 0 0 10px 0; color: #0f172a; font-weight: bold; font-size: 16px;">L'équipe SARANGE</p>
             <p style="margin: 0 0 15px 0; color: #64748b; font-size: 14px;">${note}</p>`
  }
      <p style="margin: 0; color: #94a3b8; font-size: 12px;">© ${new Date().getFullYear()} SARANGE Menuiseries — ${COMPANY_ADDRESS}</p>
    </td>
  </tr>`;

const getTransferBlockHtml = ({
  session,
  heading = 'Modalités de règlement',
  showAmounts = true,
  // Affiche (ou non) la phrase "L'acompte peut être réglé..." à l'intérieur
  // de l'encart. On la masque dans l'email de confirmation pour éviter la
  // répétition avec le texte affiché sous le titre de l'étape 1.
  showSettlementNotice = true,
}) => {
  const payment = session.quote?.payment || {};
  const totalTTC = Number(session.quote?.totalTTC || 0);
  const depositPercent = Number(payment.depositPercent || 0);
  const depositAmount = Number(payment.depositAmount || 0);
  const quoteNumber = getEscapedDisplayQuoteNumber(session.quote?.number);
  const hasMeasurementVisit = session.quote?.hasMeasurementVisit === true;
  const dueLabel =
    hasMeasurementVisit && payment.depositDueLabel
      ? `${payment.depositDueLabel} ou lors de la prise de côtes`
      : payment.depositDueLabel;
  const hasKnownAmounts =
    showAmounts && totalTTC > 0 && depositPercent > 0 && Number.isFinite(depositAmount);

  const bankBoxHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 12px; margin-bottom: 15px;">
      <tr>
        <td class="sg-bank-cell" style="padding: 16px 14px 12px 14px; text-align: center;">
          <p style="margin: 0 0 6px 0; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px;">IBAN – BRED BANQUE POPULAIRE</p>
          <p style="margin: 0; font-family: 'Courier New', monospace; font-size: 15px; font-weight: 700; color: #0f172a; letter-spacing: 0.4px; line-height: 1.65; word-break: break-all;">${escapeHtml(BANK_IBAN)}</p>
        </td>
      </tr>
      <tr>
        <td class="sg-bank-cell" style="padding: 0 14px 12px 14px;">
          <div class="sg-inner" style="background-color: #f8fafc; border-radius: 10px; padding: 12px 12px;">
            <p style="margin: 0 0 4px 0; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px;">BIC</p>
            <p style="margin: 0; color: #0f172a; font-size: 14px; font-weight: 700; word-break: break-word;">${escapeHtml(BANK_BIC)}</p>
          </div>
        </td>
      </tr>
      <tr>
        <td class="sg-bank-cell" style="padding: 0 14px 12px 14px;">
          <div class="sg-inner" style="background-color: #f8fafc; border-radius: 10px; padding: 12px 12px;">
            <p style="margin: 0 0 4px 0; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px;">Bénéficiaire</p>
            <p style="margin: 0; color: #0f172a; font-size: 14px; font-weight: 700;">SARANGE</p>
          </div>
        </td>
      </tr>
      <tr>
        <td class="sg-bank-cell" style="padding: 0 14px 16px 14px;">
          <p style="margin: 0; font-size: 13px; color: #475569; font-weight: 700; background-color: #f8fafc; padding: 10px 12px; border-radius: 8px; line-height: 1.5; word-break: break-word;">Réf. virement : Devis n°${quoteNumber}</p>
        </td>
      </tr>
    </table>`;

  const amountCardsHtml = hasKnownAmounts
    ? `
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin: 0 0 14px 0;">
        <p style="margin: 0 0 6px 0; color: #64748b; font-size: 13px; line-height: 1.5;">Montant total TTC : <strong style="color: #0f172a;">${escapeHtml(formatCurrency(totalTTC))}</strong></p>
        <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;">Acompte prévu au devis (${escapeHtml(formatPercentLabel(depositPercent))}%) : <strong style="color: #334155;">${escapeHtml(formatCurrency(depositAmount))}</strong></p>
      </div>
    `
    : `
      <p style="margin: 0 0 15px 0; color: #475569; font-size: 15px;"><strong>Modalités de règlement de l'acompte :</strong></p>
    `;

  return `
    <div class="sg-block" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 10px;">
      <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 15px;">
        <h4 style="margin: 0; color: #0f172a; font-size: 16px;">${heading}</h4>
      </div>
      ${amountCardsHtml}
      ${showSettlementNotice
      ? `<p style="margin: 0 0 14px 0; color: #475569; font-size: 14px; line-height: 1.6;">${getDepositSettlementNotice(hasMeasurementVisit)}</p>`
      : ''
    }
      <p style="margin: 0 0 10px 0; color: #64748b; font-size: 13px; font-weight: 700;">Coordonnées bancaires si vous choisissez le virement :</p>
      ${bankBoxHtml}
      ${dueLabel
      ? `<p style="margin: 0 0 12px 0; font-size: 12px; color: #64748b; text-align: center;">Échéance : <strong>${escapeHtml(dueLabel)}</strong></p>`
      : ''
    }
      <p style="margin: 0; font-size: 12px; color: #94a3b8; font-style: italic; text-align: center;">✓ Si vous avez déjà réglé l'acompte, vous pouvez ignorer ces informations.</p>
    </div>`;
};

const getRichReminderDefinition = (session, level) => {
  const recipientName = escapeHtml(session.recipient?.fullName || 'Madame, Monsieur');
  const quoteNumber = getDisplayQuoteNumber(session.quote?.number);
  const quoteNumberHtml = getEscapedDisplayQuoteNumber(session.quote?.number);

  if (Number(level) === 1) {
    return {
      subject: `Besoin d'informations - Devis n°${quoteNumber} SARANGE`,
      preheader:
        "Avez-vous pu prendre connaissance du devis envoyé récemment ? Je reste à votre disposition.",
      accentColor: '#f97316',
      buttonLabel: '🖋️ Consulter ou signer mon devis',
      contentHtml: `
        <p style="font-size: 16px; color: #475569;">Bonjour <strong>${recipientName}</strong>, 👋</p>
        <p style="font-size: 16px; color: #475569; line-height: 1.6;">Je me permets de vous contacter pour m'assurer que vous avez bien reçu le devis envoyé récemment concernant votre projet de menuiseries.</p>
        <p style="font-size: 16px; color: #475569; line-height: 1.6;">Avez-vous pu en prendre connaissance ?</p>
        <div style="background-color: #fff7ed; padding: 20px; border-radius: 8px; border-left: 4px solid #f97316; margin: 25px 0;">
          <p style="margin: 0 0 10px 0; color: #9a3412; font-weight: bold; font-size: 15px;">💡 Pourquoi choisir SARANGE ?</p>
          <ul style="margin: 0; padding-left: 20px; color: #c2410c; font-size: 14px; line-height: 1.6;">
            <li>Fabrication sur-mesure et soignée</li>
            <li>Tarifs en direct du fabricant, sans intermédiaire</li>
            <li>Suivi personnalisé de A à Z</li>
          </ul>
        </div>
        <p style="font-size: 16px; color: #475569; line-height: 1.6;">Je reste à votre entière disposition si vous avez la moindre question technique ou le moindre besoin d'ajustement sur cette proposition. 🛠️</p>`,
    };
  }

  if (Number(level) === 2) {
    return {
      subject: `Planning et suivi de votre projet - Devis n°${quoteNumber}`,
      preheader:
        "Nos plannings se remplissent rapidement. Validez votre dossier d'ici la fin de semaine pour garantir vos délais.",
      accentColor: '#ef4444',
      buttonLabel: '👉 Valider mon devis et bloquer mon créneau',
      contentHtml: `
        <p style="font-size: 16px; color: #475569;">Bonjour <strong>${recipientName}</strong>,</p>
        <p style="font-size: 16px; color: #475569; line-height: 1.6;">Je reviens vers vous concernant notre étude pour vos menuiseries.</p>
        <p style="font-size: 16px; color: #475569; line-height: 1.6;">Nos plannings de fabrication dans notre atelier de Combs-la-Ville et d'intervention de nos poseurs salariés se remplissent rapidement. ⏱️</p>
        <p style="font-size: 16px; color: #475569; line-height: 1.6;">Pour vous garantir le maintien de nos tarifs et une installation dans les délais souhaités, l'idéal serait de valider le dossier <strong>d'ici la fin de semaine</strong>.</p>
        <p style="font-size: 16px; color: #475569; line-height: 1.6;">S'il vous manque une information pour prendre votre décision, n'hésitez pas à nous joindre directement au <strong>${SUPPORT_PHONE}</strong>.</p>`,
    };
  }

  if (Number(level) === 3) {
    return {
      subject: 'Projet repoussé ? Gardons le contact !',
      preheader:
        'Sans nouvelles de votre part, nous allons archiver votre devis pour le moment. Vous pouvez toujours le retrouver ici.',
      accentColor: '#64748b',
      buttonLabel: 'Accéder à mon dernier devis →',
      contentHtml: `
        <p style="font-size: 16px; color: #475569;">Bonjour <strong>${recipientName}</strong>,</p>
        <p style="font-size: 16px; color: #475569; line-height: 1.6;">N'ayant pas eu de vos nouvelles récemment, je suppose que votre projet de menuiseries n'est plus la priorité du moment. Un projet d'habitat prend du temps et c'est tout à fait normal ! 🏡</p>
        <p style="font-size: 16px; color: #475569; line-height: 1.6;"><strong>Je vais archiver votre devis n°${quoteNumberHtml} pour le moment afin de mettre à jour nos plannings. 📁</strong></p>
        <p style="font-size: 16px; color: #475569; line-height: 1.6;">Sachez que notre atelier reste ouvert. Si votre projet redémarre dans quelques mois, n'hésitez pas à nous recontacter. Nous serons ravis de vous accompagner à nouveau avec la même exigence de qualité.</p>
        <div style="background-color: #f8fafc; border-left: 4px solid #94a3b8; padding: 20px; margin: 30px 0; border-radius: 0 8px 8px 0;">
          <p style="font-size: 15px; color: #64748b; margin: 0;">Si votre décision était en fait imminente, vous pouvez encore valider le devis initial ici :</p>
        </div>`,
    };
  }

  return null;
};

const timestampToIso = (value) => {
  if (!value) return null;

  const date =
    typeof value?.toDate === 'function'
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const coerceDate = (value) => {
  const iso = timestampToIso(value);
  return iso ? new Date(iso) : null;
};

const toPdfPoints = (mm) => Number(mm || 0) * MM_TO_PT;
const topMmToPdfY = (pageHeight, topMm) => pageHeight - toPdfPoints(topMm);

// pdf-lib (polices standard) encode en WinAnsi et LÈVE une erreur sur un caractère
// non encodable. On normalise la typographie courante puis on remplace tout ce qui
// sort de l'ASCII imprimable + Latin-1 — afin qu'un tampon ne casse JAMAIS la signature.
const toPdfSafeText = (value) =>
  String(value ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, '?');

const normalizeFilename = (filename, fallback = 'devis.pdf') => {
  const nextValue = String(filename || fallback).trim() || fallback;
  const safeName = nextValue.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  return safeName || fallback;
};

const buildStoragePath = (sessionId, type, filename) =>
  `${STORAGE_ROOT}/${sessionId}/${type}/${normalizeFilename(filename)}`;

const buildSessionId = () => `qs_${crypto.randomBytes(16).toString('hex')}`;

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const parseDataUrl = (value) => {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(String(value || ''));
  if (!match) {
    throw createHttpError('Signature invalide.', 400);
  }

  return {
    contentType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64'),
  };
};

const parsePdfBuffer = (base64Value) => {
  if (typeof base64Value !== 'string' || !base64Value.trim()) {
    throw createHttpError('Le PDF source est manquant.', 400);
  }

  try {
    return Buffer.from(base64Value, 'base64');
  } catch {
    throw createHttpError('Le PDF source est invalide.', 400);
  }
};

const readSessionDocumentRef = (db, sessionId) => db.collection(SESSION_COLLECTION).doc(sessionId);

const readQuoteDocumentRef = (db, userId, quoteId) =>
  db.collection('users').doc(userId).collection('quotes').doc(quoteId);

const uploadPdfBuffer = async (path, buffer) => {
  const bucket = getFirebaseAdminStorage().bucket();
  const file = bucket.file(path);

  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType: PDF_CONTENT_TYPE,
      cacheControl: 'private, max-age=0, no-store',
    },
  });

  return path;
};

const downloadPdfBuffer = async (path) => {
  const bucket = getFirebaseAdminStorage().bucket();
  const [buffer] = await bucket.file(path).download();
  return buffer;
};

const buildRecipientModel = (quoteData) => {
  if (!quoteData) {
    console.error('[buildRecipientModel] quoteData is null/undefined');
    return {
      fullName: 'Client',
      email: '',
      phone: '',
      address: '',
      chantierFullName: 'Client',
      chantierAddress: '',
    };
  }

  const clientData = sanitizeClientData(quoteData?.payload?.clientData || {});
  const fullName = getClientFullName(clientData) || 'Client';
  const chantierFullName = getClientJobSiteFullName(clientData) || fullName;
  const chantierAddress = clientData.memeAdresseChantier
    ? [clientData.adresse, clientData.codePostal, clientData.ville].filter(Boolean).join(', ')
    : [clientData.adresseChantier, clientData.codePostalChantier, clientData.villeChantier]
      .filter(Boolean)
      .join(', ');

  const model = {
    fullName,
    email: clientData.email || '',
    phone: clientData.telephone || '',
    address: [clientData.adresse, clientData.codePostal, clientData.ville]
      .filter(Boolean)
      .join(', '),
    chantierFullName,
    chantierAddress,
  };

  console.info('[buildRecipientModel] Created:', {
    fullName: model.fullName,
    hasEmail: !!model.email,
    hasAddress: !!model.address,
  });

  return model;
};

const buildQuoteModel = (quoteData, pdfInfo) => {
  if (!quoteData) {
    console.error('[buildQuoteModel] quoteData is null/undefined', { pdfInfo });
    throw createHttpError('Données du devis introuvables.', 400);
  }

  const issueDate =
    timestampToIso(pdfInfo?.issueDate || quoteData?.quoteIssuedAt) || new Date().toISOString();
  const quoteNumber =
    normalizeEnv(pdfInfo?.quoteNumber) ||
    normalizeEnv(quoteData?.quoteNumber) ||
    normalizeEnv(quoteData?.signatureWorkflow?.quoteNumber);

  if (!quoteNumber) {
    console.error('[buildQuoteModel] quoteNumber not found', {
      pdfInfoNumber: pdfInfo?.quoteNumber,
      quoteDataNumber: quoteData?.quoteNumber,
      workflowNumber: quoteData?.signatureWorkflow?.quoteNumber,
      quoteDataKeys: Object.keys(quoteData || {}),
    });
    throw createHttpError('Le numéro du devis est manquant.', 400);
  }

  const totalTTC = Number(pdfInfo?.totalTTC ?? quoteData?.totalTTC ?? 0);
  const hasMeasurementVisit =
    quoteIncludesMeasurementVisit(quoteData) ||
    Number(pdfInfo?.quantityWithPose || quoteData?.quantityWithPose || 0) > 0;
  const payment = buildPaymentModel(quoteData, totalTTC);

  const model = {
    title: normalizeEnv(quoteData?.title) || 'Devis sans titre',
    number: quoteNumber,
    reference: normalizeEnv(
      quoteData?.referenceDevis ||
        quoteData?.payload?.reference ||
        quoteData?.payload?.clientData?.referenceDevis
    ),
    issueDate,
    totalHT: Number(pdfInfo?.totalHT ?? quoteData?.totalHT ?? 0),
    totalTTC,
    tvaRate: Number(pdfInfo?.tvaRate ?? quoteData?.tvaRate ?? 0),
    productCount: Number(quoteData?.productCount || quoteData?.payload?.cartItems?.length || 0),
    hasMeasurementVisit,
    payment,
    // Durée de validité de l'offre (en mois) : reprise des conditions commerciales
    // du devis pour que le badge de la page de signature reste cohérent avec le PDF.
    validityMonths: payment.settings.validityMonths,
  };

  console.info('[buildQuoteModel] Created:', {
    number: model.number,
    totalTTC: model.totalTTC,
    hasPayment: !!model.payment,
  });

  return model;
};

// `buildPanelSelections(cartItems)` est défini dans lib/panel-selections.mjs (module pur
// partagé serveur/client) : couleur = libellé exact du devis (marketingFinition).

// Normalise les choix de panneaux remontés par l'iframe (event PANEL_SELECTED) avant
// persistance Firestore — aucune valeur `undefined`, clés = lineId des sélections.
const normalizePanelChoices = (raw) => {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  Object.entries(raw).forEach(([lineId, choice]) => {
    const key = normalizeEnv(lineId);
    if (!key || !choice || typeof choice !== 'object') return;
    // `image` est un nom de fichier du catalogue ; on n'accepte qu'un motif strict
    // (pas de chemin/URL) car il sera ensuite récupéré côté serveur — anti path-traversal/SSRF.
    const rawImage = normalizeEnv(choice.image);
    const image = /^[A-Za-z0-9_-]+\.(jpe?g|png)$/i.test(rawImage) ? rawImage : '';
    out[key] = {
      gamme: normalizeEnv(choice.gamme),
      panelName: normalizeEnv(choice.panelName),
      panelRef: normalizeEnv(choice.panelRef),
      image,
      croisillon: normalizeEnv(choice.croisillon ?? choice.croisillonChoisi),
      couleur: normalizeEnv(choice.couleur ?? choice.couleurChoisie),
      legendeVitrage: normalizeEnv(choice.legendeVitrage),
      plusValueTotaleHT: Number(choice.plusValueTotaleHT) || 0,
    };
  });
  return out;
};

const buildSessionPayload = ({
  existingSession,
  sessionId,
  userId,
  quoteId,
  deliveryMode,
  quoteData,
  pdfInfo,
  originalPdfPath,
  originalFilename,
  variants,
  now,
}) => {
  const recipient = buildRecipientModel(quoteData);
  const quote = buildQuoteModel(quoteData, pdfInfo);

  // Variantes : on conserve les nouvelles si fournies, sinon celles existantes
  // (cas d'une relance sans régénération). Mono-option => null (comportement actuel).
  const documentVariants =
    Array.isArray(variants) && variants.length > 0
      ? variants
      : existingSession?.document?.variants || null;
  const variantsMode = Array.isArray(documentVariants) && documentVariants.length > 1;

  return {
    id: sessionId,
    version: 1,
    source: SESSION_SOURCE,
    userId,
    quoteId,
    deliveryMode,
    variantsMode,
    status: normalizeQuoteSignatureStatus(existingSession?.status || 'draft'),
    createdAt: coerceDate(existingSession?.createdAt) || now,
    updatedAt: now,
    sentAt: coerceDate(existingSession?.sentAt),
    viewedAt: coerceDate(existingSession?.viewedAt),
    signedAt: coerceDate(existingSession?.signedAt),
    refusedAt: coerceDate(existingSession?.refusedAt),
    expiredAt: coerceDate(existingSession?.expiredAt),
    expiresAt: deliveryMode === 'signature' ? addDays(now, getSignatureExpiryDays()) : null,
    lastError: null,
    lastEmailError: null,
    emailMessageId: null,
    recipient,
    quote,
    // Portes à panneau décoratif à personnaliser avant signature (peut être vide).
    panelSelections: buildPanelSelections(quoteData?.payload?.cartItems),
    document: {
      originalPdfPath,
      originalFilename,
      signedPdfPath: existingSession?.document?.signedPdfPath || null,
      signedFilename: existingSession?.document?.signedFilename || null,
      signatureAnchors:
        pdfInfo?.signatureAnchors || existingSession?.document?.signatureAnchors || null,
      variants: documentVariants,
    },
    signature: {
      signerName: existingSession?.signature?.signerName || null,
      signerIp: existingSession?.signature?.signerIp || null,
      userAgent: existingSession?.signature?.userAgent || null,
      acceptReducedVat: existingSession?.signature?.acceptReducedVat ?? null,
      panelChoices: existingSession?.signature?.panelChoices || null,
    },
    reminders: {
      count: Number(existingSession?.reminders?.count || 0),
      lastLevel: Number(existingSession?.reminders?.lastLevel || 0) || null,
      lastSentAt: coerceDate(existingSession?.reminders?.lastSentAt),
    },
  };
};

const buildQuoteWorkflowSummary = (session, overrides = {}) => {
  const status = normalizeQuoteSignatureStatus(overrides.status || session.status);
  return {
    sessionId: session.id,
    status,
    deliveryMode: overrides.deliveryMode || session.deliveryMode || null,
    signingUrl:
      (overrides.deliveryMode || session.deliveryMode) === 'signature'
        ? buildAbsoluteUrl(buildSignaturePageHref(session.id))
        : null,
    originalPdfPath: session.document?.originalPdfPath || null,
    originalFilename: session.document?.originalFilename || null,
    signedPdfPath: session.document?.signedPdfPath || null,
    signedFilename: session.document?.signedFilename || null,
    signedPdfAvailable: Boolean(session.document?.signedPdfPath),
    sentAt: session.sentAt || null,
    viewedAt: session.viewedAt || null,
    signedAt: session.signedAt || null,
    refusedAt: session.refusedAt || null,
    expiredAt: session.expiredAt || null,
    expiresAt: session.expiresAt || null,
    quoteNumber: session.quote?.number || null,
    issueDate: session.quote?.issueDate || null,
    totalHT: Number(session.quote?.totalHT || 0),
    totalTTC: Number(session.quote?.totalTTC || 0),
    variantsMode: session.variantsMode === true,
    variantCount: Array.isArray(session.document?.variants)
      ? session.document.variants.length
      : null,
    selectedVariantId: session.signature?.selectedVariantId || null,
    selectedVariantName: session.signature?.selectedVariantName || null,
    selectedVariantTotalTTC:
      session.signature?.selectedVariantTotalTTC != null
        ? Number(session.signature.selectedVariantTotalTTC)
        : null,
    recipientEmail: session.recipient?.email || null,
    recipientName: session.recipient?.fullName || null,
    reducedVatRequired: session.document?.signatureAnchors?.reducedVatRequired === true,
    needsResend: overrides.needsResend === true,
    lastKnownStatus: overrides.lastKnownStatus || status,
    lastError: overrides.lastError || session.lastError || null,
    lastReminderLevel: session.reminders?.lastLevel || null,
    lastReminderAt: session.reminders?.lastSentAt || null,
    syncedAt: overrides.syncedAt || session.updatedAt || null,
  };
};

const persistSession = async (session) => {
  const db = getFirebaseAdminDb();
  await readSessionDocumentRef(db, session.id).set(session, { merge: true });
};

const persistQuoteWorkflow = async (quoteRef, session, overrides = {}) => {
  const nextUpdatedAt = overrides.updatedAt || new Date();
  await quoteRef.set(
    {
      status: normalizeQuoteSignatureStatus(overrides.status || session.status),
      quoteNumber: session.quote?.number || null,
      quoteIssuedAt: coerceDate(session.quote?.issueDate),
      signatureWorkflow: buildQuoteWorkflowSummary(session, {
        ...overrides,
        syncedAt: nextUpdatedAt,
      }),
      updatedAt: nextUpdatedAt,
    },
    { merge: true }
  );
};

const sendMail = async ({ to, subject, html, attachments = [] }) => {
  const config = getSmtpConfig();
  const transporter = await getSmtpTransport();

  return transporter.sendMail({
    from: config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail,
    to,
    replyTo: config.replyTo || undefined,
    subject,
    html,
    attachments,
  });
};

const buildDeliveryEmailHtml = ({ session }) => {
  const signatureLink = buildSignatureLink(session);
  const expiresAtLabel = session.expiresAt ? formatDateLabel(session.expiresAt) : null;
  const greetingName = escapeHtml(session.recipient?.fullName || 'Madame, Monsieur');
  const quoteNumber = getEscapedDisplayQuoteNumber(session.quote?.number);
  const hasMeasurementVisit = session.quote?.hasMeasurementVisit === true;
  const depositSettlementNotice = getDepositSettlementNotice(hasMeasurementVisit);
  const stepsHtml = signatureLink
    ? `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
          <tr>
            <td width="35" valign="top">
              <div style="background-color: #f97316; color: white; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; font-size: 13px; font-weight: bold;">1</div>
            </td>
            <td valign="top">
              <p style="margin: 0; color: #334155; line-height: 1.5; font-size: 15px;"><strong>Signez votre devis électroniquement</strong> sur notre plateforme 100% sécurisée via le bouton ci-dessous.</p>
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="35" valign="top">
              <div style="background-color: #f97316; color: white; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; font-size: 13px; font-weight: bold;">2</div>
            </td>
            <td valign="top">
              <p style="margin: 0; color: #334155; line-height: 1.5; font-size: 15px;"><strong>Choisissez le mode de règlement de l'acompte.</strong> ${depositSettlementNotice}</p>
            </td>
          </tr>
        </table>
      `
    : `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
          <tr>
            <td width="35" valign="top">
              <div style="background-color: #f97316; color: white; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; font-size: 13px; font-weight: bold;">1</div>
            </td>
            <td valign="top">
              <p style="margin: 0; color: #334155; line-height: 1.5; font-size: 15px;"><strong>Consultez votre devis PDF</strong> en pièce jointe pour relire l'ensemble de la proposition.</p>
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="35" valign="top">
              <div style="background-color: #f97316; color: white; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; font-size: 13px; font-weight: bold;">2</div>
            </td>
            <td valign="top">
              <p style="margin: 0; color: #334155; line-height: 1.5; font-size: 15px;"><strong>Répondez à cet email</strong> si vous souhaitez ajuster le devis ou obtenir un complément d'information.</p>
            </td>
          </tr>
        </table>
      `;

  return getResponsiveEmailLayout({
    preheaderText:
      'Votre devis pour vos menuiseries sur-mesure est prêt. Découvrez notre proposition et les prochaines étapes…',
    contentHtml: `
      ${getEmailHeaderHtml({ accentColor: '#f97316' })}
      <tr>
        <td style="padding: 40px 30px;">
          <h2 style="margin-top: 0; color: #0f172a; font-size: 20px;">Bonjour ${greetingName},</h2>
          <p style="line-height: 1.6; color: #475569; font-size: 16px;">Veuillez trouver ci-joint votre devis <strong>n°${quoteNumber}</strong> concernant votre projet de menuiseries.</p>
          <p style="line-height: 1.6; color: #475569; font-size: 16px;">En tant que fabricant direct, notre priorité chez SARANGE est de vous proposer des <strong style="color: #f97316;">menuiseries de haute qualité, sans intermédiaire, et toujours au juste prix.</strong></p>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #f97316; padding: 25px; margin: 35px 0; border-radius: 8px;">
            <h3 style="margin-top: 0; margin-bottom: 20px; color: #0f172a; font-size: 16px;">
              🚀 Prochaines étapes pour valider la commande :
            </h3>
            ${stepsHtml}
          </div>

          ${signatureLink
        ? getBulletproofEmailButton(signatureLink, '🖋️ Consulter ou signer mon devis', '#f97316')
        : ''
      }

          ${session.variantsMode === true
        ? `<p style="margin: 0 0 14px 0; color: #475569; font-size: 14px; line-height: 1.6;">Le montant total et l'acompte correspondront à la <strong>configuration que vous retiendrez</strong> au moment de la signature en ligne.</p>`
        : ''
      }
          ${getTransferBlockHtml({
        session,
        heading: 'Modalités de règlement',
        showAmounts: session.variantsMode !== true,
      })}

          ${signatureLink && expiresAtLabel
        ? `<p style="margin: 22px 0 0 0; color: #64748b; font-size: 13px; text-align: center;">Lien de signature actif jusqu'au <strong>${escapeHtml(expiresAtLabel)}</strong>.</p>`
        : ''
      }
        </td>
      </tr>
      ${getEmailFooterHtml()}
    `,
  });
};

const buildSignedConfirmationHtml = ({ session }) => {
  const quoteNumber = getEscapedDisplayQuoteNumber(session.quote?.number);
  const hasMeasurementVisit = session.quote?.hasMeasurementVisit === true;

  // Textes des 2 étapes adaptés selon la présence d'une pose (métré) ou non.
  const step1Text = hasMeasurementVisit
    ? "Pour lancer officiellement votre commande, merci de procéder au règlement de l'acompte. Celui-ci peut être réglé par virement bancaire, ou par chèque/virement lors de la prise de côtes."
    : "Pour valider officiellement votre commande et lancer la fabrication, merci de procéder au règlement de l'acompte par virement bancaire.";
  const step2Title = hasMeasurementVisit ? 'Prise de mesures (Métré)' : 'Lancement en fabrication';
  const step2Text = hasMeasurementVisit
    ? "Notre expert technique vous contactera très rapidement pour fixer le rendez-vous de métré définitif à votre domicile. C'est la garantie d'une installation parfaite ! 📏"
    : "Vos dimensions ayant été fournies et validées, la fabrication sur-mesure de vos menuiseries débutera dès la réception de votre acompte. Nous vous tiendrons informé de la date de livraison. 🛠️";

  return getResponsiveEmailLayout({
    preheaderText:
      'Nous avons bien reçu votre signature. Votre projet de menuiseries est officiellement lancé !',
    contentHtml: `
      ${getEmailHeaderHtml({ accentColor: '#22c55e', subtitle: '' })}
      <tr>
        <td class="sg-content" style="padding: 40px 30px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 50px; margin-bottom: 10px; line-height: 1;">✅</div>
            <h2 style="margin: 0; color: #0f172a; font-size: 24px; font-weight: 800;">Commande validée !</h2>
          </div>

          <p style="line-height: 1.6; color: #475569; font-size: 16px;">Bonjour <strong>${escapeHtml(session.recipient?.fullName || 'Madame, Monsieur')}</strong>,</p>
          <p style="line-height: 1.6; color: #475569; font-size: 16px;">Nous vous confirmons la bonne réception de votre signature électronique pour le devis <strong>n°${quoteNumber}</strong>${session.signedAt ? ` le ${escapeHtml(formatDateTimeLabel(session.signedAt))}` : ''}. Toute l'équipe SARANGE vous remercie pour votre confiance.</p>
          <p style="line-height: 1.6; color: #475569; font-size: 16px;">Votre projet de menuiseries sur-mesure est désormais officiellement lancé. 🎉</p>

          ${
            session.signature?.selectedVariantName
              ? `<div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 14px 16px; margin: 24px 0;">
                   <p style="margin: 0; color: #065f46; font-size: 15px;">Configuration retenue : <strong>${escapeHtml(session.signature.selectedVariantName)}</strong>${
                     session.signature.selectedVariantTotalTTC
                       ? ` — <strong>${escapeHtml(formatCurrency(session.signature.selectedVariantTotalTTC))} TTC</strong>`
                       : ''
                   }</p>
                 </div>`
              : ''
          }

          <div class="sg-block" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #22c55e; padding: 25px; margin: 35px 0; border-radius: 8px;">
            <h3 style="margin-top: 0; margin-bottom: 20px; color: #0f172a; font-size: 17px;">
              🚀 La suite de votre projet en 2 étapes :
            </h3>

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
              <tr>
                <td class="sg-step-indent" width="40" valign="top">
                  <div class="sg-step-num" style="background-color: #f97316; color: white; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-size: 14px; font-weight: bold;">1</div>
                </td>
                <td valign="top">
                  <p style="margin: 0 0 8px 0; color: #334155; font-size: 16px;"><strong>Règlement de l'acompte</strong></p>
                  <p style="margin: 0 0 10px 0; color: #475569; line-height: 1.5; font-size: 15px;">${step1Text}</p>
                  ${getTransferBlockHtml({
      session,
      heading: 'Coordonnées bancaires',
      showAmounts: true,
      showSettlementNotice: false,
    })}
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="sg-step-indent" width="40" valign="top">
                  <div class="sg-step-num" style="background-color: #f97316; color: white; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-size: 14px; font-weight: bold;">2</div>
                </td>
                <td valign="top">
                  <p style="margin: 0 0 8px 0; color: #334155; font-size: 16px;"><strong>${step2Title}</strong></p>
                  <p style="margin: 0; color: #475569; line-height: 1.5; font-size: 15px;">${step2Text}</p>
                </td>
              </tr>
            </table>
          </div>

          <p style="line-height: 1.6; color: #475569; font-size: 15px;">Une question ? Contactez-nous au <strong>${SUPPORT_PHONE}</strong> ou répondez directement à cet email.</p>
          <p style="line-height: 1.6; color: #0f172a; font-size: 16px; margin: 24px 0 0 0;">À très bientôt,<br><strong>L'équipe SARANGE</strong></p>
        </td>
      </tr>
      ${getEmailFooterHtml({ compact: true })}
    `,
  });
};

// Récapitulatif « panneaux décoratifs choisis » pour la notification interne SARANGE.
// Met en évidence toute plus-value à facturer (avenant) quand le panneau choisi dépasse
// le standard inclus au devis. Renvoie '' si le devis ne comporte aucune porte à panneau.
const buildPanelChoicesEmailHtml = (session) => {
  const selections = Array.isArray(session.panelSelections) ? session.panelSelections : [];
  if (!selections.length) return '';
  const choices = session.signature?.panelChoices || {};
  let totalSupplement = 0;
  const rows = selections
    .map((selection) => {
      const choice = choices[selection.lineId] || {};
      const panel =
        choice.panelName ||
        [choice.gamme, choice.panelRef].filter(Boolean).join(' ') ||
        'Non renseigné';
      const couleur = choice.couleur || selection.colorLabel || '';
      const croisillon = choice.croisillon || '';
      const supplement = Number(choice.plusValueTotaleHT) || 0;
      totalSupplement += supplement;
      const door =
        [selection.productLabel, selection.repere].filter(Boolean).join(' - ') || 'Porte';
      const bits = [panel, couleur, croisillon ? `croisillons ${croisillon}` : '']
        .filter(Boolean)
        .join(' · ');
      const supplementHtml =
        supplement > 0
          ? `<span style="color:#b45309;font-weight:bold;white-space:nowrap;">+${escapeHtml(formatCurrency(supplement))} HT</span>`
          : `<span style="color:#16a34a;">inclus</span>`;
      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;font-weight:bold;width:38%;vertical-align:top;">${escapeHtml(door)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#334155;font-size:14px;">${escapeHtml(bits)} — ${supplementHtml}</td>
        </tr>`;
    })
    .join('');
  const totalHtml =
    totalSupplement > 0
      ? `<p style="margin:12px 0 0;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;color:#b45309;font-size:14px;font-weight:bold;">⚠️ Supplément panneaux à facturer (avenant) : +${escapeHtml(formatCurrency(totalSupplement))} HT</p>`
      : '';
  return `
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-top:20px;">
      <h3 style="margin:0 0 10px;color:#0f172a;font-size:16px;">🚪 Panneaux décoratifs choisis</h3>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      ${totalHtml}
    </div>`;
};

const buildInternalSignatureHtml = ({ session, type }) => {
  const isSigned = type === 'signe';
  const isRefused = type === 'refuse';
  const accentColor = isSigned ? '#3b82f6' : isRefused ? '#ef4444' : '#64748b';
  const eventDate = isSigned ? session.signedAt : isRefused ? session.refusedAt : session.updatedAt;
  const dashboardUrl = buildAbsoluteUrl('/devis');
  const quoteNumber = getDisplayQuoteNumber(session.quote?.number);
  const quoteNumberHtml = getEscapedDisplayQuoteNumber(session.quote?.number);

  return getResponsiveEmailLayout({
    preheaderText: isSigned
      ? `Nouveau devis signé par ${session.recipient?.fullName || 'un client'}.`
      : `Le devis n°${quoteNumber} a été refusé par le client.`,
    contentHtml: `
      ${getEmailHeaderHtml({
      accentColor,
      subtitle: '',
      notificationLabel: 'NOTIFICATION',
      padding: '20px',
    })}
      <tr>
        <td style="padding: 30px;">
          <h2 style="margin-top: 0; color: #0f172a; font-size: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px;">
            ${isSigned ? '✍️ Nouvelle signature reçue !' : '⚠️ Refus du devis enregistré'}
          </h2>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-top: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 15px; width: 35%;">Client</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 16px; font-weight: bold;">${escapeHtml(session.recipient?.fullName || 'Client')}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 15px;">Email</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 15px;"><a href="mailto:${escapeHtml(session.recipient?.email || '')}" style="color: ${accentColor}; text-decoration: none;">${escapeHtml(session.recipient?.email || 'Non renseigné')}</a></td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 15px;">Devis N°</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #f97316; font-size: 18px; font-weight: bold;">${quoteNumberHtml}</td>
              </tr>
              ${session.signature?.selectedVariantName
        ? `
                    <tr>
                      <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 15px;">Configuration</td>
                      <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 15px; font-weight: bold;">${escapeHtml(session.signature.selectedVariantName)}${
            session.signature.selectedVariantTotalTTC
              ? ` — ${escapeHtml(formatCurrency(session.signature.selectedVariantTotalTTC))} TTC`
              : ''
          }</td>
                    </tr>
                  `
        : ''
      }
              <tr>
                <td style="padding: 12px 0; ${session.signature?.refusalReason ? 'border-bottom: 1px solid #e2e8f0;' : ''} color: #64748b; font-size: 15px;">Date</td>
                <td style="padding: 12px 0; ${session.signature?.refusalReason ? 'border-bottom: 1px solid #e2e8f0;' : ''} color: #0f172a; font-size: 15px;">${escapeHtml(formatDateTimeLabel(eventDate || new Date()))}</td>
              </tr>
              ${session.signature?.refusalReason
        ? `
                    <tr>
                      <td style="padding: 12px 0; color: #64748b; font-size: 15px;">Motif</td>
                      <td style="padding: 12px 0; color: #0f172a; font-size: 15px;">${escapeHtml(session.signature.refusalReason)}</td>
                    </tr>
                  `
        : ''
      }
            </table>
          </div>

          ${isSigned ? buildPanelChoicesEmailHtml(session) : ''}

          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px;">
            <tr>
              <td width="50%" align="center" style="padding-right: 5px;">
                <a href="mailto:${escapeHtml(session.recipient?.email || '')}?subject=Suite%20%C3%A0%20votre%20devis%20SARANGE" style="background-color: #f1f5f9; color: #334155; padding: 12px 0; width: 100%; text-decoration: none; border-radius: 6px; font-size: 14px; display: inline-block; border: 1px solid #cbd5e1; text-align: center;">✉️ Envoyer un email</a>
              </td>
              <td width="50%" align="center" style="padding-left: 5px;">
                ${getBulletproofEmailButton(dashboardUrl, 'Accéder au suivi des devis →', accentColor).replace('margin: 35px 0;', 'margin: 0;')}
              </td>
            </tr>
          </table>
        </td>
      </tr>
      ${getEmailFooterHtml({ compact: true })}
    `,
  });
};

const buildReminderEmailHtml = ({ session, level }) => {
  const reminder = getRichReminderDefinition(session, level);
  if (!reminder) {
    throw createHttpError('Niveau de relance invalide.', 400);
  }

  const signatureLink = buildSignatureLink(session);

  return {
    subject: reminder.subject,
    html: getResponsiveEmailLayout({
      preheaderText: reminder.preheader,
      contentHtml: `
        ${getEmailHeaderHtml({ accentColor: reminder.accentColor, subtitle: '' })}
        <tr>
          <td style="padding: 40px 30px;">
            ${reminder.contentHtml}
            ${signatureLink ? getBulletproofEmailButton(signatureLink, reminder.buttonLabel, reminder.accentColor) : ''}
            <p style="font-size: 14px; color: #64748b; line-height: 1.6; margin: 0;">Le devis PDF reste joint à cet email pour une consultation rapide.</p>
          </td>
        </tr>
        ${getEmailFooterHtml()}
      `,
    }),
    level: Number(level),
  };
};

const buildDeliveryEmailSubject = (session) =>
  session.deliveryMode === 'signature'
    ? `📝 Votre devis SARANGE n°${getDisplayQuoteNumber(session.quote.number)}`
    : `📄 Votre devis SARANGE n°${getDisplayQuoteNumber(session.quote.number)}`;

const toPublicSessionResponse = (session, { active = true } = {}) => {
  if (!session) {
    throw createHttpError('Session non trouvée.', 404);
  }

  return {
    sessionId: session.id,
    active,
    status: normalizeQuoteSignatureStatus(session.status),
    deliveryMode: session.deliveryMode,
    quote: {
      title: session.quote?.title || 'Devis',
      number: session.quote?.number || '',
      reference: session.quote?.reference || '',
      issueDate: timestampToIso(session.quote?.issueDate) || session.quote?.issueDate || null,
      totalHT: Number(session.quote?.totalHT || 0),
      totalTTC: Number(session.quote?.totalTTC || 0),
      tvaRate: Number(session.quote?.tvaRate || 0),
      // Sessions créées avant l'introduction du choix : 1 mois (ancien comportement).
      validityMonths: Number(session.quote?.validityMonths || 1),
    },
    recipient: {
      fullName: session.recipient?.fullName || 'Client',
      email: session.recipient?.email || '',
      phone: session.recipient?.phone || '',
      address: session.recipient?.address || '',
      chantierFullName: session.recipient?.chantierFullName || '',
      chantierAddress: session.recipient?.chantierAddress || '',
    },
    sentAt: timestampToIso(session.sentAt),
    viewedAt: timestampToIso(session.viewedAt),
    signedAt: timestampToIso(session.signedAt),
    refusedAt: timestampToIso(session.refusedAt),
    expiredAt: timestampToIso(session.expiredAt),
    expiresAt: timestampToIso(session.expiresAt),
    lastReminderLevel: session.reminders?.lastLevel || null,
    lastReminderAt: timestampToIso(session.reminders?.lastSentAt),
    requiresReducedVatAck:
      session.variantsMode === true && Array.isArray(session.document?.variants)
        ? session.document.variants.some(
            (variant) => variant?.signatureAnchors?.reducedVatRequired === true
          )
        : session.document?.signatureAnchors?.reducedVatRequired === true,
    variantsMode: session.variantsMode === true,
    variants:
      session.variantsMode === true && Array.isArray(session.document?.variants)
        ? session.document.variants.map((variant) => ({
            id: variant.id,
            name: variant.name || '',
            totalTTC: Number(variant.totalTTC || 0),
            requiresReducedVatAck: variant?.signatureAnchors?.reducedVatRequired === true,
            panelSelections: Array.isArray(variant.panelSelections) ? variant.panelSelections : [],
          }))
        : [],
    selectedVariantId: session.signature?.selectedVariantId || null,
    selectedVariantName: session.signature?.selectedVariantName || null,
    // Portes à panneau décoratif : sélections à effectuer + choix déjà enregistrés.
    panelSelections: Array.isArray(session.panelSelections) ? session.panelSelections : [],
    panelChoices: session.signature?.panelChoices || null,
    originalDocumentUrl: buildSignatureDocumentHref(session.id, 'original'),
    signedDocumentUrl: session.document?.signedPdfPath
      ? buildSignatureDocumentHref(session.id, 'signed')
      : null,
    signingUrl: buildAbsoluteUrl(buildSignaturePageHref(session.id)),
  };
};

const loadSessionContext = async (sessionId) => {
  ensureServerConfig();
  const db = getFirebaseAdminDb();
  const sessionRef = readSessionDocumentRef(db, sessionId);
  const sessionSnapshot = await sessionRef.get();

  if (!sessionSnapshot.exists) {
    throw createHttpError('Lien de signature introuvable.', 404);
  }

  let session = {
    id: sessionSnapshot.id,
    ...sessionSnapshot.data(),
  };

  // Fallback pour les anciennes sessions sans userId/quoteId
  // On essaie de récupérer ces infos depuis le document de signature lui-même
  // ou depuis une recherche dans la collection des quotes
  if (!session.userId || !session.quoteId) {
    console.warn('Session missing userId/quoteId, attempting recovery:', {
      sessionId: session.id,
      hasUserId: !!session.userId,
      hasQuoteId: !!session.quoteId,
    });

    // Essayer de trouver l'utilisateur et le devis via la quote number si disponible
    if (session.quote?.number) {
      // Chercher dans les quotes existantes
      const quotesSnapshot = await db
        .collectionGroup('quotes')
        .where('quoteNumber', '==', session.quote.number)
        .limit(1)
        .get();

      if (!quotesSnapshot.empty) {
        const quoteDoc = quotesSnapshot.docs[0];
        const userId = quoteDoc.ref.parent.parent.id; // Récupérer l'ID utilisateur du parent

        session = {
          ...session,
          userId,
          quoteId: quoteDoc.id,
        };

        console.info('Session recovered:', { sessionId: session.id, userId, quoteId: quoteDoc.id });
      }
    }

    // Si toujours pas d'userId/quoteId, erreur
    if (!session.userId || !session.quoteId) {
      console.error('Session cannot be recovered:', {
        sessionId: session.id,
        quoteNumber: session.quote?.number,
      });
      throw createHttpError(
        'Les données de session sont incomplètes et ne peuvent pas être récupérées. Veuillez renvoyer le devis.',
        400
      );
    }
  }

  try {
    const quoteRef = readQuoteDocumentRef(db, session.userId, session.quoteId);
    const quoteSnapshot = await quoteRef.get();
    const quoteData = quoteSnapshot.exists ? quoteSnapshot.data() : null;
    const isActive = Boolean(quoteData?.signatureWorkflow?.sessionId === session.id);

    return {
      db,
      session,
      sessionRef,
      quoteRef,
      quoteData,
      isActive,
    };
  } catch (error) {
    console.error('Error loading quote context:', {
      sessionId: session.id,
      userId: session.userId,
      quoteId: session.quoteId,
      error: error?.message,
      stack: error?.stack,
    });
    throw error;
  }
};

const maybeExpireSession = async (context) => {
  const expiresAt = coerceDate(context.session?.expiresAt);
  const status = normalizeQuoteSignatureStatus(context.session?.status);

  if (!expiresAt || !['sent', 'viewed'].includes(status) || expiresAt.getTime() > Date.now()) {
    return context;
  }

  const now = new Date();
  const nextSession = {
    ...context.session,
    status: 'expired',
    expiredAt: now,
    updatedAt: now,
  };

  await persistSession(nextSession);

  if (context.isActive) {
    await persistQuoteWorkflow(context.quoteRef, nextSession, {
      status: 'expired',
      updatedAt: now,
    });
  }

  return {
    ...context,
    session: nextSession,
  };
};

const markSessionViewed = async (context) => {
  const status = normalizeQuoteSignatureStatus(context.session?.status);
  if (!context.isActive || context.session?.deliveryMode !== 'signature' || status !== 'sent') {
    return context;
  }

  const now = new Date();
  const nextSession = {
    ...context.session,
    status: 'viewed',
    viewedAt: now,
    updatedAt: now,
  };

  await persistSession(nextSession);
  await persistQuoteWorkflow(context.quoteRef, nextSession, {
    status: 'viewed',
    updatedAt: now,
  });

  return {
    ...context,
    session: nextSession,
  };
};

const assertSessionCanBeSigned = (context) => {
  if (!context.isActive) {
    throw createHttpError("Ce lien de signature n'est plus actif.", 409);
  }

  if (context.session.deliveryMode !== 'signature') {
    throw createHttpError("Ce devis n'est pas disponible pour signature.", 409);
  }

  const status = normalizeQuoteSignatureStatus(context.session.status);
  if (status === 'signed') {
    throw createHttpError('Ce devis est déjà signé.', 409);
  }
  if (status === 'refused') {
    throw createHttpError('Ce devis a déjà été refusé.', 409);
  }
  if (status === 'expired') {
    throw createHttpError('Le lien de signature a expiré.', 410);
  }
};

const buildSignedPdfFilename = (originalFilename) => {
  const sanitized = normalizeFilename(originalFilename, 'devis.pdf');
  return sanitized.replace(/\.pdf$/i, '') + '-SIGNE.pdf';
};

const PANEL_IMAGE_NAME_RE = /^[A-Za-z0-9_-]+\.(jpe?g|png)$/i;

// Récupère le visuel pleine résolution d'un panneau. On lit d'ABORD le fichier sur le
// disque (public/selecteur-panneaux) : fiable en local et indépendant du réseau ; à
// défaut on tente une récupération HTTP (asset servi en statique). Tolérant : renvoie
// null en cas d'échec (le PDF affichera « visuel indisponible » sans bloquer la signature).
const fetchPanelImage = async (imageFile) => {
  if (!imageFile || !PANEL_IMAGE_NAME_RE.test(imageFile)) return null;
  const isPng = /\.png$/i.test(imageFile);

  try {
    const filePath = path.join(process.cwd(), 'public', 'selecteur-panneaux', imageFile);
    const buffer = await readFile(filePath);
    if (buffer?.length) return { buffer, isPng };
  } catch {
    // Fichier indisponible sur le disque (ex. dossier non tracé en prod) -> repli réseau.
  }

  try {
    const response = await fetch(buildAbsoluteUrl(`/selecteur-panneaux/${imageFile}`));
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), isPng };
  } catch {
    return null;
  }
};

// Page « Vos panneaux décoratifs sélectionnés » ajoutée au PDF signé : pour chaque porte,
// le visuel du panneau retenu + ses caractéristiques (panneau, couleur, croisillons,
// éventuel supplément). Permet au client de retrouver son choix sans rouvrir le catalogue.
const drawPanelVisualsPage = async (pdfDocument, regularFont, { entries, quoteNumber, signedAt }) => {
  if (!Array.isArray(entries) || entries.length === 0) return;
  const boldFont = await pdfDocument.embedFont(StandardFonts.HelveticaBold);
  const base = pdfDocument.getPage(0).getSize();
  const margin = 46;
  const contentW = base.width - margin * 2;
  const ink = rgb(0.06, 0.09, 0.16); // slate-900
  const muted = rgb(0.42, 0.45, 0.52); // slate-500
  const brand = rgb(0.976, 0.451, 0.086); // orange-500 (#f97316)
  const border = rgb(0.886, 0.91, 0.941); // slate-200
  const supplementColor = rgb(0.7, 0.33, 0.04);
  const imgBoxW = 150;
  const imgBoxH = 185;
  const lineH = 15;
  let page = pdfDocument.addPage([base.width, base.height]);
  let y = base.height - margin;

  // En-tête : titre adapté (singulier / pluriel) + filet orange + sous-titre.
  const heading =
    entries.length > 1
      ? 'Vos panneaux décoratifs sélectionnés'
      : 'Votre panneau décoratif sélectionné';
  page.drawText(toPdfSafeText(heading), { x: margin, y: y - 15, size: 16, font: boldFont, color: ink });
  page.drawRectangle({ x: margin, y: y - 24, width: 48, height: 3, color: brand });
  page.drawText(
    toPdfSafeText(`Devis ${quoteNumber || ''} - signé le ${formatDateLabel(signedAt)}`.trim()),
    { x: margin, y: y - 38, size: 9, font: regularFont, color: muted }
  );
  y -= 56;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    // Détail affiché SOUS le visuel (la photo ne reflète pas toujours la couleur des
    // croisillons) : panneau (gamme + numéro), couleur, croisillons, supplément éventuel.
    const captionLines = [{ text: `Panneau : ${entry.panelLabel || ''}`, font: boldFont, color: ink }];
    if (entry.couleur) captionLines.push({ text: `Couleur : ${entry.couleur}`, font: regularFont, color: ink });
    if (entry.croisillon) captionLines.push({ text: `Croisillons : ${entry.croisillon}`, font: regularFont, color: ink });
    if (entry.supplementText) {
      captionLines.push({ text: `Supplément : ${entry.supplementText}`, font: boldFont, color: supplementColor });
    }

    const blockHeight = 22 + imgBoxH + 16 + captionLines.length * lineH + 24;
    if (y - blockHeight < margin) {
      page = pdfDocument.addPage([base.width, base.height]);
      y = base.height - margin;
    }

    // Intitulé de la porte (repère) avec une petite barre d'accent orange.
    page.drawRectangle({ x: margin, y: y - 13, width: 3.5, height: 13, color: brand });
    page.drawText(toPdfSafeText(entry.door || 'Porte'), {
      x: margin + 10,
      y: y - 12,
      size: 12,
      font: boldFont,
      color: ink,
    });
    const imgTop = y - 22;

    // Visuel récupéré (encadré), ou cadre « indisponible ».
    let embedded = null;
    if (entry.imageBuffer) {
      try {
        embedded = entry.imageIsPng
          ? await pdfDocument.embedPng(entry.imageBuffer)
          : await pdfDocument.embedJpg(entry.imageBuffer);
      } catch {
        embedded = null;
      }
    }
    let drawnHeight = imgBoxH;
    if (embedded) {
      const scale = Math.min(imgBoxW / embedded.width, imgBoxH / embedded.height);
      const w = embedded.width * scale;
      const h = embedded.height * scale;
      drawnHeight = h;
      // Cadre : rectangle gris légèrement plus grand, puis le visuel par-dessus (= bordure 1pt).
      page.drawRectangle({ x: margin - 1, y: imgTop - h - 1, width: w + 2, height: h + 2, color: border });
      page.drawImage(embedded, { x: margin, y: imgTop - h, width: w, height: h });
    } else {
      page.drawRectangle({
        x: margin,
        y: imgTop - imgBoxH,
        width: imgBoxW,
        height: imgBoxH,
        color: rgb(0.97, 0.98, 0.99),
        borderColor: border,
        borderWidth: 1,
      });
      page.drawText(toPdfSafeText('Visuel indisponible'), {
        x: margin + 14,
        y: imgTop - imgBoxH / 2,
        size: 9,
        font: regularFont,
        color: muted,
      });
    }

    // Détail sous le visuel.
    let cy = imgTop - drawnHeight - 16;
    captionLines.forEach((line) => {
      page.drawText(toPdfSafeText(line.text), {
        x: margin,
        y: cy,
        size: 10.5,
        font: line.font,
        color: line.color,
      });
      cy -= lineH;
    });

    // Filet de séparation entre deux panneaux.
    y = cy - 8;
    if (index < entries.length - 1) {
      page.drawRectangle({ x: margin, y, width: contentW, height: 0.6, color: border });
      y -= 18;
    }
  }
};

const applySignatureToPdf = async ({
  originalPdfBuffer,
  signatureDataUrl,
  signatureAnchors,
  signedAt,
  signerName,
  acceptReducedVat,
  panelStampEntries = [],
  quoteNumber = '',
}) => {
  if (!signatureAnchors?.signatureBox || !Number.isFinite(Number(signatureAnchors.pageNumber))) {
    throw createHttpError('Les reperes de signature du devis sont indisponibles.', 500);
  }

  const pdfDocument = await PDFDocument.load(originalPdfBuffer);
  const signatureImage = parseDataUrl(signatureDataUrl);
  const embeddedImage =
    signatureImage.contentType === 'image/jpeg' || signatureImage.contentType === 'image/jpg'
      ? await pdfDocument.embedJpg(signatureImage.buffer)
      : await pdfDocument.embedPng(signatureImage.buffer);
  const regularFont = await pdfDocument.embedFont(StandardFonts.Helvetica);
  const italicFont = await pdfDocument.embedFont(StandardFonts.HelveticaOblique);

  const pageIndex = Math.max(0, Number(signatureAnchors.pageNumber) - 1);
  const page = pdfDocument.getPage(pageIndex);
  const pageHeight = page.getHeight();

  page.drawText('Lu et approuve, bon pour accord', {
    x: toPdfPoints(signatureAnchors.agreementMention?.x || 0),
    y: topMmToPdfY(pageHeight, signatureAnchors.agreementMention?.y || 0),
    size: 11,
    font: italicFont,
    color: rgb(0.1, 0.13, 0.2),
  });

  page.drawText(formatDateLabel(signedAt), {
    x: toPdfPoints(signatureAnchors.dateLine?.valueX || 0),
    y: topMmToPdfY(pageHeight, signatureAnchors.dateLine?.valueY || 0),
    size: 10,
    font: italicFont,
    color: rgb(0.1, 0.13, 0.2),
  });

  const signatureBox = signatureAnchors.signatureBox;
  const innerPadding = Number(signatureBox.padding || 4);
  const signatureAreaTop = Number(signatureBox.y || 0) + 10;
  const signatureAreaLeft = Number(signatureBox.x || 0) + innerPadding;
  const signatureAreaWidth = Math.max(8, Number(signatureBox.width || 0) - innerPadding * 2);
  const signatureAreaHeight = Math.max(8, Number(signatureBox.height || 0) - 15);

  const scaledImage = embeddedImage.scale(1);
  const ratio = scaledImage.width / scaledImage.height || 1;
  let imageWidth = toPdfPoints(signatureAreaWidth);
  let imageHeight = imageWidth / ratio;
  const maxHeight = toPdfPoints(signatureAreaHeight);

  if (imageHeight > maxHeight) {
    imageHeight = maxHeight;
    imageWidth = imageHeight * ratio;
  }

  const imageX =
    toPdfPoints(signatureAreaLeft) + (toPdfPoints(signatureAreaWidth) - imageWidth) / 2;
  const imageY =
    pageHeight -
    toPdfPoints(signatureAreaTop + signatureAreaHeight) +
    (toPdfPoints(signatureAreaHeight) - imageHeight) / 2;

  page.drawImage(embeddedImage, {
    x: imageX,
    y: imageY,
    width: imageWidth,
    height: imageHeight,
  });

  if (signerName) {
    page.drawText(String(signerName).trim(), {
      x: toPdfPoints(Number(signatureBox.x || 0) + innerPadding),
      y:
        pageHeight -
        toPdfPoints(Number(signatureBox.y || 0) + Number(signatureBox.height || 0) - 3),
      size: 8,
      font: regularFont,
      color: rgb(0.2, 0.23, 0.3),
    });
  }

  if (acceptReducedVat && signatureAnchors.reducedVatCheckbox) {
    const checkbox = signatureAnchors.reducedVatCheckbox;
    const left = toPdfPoints(checkbox.x);
    const top = toPdfPoints(checkbox.y);
    const size = toPdfPoints(checkbox.width);
    const bottomY = pageHeight - (top + size);
    const topY = pageHeight - top;

    page.drawLine({
      start: { x: left, y: bottomY },
      end: { x: left + size, y: topY },
      thickness: 1.2,
      color: rgb(0.1, 0.13, 0.2),
    });
    page.drawLine({
      start: { x: left + size, y: bottomY },
      end: { x: left, y: topY },
      thickness: 1.2,
      color: rgb(0.1, 0.13, 0.2),
    });
  }

  // Tampon des panneaux décoratifs choisis :
  //  1) tampon « collé à la ligne » à la position mémorisée (si repère dispo) ;
  //  2) page récapitulative AVEC VISUELS (image + caractéristiques) — le client garde
  //     ainsi une trace de chaque panneau choisi sans rouvrir le catalogue.
  // Isolé dans un try/catch : un souci de tampon ne doit JAMAIS empêcher la signature
  // (les choix restent enregistrés en base).
  if (Array.isArray(panelStampEntries) && panelStampEntries.length > 0) {
    try {
      const lineAnchors = Array.isArray(signatureAnchors.panelLineAnchors)
        ? signatureAnchors.panelLineAnchors
        : [];
      const anchorByLine = new Map(
        lineAnchors.filter((anchor) => anchor && anchor.lineId).map((anchor) => [anchor.lineId, anchor])
      );
      const inkColor = rgb(0.1, 0.13, 0.2);

      // 1) Tampon inline, à la position exacte de la ligne porte.
      panelStampEntries.forEach((entry) => {
        const anchor = anchorByLine.get(entry.lineId);
        const pageNumber = Number(anchor?.pageNumber);
        if (
          anchor &&
          Number.isFinite(pageNumber) &&
          pageNumber >= 1 &&
          pageNumber <= pdfDocument.getPageCount()
        ) {
          const target = pdfDocument.getPage(pageNumber - 1);
          const targetHeight = target.getHeight();
          const size = Math.max(6, Number(anchor.fontSizePt) || 7.8);
          const maxWidth = toPdfPoints(
            Number(anchor.maskWidthMm) || Number(anchor.maxWidthMm) || 60
          );
          const xPt = toPdfPoints(Number(anchor.xMm) || 0);
          const baselinePt = topMmToPdfY(targetHeight, Number(anchor.yMm) || 0);
          // Masque blanc sur la mention « au choix sur catalogue » avant d'écrire le choix.
          target.drawRectangle({
            x: xPt - 1,
            y: baselinePt - size * 0.3,
            width: maxWidth + 2,
            height: size * 1.2,
            color: rgb(1, 1, 1),
          });
          let text = toPdfSafeText(entry.inlineValue);
          while (text.length > 4 && regularFont.widthOfTextAtSize(text, size) > maxWidth) {
            text = text.slice(0, -1);
          }
          target.drawText(text, {
            x: xPt,
            y: baselinePt,
            size,
            font: regularFont,
            color: inkColor,
          });
        }
      });

      // 2) Page récapitulative avec visuels des panneaux choisis.
      await drawPanelVisualsPage(pdfDocument, regularFont, {
        entries: panelStampEntries,
        quoteNumber,
        signedAt,
      });
    } catch (panelError) {
      console.error('[applySignatureToPdf] Tampon panneaux non appliqué', {
        message: panelError?.message,
      });
    }
  }

  return Buffer.from(await pdfDocument.save());
};

export const createAndSendQuoteDelivery = async ({
  userId,
  quoteId,
  deliveryMode,
  pdfBase64,
  pdfInfo,
  variants,
}) => {
  console.info('[createAndSendQuoteDelivery] Starting', {
    userId,
    quoteId,
    deliveryMode,
    hasPdfBase64: !!pdfBase64,
    pdfInfoKeys: pdfInfo ? Object.keys(pdfInfo) : null,
    variantsCount: Array.isArray(variants) ? variants.length : null,
  });

  ensureServerConfig({
    requireEmail: true,
    requirePublicUrl: deliveryMode === 'signature',
  });

  if (!['email', 'signature'].includes(deliveryMode)) {
    throw createHttpError('Mode d envoi invalide.', 400);
  }

  const db = getFirebaseAdminDb();
  const quoteRef = readQuoteDocumentRef(db, userId, quoteId);
  const quoteSnapshot = await quoteRef.get();

  if (!quoteSnapshot.exists) {
    console.error('[createAndSendQuoteDelivery] Quote not found', { userId, quoteId });
    throw createHttpError('Devis introuvable.', 404);
  }

  const quoteData = quoteSnapshot.data();
  console.info('[createAndSendQuoteDelivery] Loaded quote', {
    quoteId,
    quoteDataKeys: Object.keys(quoteData || {}),
    hasTitle: !!quoteData?.title,
    hasQuoteNumber: !!quoteData?.quoteNumber,
    hasClientData: !!quoteData?.payload?.clientData,
  });
  const existingSessionId = normalizeEnv(quoteData?.signatureWorkflow?.sessionId);
  const existingStatus = normalizeQuoteSignatureStatus(
    quoteData?.signatureWorkflow?.status || quoteData?.status
  );

  if (existingStatus === 'signed' && quoteData?.signatureWorkflow?.needsResend !== true) {
    throw createHttpError('Ce devis est déjà signé. Modifiez-le avant de le renvoyer.', 409);
  }

  const sessionId = existingSessionId || buildSessionId();
  const sessionRef = readSessionDocumentRef(db, sessionId);
  const existingSessionSnapshot = await sessionRef.get();
  const existingSession = existingSessionSnapshot.exists
    ? { id: existingSessionSnapshot.id, ...existingSessionSnapshot.data() }
    : null;

  const pdfBuffer = parsePdfBuffer(pdfBase64);
  const now = new Date();
  const originalFilename = normalizeFilename(
    pdfInfo?.filename || existingSession?.document?.originalFilename || 'devis.pdf'
  );
  const originalPdfPath = buildStoragePath(sessionId, 'original', originalFilename);

  await uploadPdfBuffer(originalPdfPath, pdfBuffer);

  // Variantes (option A) : on stocke le PDF mono signable de CHAQUE variante,
  // avec ses repères de signature. Le PDF "original" reste le comparatif (vue client).
  let documentVariants = null;
  if (Array.isArray(variants) && variants.length > 1) {
    documentVariants = [];
    for (let index = 0; index < variants.length; index += 1) {
      const variant = variants[index];
      const variantBuffer = parsePdfBuffer(variant?.pdfBase64);
      const variantFilename = normalizeFilename(variant?.filename || `variante-${index + 1}.pdf`);
      const variantPath = buildStoragePath(
        sessionId,
        `variant-${normalizeFilename(String(variant?.id || index + 1))}`,
        variantFilename
      );
      await uploadPdfBuffer(variantPath, variantBuffer);
      documentVariants.push({
        id: normalizeEnv(variant?.id) || `var-${index + 1}`,
        name: normalizeEnv(variant?.name) || `Variante ${index + 1}`,
        totalTTC: Number(variant?.totalTTC || 0),
        totalHT: Number(variant?.totalHT || 0),
        tvaRate: Number(variant?.tvaRate || 0),
        // Réglages d'échéancier + présence de pose : nécessaires pour recalculer
        // l'acompte exact de la variante choisie au moment de la signature.
        quoteSettings: normalizeQuoteSettings(variant?.quoteSettings || {}),
        hasMeasurementVisit: variant?.hasMeasurementVisit === true,
        // Portes à panneau décoratif PROPRES à cette variante (couleurs spécifiques) :
        // le client les configure avec la bonne couleur selon la variante choisie.
        panelSelections: Array.isArray(variant?.panelSelections) ? variant.panelSelections : [],
        pdfPath: variantPath,
        filename: variantFilename,
        signatureAnchors: variant?.signatureAnchors || null,
      });
    }
  }

  const sessionPayload = buildSessionPayload({
    existingSession,
    sessionId,
    userId,
    quoteId,
    deliveryMode,
    quoteData,
    pdfInfo,
    originalPdfPath,
    originalFilename,
    variants: documentVariants,
    now,
  });

  if (!sessionPayload.recipient.email) {
    throw createHttpError("Aucune adresse email client n'est renseignée sur ce devis.", 400);
  }

  await persistSession(sessionPayload);

  try {
    const deliveryInfo = await sendMail({
      to: sessionPayload.recipient.email,
      subject: buildDeliveryEmailSubject(sessionPayload),
      html: buildDeliveryEmailHtml({ session: sessionPayload }),
      attachments: [
        {
          filename: sessionPayload.document.originalFilename,
          content: pdfBuffer,
          contentType: PDF_CONTENT_TYPE,
        },
      ],
    });

    const sentSession = {
      ...sessionPayload,
      status: 'sent',
      sentAt: now,
      updatedAt: now,
      emailMessageId: deliveryInfo?.messageId || null,
    };

    await persistSession(sentSession);
    await persistQuoteWorkflow(quoteRef, sentSession, {
      status: 'sent',
      needsResend: false,
      updatedAt: now,
    });

    return {
      ok: true,
      session: toPublicSessionResponse(sentSession),
    };
  } catch (error) {
    const failedSession = {
      ...sessionPayload,
      status: 'draft',
      updatedAt: now,
      lastError: error.message || 'Envoi impossible.',
    };

    await persistSession(failedSession);
    await persistQuoteWorkflow(quoteRef, failedSession, {
      status: 'draft',
      needsResend: true,
      updatedAt: now,
      lastError: failedSession.lastError,
    });

    throw createHttpError(
      error.message || 'Envoi impossible. Vérifiez la configuration email.',
      502
    );
  }
};

const reactivateExpiredSession = async (context) => {
  const status = normalizeQuoteSignatureStatus(context.session?.status);
  if (status !== 'expired') {
    return context;
  }

  const now = new Date();
  const nextStatus = context.session.viewedAt ? 'viewed' : 'sent';
  const nextSession = {
    ...context.session,
    status: nextStatus,
    expiredAt: null,
    expiresAt: addDays(now, getSignatureExpiryDays()),
    updatedAt: now,
  };

  await persistSession(nextSession);

  if (context.isActive) {
    await persistQuoteWorkflow(context.quoteRef, nextSession, {
      status: nextStatus,
      updatedAt: now,
    });
  }

  return {
    ...context,
    session: nextSession,
  };
};

export const sendQuoteSignatureReminder = async ({ sessionId, reminderLevel }) => {
  ensureServerConfig({
    requireEmail: true,
    requirePublicUrl: true,
  });

  let context = await loadSessionContext(sessionId);
  context = await maybeExpireSession(context);

  if (!context.isActive) {
    throw createHttpError("Ce lien de signature n'est plus actif. Modifiez puis renvoyez le devis.", 409);
  }

  if (context.session.deliveryMode !== 'signature') {
    throw createHttpError("Ce devis n'est pas configure pour la signature en ligne.", 409);
  }

  const status = normalizeQuoteSignatureStatus(context.session.status);
  if (status === 'signed') {
    throw createHttpError('Ce devis est déjà signé.', 409);
  }
  if (status === 'refused') {
    throw createHttpError('Ce devis a déjà été refusé.', 409);
  }

  context = await reactivateExpiredSession(context);

  const originalPdfPath = context.session.document?.originalPdfPath;
  const originalFilename = context.session.document?.originalFilename;
  if (!originalPdfPath || !originalFilename) {
    throw createHttpError("Le PDF d'origine du devis est introuvable.", 404);
  }

  const reminder = buildReminderEmailHtml({
    session: context.session,
    level: reminderLevel,
  });
  if (!context.session.recipient?.email) {
    throw createHttpError("Aucune adresse email client n'est renseignée sur ce devis.", 400);
  }
  const pdfBuffer = await downloadPdfBuffer(originalPdfPath);

  await sendMail({
    to: context.session.recipient?.email,
    subject: reminder.subject,
    html: reminder.html,
    attachments: [
      {
        filename: originalFilename,
        content: pdfBuffer,
        contentType: PDF_CONTENT_TYPE,
      },
    ],
  });

  const now = new Date();
  const nextStatus =
    normalizeQuoteSignatureStatus(context.session.status) === 'draft'
      ? 'sent'
      : normalizeQuoteSignatureStatus(context.session.status);
  const remindedSession = {
    ...context.session,
    status: nextStatus,
    sentAt: context.session.sentAt || now,
    updatedAt: now,
    reminders: {
      count: Number(context.session.reminders?.count || 0) + 1,
      lastLevel: reminder.level,
      lastSentAt: now,
    },
  };

  await persistSession(remindedSession);
  await persistQuoteWorkflow(context.quoteRef, remindedSession, {
    status: nextStatus,
    updatedAt: now,
  });

  return {
    ok: true,
    level: reminder.level,
    session: toPublicSessionResponse(remindedSession),
  };
};

export const getQuoteSignatureSession = async (sessionId) => {
  let context = await loadSessionContext(sessionId);
  context = await maybeExpireSession(context);

  if (context.session.deliveryMode === 'signature') {
    context = await markSessionViewed(context);
  }

  return toPublicSessionResponse(context.session, {
    active: context.isActive,
  });
};

export const getQuoteSignatureDocument = async (sessionId, type = 'original') => {
  let context = await loadSessionContext(sessionId);
  context = await maybeExpireSession(context);

  const normalizedType = type === 'signed' ? 'signed' : 'original';
  const pdfPath =
    normalizedType === 'signed'
      ? context.session.document?.signedPdfPath
      : context.session.document?.originalPdfPath;
  const filename =
    normalizedType === 'signed'
      ? context.session.document?.signedFilename
      : context.session.document?.originalFilename;

  if (!pdfPath || !filename) {
    throw createHttpError('Le document demande est introuvable.', 404);
  }

  return {
    buffer: await downloadPdfBuffer(pdfPath),
    filename,
    contentType: PDF_CONTENT_TYPE,
  };
};

export const signQuoteSignatureSession = async ({
  sessionId,
  signatureDataUrl,
  signerName,
  acceptReducedVat,
  selectedVariantId,
  panelChoices,
  signerIp,
  userAgent,
}) => {
  ensureServerConfig({ requireEmail: true });

  let context = await loadSessionContext(sessionId);
  context = await maybeExpireSession(context);
  assertSessionCanBeSigned(context);

  // Option A : en multi-variantes, on signe le PDF mono de la variante CHOISIE,
  // avec ses propres repères. En mono-option, comportement actuel inchangé.
  const sessionVariants = context.session.document?.variants;
  const variantsMode =
    context.session.variantsMode === true &&
    Array.isArray(sessionVariants) &&
    sessionVariants.length > 1;

  let chosenVariant = null;
  if (variantsMode) {
    chosenVariant = sessionVariants.find((variant) => variant.id === selectedVariantId);
    if (!chosenVariant) {
      throw createHttpError('Veuillez choisir une configuration avant de signer.', 400);
    }
  }

  // Portes à panneau décoratif : un panneau doit être choisi pour CHAQUE porte
  // concernée avant de pouvoir signer (sécurité côté serveur, en plus de l'UI).
  // En multi-variantes, on prend les portes/couleurs de la variante CHOISIE.
  const panelSelections =
    variantsMode && Array.isArray(chosenVariant?.panelSelections)
      ? chosenVariant.panelSelections
      : Array.isArray(context.session.panelSelections)
        ? context.session.panelSelections
        : [];
  let normalizedPanelChoices = null;
  if (panelSelections.length > 0) {
    normalizedPanelChoices = normalizePanelChoices(panelChoices);
    const missing = panelSelections.find(
      (selection) => !normalizedPanelChoices[selection.lineId]
    );
    if (missing) {
      throw createHttpError(
        'Veuillez choisir un panneau pour chaque porte à panneau décoratif avant de signer.',
        400
      );
    }
  }

  const signingAnchors = variantsMode
    ? chosenVariant.signatureAnchors
    : context.session.document?.signatureAnchors;
  const signingPdfPath = variantsMode
    ? chosenVariant.pdfPath
    : context.session.document?.originalPdfPath;
  const signingSourceFilename = variantsMode
    ? chosenVariant.filename
    : context.session.document?.originalFilename;

  if (signingAnchors?.reducedVatRequired === true && acceptReducedVat !== true) {
    throw createHttpError(
      'La mention obligatoire de TVA réduite doit être confirmée avant signature.',
      400
    );
  }

  if (!signingPdfPath) {
    throw createHttpError("Le PDF d'origine du devis est introuvable.", 404);
  }

  // Données de tampon « panneau décoratif » par porte : valeur inline (collée à la ligne)
  // + repli annexe (titre + détails). `lineId` relie le choix au repère mémorisé au PDF.
  const panelStampEntries =
    panelSelections.length > 0 && normalizedPanelChoices
      ? panelSelections.map((selection) => {
          const choice = normalizedPanelChoices[selection.lineId] || {};
          // `panelName` (= id du panneau, ex. « ELA 01 ») contient déjà la gamme :
          // on ne préfixe PAS par `gamme` (sinon « ELA ELA 01 »).
          const panelLabel =
            choice.panelName ||
            [choice.gamme, choice.panelRef].filter(Boolean).join(' ') ||
            'Panneau choisi';
          const couleur = choice.couleur || selection.colorLabel;
          const supplement = Number(choice.plusValueTotaleHT) || 0;
          const supplementText = supplement > 0 ? `+${supplement.toFixed(2)} EUR HT` : '';
          const title =
            [selection.productLabel, selection.repere].filter(Boolean).join(' - ') || 'Porte';
          const details = [`Panneau : ${panelLabel}`];
          if (couleur) details.push(`Couleur : ${couleur}`);
          if (choice.croisillon) details.push(`Croisillons : ${choice.croisillon}`);
          if (supplementText) details.push(`Supplement : ${supplementText}`);
          const inlineBase = [panelLabel, couleur, choice.croisillon].filter(Boolean).join(' - ');
          const inlineValue = supplementText ? `${inlineBase} (${supplementText})` : inlineBase;
          return {
            lineId: selection.lineId,
            inlineValue,
            title,
            details,
            // Champs de la page récapitulative à visuels.
            door: title,
            panelLabel,
            couleur: couleur || '',
            croisillon: choice.croisillon || '',
            supplementText,
            image: choice.image || '',
          };
        })
      : [];

  // Récupération des visuels de panneaux (en parallèle) pour la page récapitulative.
  await Promise.all(
    panelStampEntries.map(async (entry) => {
      const image = await fetchPanelImage(entry.image);
      if (image) {
        entry.imageBuffer = image.buffer;
        entry.imageIsPng = image.isPng;
      }
    })
  );

  const originalPdfBuffer = await downloadPdfBuffer(signingPdfPath);
  const signedAt = new Date();
  const signedPdfBuffer = await applySignatureToPdf({
    originalPdfBuffer,
    signatureDataUrl,
    signatureAnchors: signingAnchors,
    signedAt,
    signerName,
    acceptReducedVat,
    panelStampEntries,
    quoteNumber: getDisplayQuoteNumber(context.session.quote?.number),
  });

  const signedFilename = buildSignedPdfFilename(signingSourceFilename);
  const signedPdfPath = buildStoragePath(sessionId, 'signed', signedFilename);
  await uploadPdfBuffer(signedPdfPath, signedPdfBuffer);

  // Le devis signé reflète la CONFIGURATION CHOISIE : on recale les montants et
  // l'acompte (échéancier de la variante) pour que l'email de confirmation et le
  // suivi affichent les bons chiffres et les bonnes coordonnées de règlement.
  const signedQuote = variantsMode
    ? {
        ...context.session.quote,
        totalTTC: Number(chosenVariant.totalTTC || 0),
        totalHT: Number(chosenVariant.totalHT || 0),
        tvaRate: Number(chosenVariant.tvaRate ?? context.session.quote?.tvaRate ?? 0),
        hasMeasurementVisit: chosenVariant.hasMeasurementVisit === true,
        payment: buildPaymentModel(
          { payload: { quoteSettings: chosenVariant.quoteSettings } },
          Number(chosenVariant.totalTTC || 0)
        ),
      }
    : context.session.quote;

  const signedSession = {
    ...context.session,
    status: 'signed',
    signedAt,
    viewedAt: context.session.viewedAt || signedAt,
    updatedAt: signedAt,
    quote: signedQuote,
    document: {
      ...context.session.document,
      signedPdfPath,
      signedFilename,
    },
    signature: {
      ...context.session.signature,
      signerName: normalizeEnv(signerName) || context.session.recipient?.fullName || null,
      signerIp: normalizeEnv(signerIp),
      userAgent: normalizeEnv(userAgent),
      acceptReducedVat: Boolean(acceptReducedVat),
      selectedVariantId: variantsMode ? chosenVariant.id : null,
      selectedVariantName: variantsMode ? chosenVariant.name || null : null,
      selectedVariantTotalTTC: variantsMode ? Number(chosenVariant.totalTTC || 0) : null,
      panelChoices: normalizedPanelChoices,
    },
  };

  await persistSession(signedSession);
  await persistQuoteWorkflow(context.quoteRef, signedSession, {
    status: 'signed',
    updatedAt: signedAt,
  });

  try {
    await sendMail({
      to: signedSession.recipient.email,
      subject: `🎉 Merci ! Commande validée - Devis n°${getDisplayQuoteNumber(signedSession.quote.number)}`,
      html: buildSignedConfirmationHtml({ session: signedSession }),
      attachments: [
        {
          filename: signedFilename,
          content: signedPdfBuffer,
          contentType: PDF_CONTENT_TYPE,
        },
      ],
    });
  } catch (error) {
    await persistSession({
      ...signedSession,
      lastEmailError: error.message || 'Notification email impossible.',
    });
  }

  const internalEmail = getSmtpConfig().internalEmail;
  if (internalEmail) {
    try {
      await sendMail({
        to: internalEmail,
        subject: `🚀 CONTRAT SIGNÉ : ${signedSession.recipient?.fullName || 'Client'} (${getDisplayQuoteNumber(signedSession.quote.number)})`,
        html: buildInternalSignatureHtml({ session: signedSession, type: 'signe' }),
        attachments: [
          {
            filename: signedFilename,
            content: signedPdfBuffer,
            contentType: PDF_CONTENT_TYPE,
          },
        ],
      });
    } catch {
      // Keep the workflow successful even if the internal notification fails.
    }
  }

  return toPublicSessionResponse(signedSession);
};

export const refuseQuoteSignatureSession = async ({ sessionId, reason = '' }) => {
  ensureServerConfig();

  let context = await loadSessionContext(sessionId);
  context = await maybeExpireSession(context);
  assertSessionCanBeSigned(context);

  const refusedAt = new Date();
  const refusedSession = {
    ...context.session,
    status: 'refused',
    refusedAt,
    updatedAt: refusedAt,
    signature: {
      ...context.session.signature,
      refusalReason: normalizeEnv(reason) || null,
    },
  };

  await persistSession(refusedSession);
  await persistQuoteWorkflow(context.quoteRef, refusedSession, {
    status: 'refused',
    updatedAt: refusedAt,
  });

  const internalEmail = getSmtpConfig().internalEmail;
  if (internalEmail) {
    try {
      await sendMail({
        to: internalEmail,
        subject: `⚠️ Devis refusé : ${refusedSession.recipient?.fullName || 'Client'} (${getDisplayQuoteNumber(refusedSession.quote.number)})`,
        html: buildInternalSignatureHtml({ session: refusedSession, type: 'refuse' }),
      });
    } catch {
      // Keep the refusal even if the internal email fails.
    }
  }

  return toPublicSessionResponse(refusedSession);
};
