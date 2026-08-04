/**
 * cgv-templates.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * CGV ADAPTATIVES de SARANGE — source de vérité unique du texte juridique du
 * devis. Quatre variantes internes, sélectionnées automatiquement (jamais un
 * choix supplémentaire pour l'utilisateur) :
 *   PARTICULIER  × FOURNITURE_SEULE
 *   PARTICULIER  × AVEC_POSE
 *   PROFESSIONNEL × FOURNITURE_SEULE
 *   PROFESSIONNEL × AVEC_POSE
 *
 * Règles clés :
 *  - « acompte », jamais « arrhes » ;
 *  - une seule variante d'échéancier apparaît (celle des réglages du devis) ;
 *  - CM2C uniquement en B2C ; pénalités BCE + 10 pts et indemnité 40 €
 *    uniquement en B2B ;
 *  - aucune clause de pose (réception, garanties travaux) en fourniture seule ;
 *  - le SAV de dix ans n'est PAS présenté comme une garantie gratuite.
 *
 * Le module expose aussi le SNAPSHOT de figement : la version exacte des CGV
 * et conditions de règlement est enregistrée dans le payload du devis au
 * moment de sa finalisation/envoi, et réutilisée telle quelle à la réouverture
 * (une modification future des modèles ne change pas les anciens devis).
 *
 * Imports relatifs purs uniquement : testable par le runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { isKnownClientType, normalizeClientType, isProfessionalClient } from './client-type.mjs';
import { CONTRACT_TYPES } from './line-nature.mjs';
import {
  getInsurancePeriodLabel,
  normalizeCompanyInsurance,
} from './company-insurance.mjs';
import { isAutoliquidation, normalizeTaxRegime } from './tax-regime.mjs';
import {
  buildPaymentLegalParagraph,
  buildPaymentTermsForPdf,
  getValidityLabel,
  normalizeQuoteSettings,
} from './quote-settings.mjs';

// Version des modèles de CGV/conditions de règlement. À incrémenter à chaque
// évolution du texte juridique ci-dessous.
// 2026.07.1 : mention CM2C alignée sur le texte officiel (litiges@cm2c.net,
// téléphone, URL complète).
// 2026.07.2 : suppression de la carte bancaire des modes de règlement, règles
// d'encaissement du chèque, clause de sous-traitance BTP (autoliquidation).
// 2026.08.1 : ajout de l'article 4.5 (retenue de garantie 5% en cas de
// réserves à la réception, avec pose) — voir lib/completion-certificate.mjs.
export const CGV_VERSION = '2026.08.1';

// SIRET du siège actif (source Sirene/INSEE — l'établissement 00027 est fermé).
const SIRET_SARANGE = '82000101400035';

const joinSentences = (...parts) => parts.filter(Boolean).join(' ');

/**
 * Construit les sections de CGV (format { title, text }[] consommé tel quel
 * par le rendu PDF) pour un type de client et un type de contrat donnés.
 * `totals` est accepté pour évolution future (aucun montant n'apparaît dans
 * les CGV : les montants restent dans le tableau de financement du devis).
 */
export const buildCgvSections = ({
  clientType,
  contractType,
  quoteSettings,
  insurance,
  taxRegime,
} = {}) => {
  const isPro = isProfessionalClient(clientType);
  const withPose = contractType === CONTRACT_TYPES.AVEC_POSE;
  const settings = normalizeQuoteSettings(quoteSettings);
  // Sous-traitance BTP : réservée aux marchés de travaux entre professionnels
  // (client pro + pose). Jamais sur un devis particulier, à TVA normale ou en
  // fourniture seule.
  const withSubcontracting = isPro && withPose && isAutoliquidation(taxRegime);
  const decennale = normalizeCompanyInsurance(insurance);
  const decennaleLabel = `${decennale.insurer} n° ${decennale.contractNumber}`;

  const preambule = {
    title: 'Préambule',
    text: joinSentences(
      `Les présentes conditions générales s'appliquent aux ventes de menuiseries (PVC, aluminium, etc.) et prestations réalisées par la société SARANGE (SIRET : ${SIRET_SARANGE}), dont l'ensemble des produits est fabriqué sur mesure.`,
      'La signature du devis emporte acceptation des présentes conditions générales et des conditions particulières du devis.',
      isPro
        ? "Elles prévalent sur tout autre document de l'acheteur professionnel, sauf accord écrit et préalable de SARANGE."
        : "Les dispositions relatives aux contrats conclus à distance ou hors établissement s'appliquent uniquement lorsque le contrat a effectivement été conclu dans l'une de ces conditions. Lorsqu'un contrat est conclu dans les locaux de SARANGE, le consommateur ne bénéficie pas d'un droit légal de rétractation, sauf disposition légale particulière ou engagement exprès de SARANGE."
    ),
  };

  const article1 = {
    title: 'Article 1 - Commande, fabrication sur mesure et annulation',
    text: joinSentences(
      "1.1. Engagement : l'ensemble des produits SARANGE est fabriqué sur mesure selon les dimensions et spécifications validées au devis. La commande est ferme et définitive dès la signature du devis.",
      !isPro && !withPose
        ? "Le droit de rétractation ne peut pas être exercé, lorsque l'exception légale est applicable, pour les produits confectionnés selon les spécifications du consommateur ou nettement personnalisés, conformément à l'article L. 221-28, 3° du Code de la consommation."
        : '',
      !isPro && withPose
        ? "Lorsque le contrat comprenant la fourniture et la pose est conclu à distance ou hors établissement, les règles légales relatives au droit de rétractation s'appliquent dans les conditions prévues par le Code de la consommation."
        : '',
      !isPro
        ? "Pour tout contrat conclu hors établissement, aucun paiement ni aucune contrepartie ne peut être reçu avant l'expiration du délai légal de sept jours à compter de la conclusion du contrat, sauf exception prévue par la loi."
        : '',
      "1.2. Dimensions : si le métré est réalisé par SARANGE, la validation définitive est subordonnée au relevé technique et peut donner lieu à un devis modificatif ou à une annulation sans pénalité en cas d'impossibilité technique. Lorsque les dimensions sont fournies par le client, celui-ci en assume l'entière responsabilité ; en cas d'erreur, toute nouvelle fabrication fera l'objet d'un nouveau devis à sa charge.",
      "1.3. Annulation : après expiration des éventuels droits de rétractation applicables, l'annulation injustifiée de la commande par le client peut donner lieu au paiement des études et prestations déjà réalisées, des produits sur mesure déjà fabriqués, des fournitures irrévocablement commandées, des frais raisonnablement engagés et du préjudice direct et justifié subi par SARANGE, sous déduction des coûts évités du fait de l'annulation. Réciproquement, en cas d'inexécution imputable à SARANGE, le client peut obtenir la restitution des sommes versées correspondant aux prestations non réalisées ainsi que l'indemnisation de son préjudice direct et justifié."
    ),
  };

  const late = isPro
    ? "2.4. Retard de paiement : tout retard de paiement entraîne, à compter du lendemain de la date d'échéance et sans rappel préalable, l'application de pénalités calculées au taux de refinancement de la Banque centrale européenne majoré de dix points, ainsi que l'exigibilité d'une indemnité forfaitaire de 40 € pour frais de recouvrement ; lorsque les frais de recouvrement réellement engagés sont supérieurs, SARANGE peut demander une indemnisation complémentaire sur justificatifs. Le défaut de paiement d'une échéance exigible autorise SARANGE à suspendre l'étape suivante après notification ou mise en demeure lorsque celle-ci est légalement requise ; le calendrier d'exécution est décalé de la durée du retard et du délai raisonnablement nécessaire à la reprogrammation. Pour les marchés privés de travaux entre professionnels concernés, les appels de fonds postérieurs à l'acompte initial correspondent à la valeur des prestations exécutées ou des ouvrages fabriqués auxquels ils se rapportent."
    : "2.4. Retard de paiement : le défaut de paiement d'une échéance exigible autorise SARANGE, après notification ou mise en demeure restée sans effet lorsque celle-ci est légalement requise, à suspendre l'étape suivante (approvisionnement, fabrication, livraison ou pose). Le calendrier d'exécution est alors décalé de la durée du retard de paiement et du délai raisonnablement nécessaire à la reprogrammation.";

  const article2 = {
    title: 'Article 2 - Prix et conditions de paiement',
    text: joinSentences(
      `2.1. Prix : nos prix sont fermes pendant la durée de validité indiquée sur le devis, soit ${getValidityLabel(settings)} à compter de la date d'émission.`,
      buildPaymentLegalParagraph(settings),
      "2.3. Encaissement : un règlement par virement n'est considéré comme effectué qu'après crédit effectif du compte bancaire de SARANGE ; un ordre de virement, un avis d'exécution ou une capture d'écran ne constitue pas un encaissement. Pour un paiement par chèque, le règlement n'est considéré comme encaissé qu'après remise du chèque à SARANGE et sous réserve de son encaissement effectif ; le rejet d'un chèque entraîne le maintien de la créance et l'application des règles prévues en cas d'impayé. Aucun approvisionnement ni lancement en fabrication n'intervient avant encaissement effectif de l'acompte prévu à cet effet ; aucune livraison ni aucune pose n'intervient avant encaissement des échéances déjà exigibles.",
      late
    ),
  };

  const article3 = {
    title: withPose
      ? 'Article 3 - Délais, livraison et force majeure'
      : 'Article 3 - Délais, livraison ou enlèvement',
    text: joinSentences(
      "3.1. Les délais indiqués courent à compter de l'encaissement de l'acompte et de la validation technique des dimensions.",
      withPose
        ? "3.2. La pose est planifiée après fabrication complète des ouvrages et encaissement des échéances exigibles."
        : "3.2. La livraison, l'enlèvement ou la mise à disposition des produits intervient après encaissement des échéances exigibles. Le client contrôle les quantités et l'état des produits à la livraison ou à l'enlèvement et signale immédiatement par écrit tout dommage visible. En cas de retard d'enlèvement imputable au client, un stockage pourra être facturé après information préalable.",
      isPro
        ? "3.3. Les délais sont donnés à titre indicatif ; un retard ne peut justifier à lui seul l'annulation de la commande ni l'octroi de dommages et intérêts."
        : "3.3. En cas de manquement à son obligation d'exécution à la date indiquée, le client consommateur peut résoudre le contrat dans les conditions prévues par l'article L. 216-6 du Code de la consommation.",
      joinSentences(
        "3.4. Force majeure : aucune pénalité ou annulation ne sera recevable si le retard est lié à des causes indépendantes de la volonté de SARANGE, incluant notamment",
        withPose
          ? 'les intempéries empêchant la sécurité ou la conformité de la pose, les défauts des supports,'
          : '',
        "les grèves ou les ruptures d'approvisionnement imprévisibles."
      )
    ),
  };

  const article4 = withPose
    ? {
        title: 'Article 4 - Exécution des travaux de pose',
        text: joinSentences(
          "4.1. Accès : le client assure l'accès au chantier et la libération de la zone de travail.",
          "4.2. Supports : le client met à disposition des supports conformes aux normes en vigueur ; les travaux préparatoires non prévus au devis restent à sa charge. En présence d'un danger, d'un support non conforme ou de risques liés à l'amiante, au plomb ou à des réseaux dissimulés non signalés, les travaux peuvent être suspendus jusqu'à mise en conformité.",
          "4.3. Travaux supplémentaires : toute prestation non prévue au devis fait obligatoirement l'objet d'un avenant accepté avant exécution.",
          "4.4. Achèvement : à l'achèvement de la pose, les éventuelles réserves sont consignées par écrit ; à défaut de réserves écrites, les prestations sont réputées acceptées sans vice apparent.",
          "4.5. Retenue de garantie : conformément à la loi n° 71-584 du 16 juillet 1971 relative à la retenue de garantie en matière de marchés de travaux privés, une retenue de garantie égale à 5% du montant total TTC du devis est prélevée sur le solde en cas de réserves formulées lors de la réception des travaux. Elle est restituée au client dès la levée des réserves constatée par écrit, ou au plus tard un an après la date de réception."
        ),
      }
    : {
        title: 'Article 4 - Pose par le client ou par un tiers',
        text: joinSentences(
          '4.1. Le client valide les dimensions et spécifications avant la mise en fabrication.',
          "4.2. La pose des produits réalisée par le client ou par un tiers relève de leur seule responsabilité. SARANGE ne répond pas des défauts causés par le transport, le stockage, la manutention, la pose ou les réglages réalisés par le client ou un tiers, sauf défaut intrinsèque du produit fourni.",
          "4.3. Les notices et préconisations de mise en œuvre doivent être respectées."
        ),
      };

  const article5 = {
    title: 'Article 5 - Réserve de propriété',
    text: withPose
      ? "Les produits demeurent la propriété de SARANGE jusqu'au paiement intégral du prix en principal, frais et accessoires. Cette réserve est limitée aux produits non encore incorporés au bâtiment ou pouvant être retirés sans dommage ; elle n'emporte pas la dépose automatique des menuiseries incorporées."
      : "Les produits demeurent la propriété de SARANGE jusqu'au paiement intégral du prix en principal, frais et accessoires. En cas de défaut de paiement, leur restitution pourra être exigée aux frais, risques et périls du client.",
  };

  const article6 = {
    title: 'Article 6 - Garanties et service après-vente',
    text: joinSentences(
      isPro
        ? '6.1. Garanties légales : les produits bénéficient de la garantie légale des vices cachés (articles 1641 et suivants du Code civil).'
        : '6.1. Garanties légales : les produits bénéficient de la garantie légale de conformité (articles L. 217-3 et suivants du Code de la consommation) et de la garantie légale des vices cachés (articles 1641 et suivants du Code civil).',
      withPose
        ? `6.2. Garanties des travaux : les travaux d'installation bénéficient des garanties applicables aux travaux du bâtiment : garantie de parfait achèvement (un an), garantie de bon fonctionnement des éléments d'équipement dissociables (deux ans) et garantie décennale (dix ans) pour les désordres compromettant la solidité de l'ouvrage ou le rendant impropre à sa destination. SARANGE est titulaire d'un contrat d'assurance de responsabilité de nature décennale ${decennaleLabel}.`
        : '',
      `6.${withPose ? '3' : '2'}. Garanties fabricant : certains composants bénéficient de garanties propres de leurs fabricants, qui sont transmises au client selon leurs conditions.`,
      `6.${withPose ? '4' : '3'}. Service après-vente : SARANGE assure le suivi après-vente de ses ouvrages pendant dix ans. Ce suivi ne constitue pas une garantie générale et gratuite de réparation ou de remplacement pendant cette durée : SARANGE reçoit et analyse les demandes, détermine la garantie éventuellement applicable et propose, lorsque cela est techniquement possible, une solution de diagnostic, réglage, réparation, remplacement ou fourniture de pièces. Les interventions couvertes par une garantie légale, une garantie applicable aux travaux, une garantie fabricant ou une responsabilité imputable à SARANGE sont traitées selon les conditions de cette garantie ; les interventions non couvertes font l'objet d'un devis préalable pouvant comprendre le déplacement, le diagnostic, la main-d'œuvre, les pièces et les fournitures. SARANGE ne garantit pas la disponibilité pendant dix ans d'une pièce strictement identique : une pièce compatible ou une solution techniquement équivalente pourra être proposée.`,
      `6.${withPose ? '5' : '4'}. Sous réserve des garanties légales obligatoires, ne sont pas nécessairement prises en charge gratuitement : l'usure normale, le défaut d'entretien, les piles, batteries, télécommandes et consommables, les joints et pièces d'usure, les chocs, rayures, effractions ou actes de vandalisme, les interventions ou modifications effectuées par un tiers, les mouvements du bâtiment ou la déformation des supports, les infiltrations étrangères aux ouvrages SARANGE, les surtensions et l'utilisation non conforme.`
    ),
  };

  const consumerName = withPose
    ? "le maître de l'ouvrage, consommateur personne physique,"
    : 'le client consommateur, personne physique,';

  const article7 = isPro
    ? {
        title: 'Article 7 - Règlement des litiges',
        text: joinSentences(
          "En cas de différend, les parties s'efforcent de rechercher une solution amiable avant toute procédure judiciaire.",
          'À défaut de résolution amiable, le litige sera porté devant la juridiction matériellement et territorialement compétente selon les règles de droit commun.'
        ),
      }
    : {
        title: 'Article 7 - Litiges et médiation de la consommation (CM2C)',
        text: joinSentences(
          "Lorsqu'une des parties ne se conforme pas aux conditions du marché, l'autre partie la met en demeure d'y satisfaire par lettre recommandée avec accusé de réception.",
          // Mention officielle CM2C (adhésion SARANGE), adaptée à la troisième
          // personne : coordonnées à reprendre TELLES QUELLES.
          `Conformément aux dispositions du Code de la consommation concernant « le processus de médiation des litiges de la consommation », après avoir sollicité SARANGE et à défaut de réponse le satisfaisant, ${consumerName} a la possibilité de recourir gratuitement à une procédure de médiation de la consommation auprès de : CM2C, 49 rue de Ponthieu, 75008 Paris — Tél. : 01 89 47 00 14 — Site internet : https://www.cm2c.net/declarer-un-litige.php — Mail : litiges@cm2c.net.`,
          "En cas de litige, le consommateur peut saisir l'une des juridictions territorialement compétentes en vertu du Code de procédure civile, ou la juridiction du lieu où il demeurait au moment de la conclusion du contrat ou de la survenance du fait dommageable."
        ),
      };

  const subcontracting = {
    title: 'Dispositions spécifiques à la sous-traitance BTP',
    text: joinSentences(
      "Le client déclare agir en qualité d'entreprise principale et confier à SARANGE l'exécution de tout ou partie de travaux relevant du contrat ou marché conclu avec le maître d'ouvrage.",
      "Le présent devis accepté constitue le contrat de sous-traitance entre SARANGE et l'entreprise principale pour les prestations, prix, délais et conditions de paiement qui y sont définis.",
      "Il ne dispense pas l'entreprise principale de ses obligations résultant de la loi n° 75-1334 du 31 décembre 1975 relative à la sous-traitance.",
      "L'entreprise principale s'engage à faire accepter SARANGE par le maître d'ouvrage et à faire agréer ses conditions de paiement.",
      "Elle s'engage également à mettre en place la garantie de paiement applicable : paiement direct lorsque le régime du marché le prévoit, ou, dans les autres cas, caution personnelle et solidaire ou délégation de paiement conformément aux dispositions légales applicables.",
      "Les travaux immobiliers entrant dans le champ de l'article 283, 2 nonies du Code général des impôts sont facturés sous le régime de l'autoliquidation. La TVA est due par le preneur."
    ),
  };

  return [
    preambule,
    article1,
    article2,
    article3,
    article4,
    article5,
    article6,
    article7,
    ...(withSubcontracting ? [subcontracting] : []),
  ];
};

/**
 * Carte « Garanties et assurances » du devis (première page). Les garanties
 * propres à la pose SARANGE (décennale, parfait achèvement) ne doivent JAMAIS
 * apparaître sur une fourniture seule. L'attestation décennale est construite
 * depuis les paramètres société (plus aucune période codée en dur).
 */
export const getLegalNoticeColumns = (contractType, insurance) => {
  if (contractType === CONTRACT_TYPES.AVEC_POSE) {
    const decennale = normalizeCompanyInsurance(insurance);
    const periodLabel = getInsurancePeriodLabel(decennale);
    const activitiesLabel = decennale.activities
      ? ` (activités couvertes : ${decennale.activities})`
      : '';

    return [
      {
        title: 'Garanties et assurances',
        items: [
          `L'entreprise d'assurance ${decennale.insurer} atteste que SARANGE est titulaire d'un contrat d'assurance de responsabilité de nature décennale n° ${decennale.contractNumber}${periodLabel ? ` pour la période ${periodLabel}` : ''}${activitiesLabel}.`,
          "La garantie de parfait achèvement, pendant un délai d'un an à compter de la réception, s'étend à la réparation de tous désordres signalés au procès-verbal ou notifiés par écrit après réception.",
        ],
      },
    ];
  }

  return [
    {
      title: 'Garanties',
      items: [
        'Les produits fournis bénéficient des garanties légales applicables et, le cas échéant, des garanties propres de leurs fabricants.',
        'SARANGE assure le suivi après-vente de ses ouvrages pendant dix ans, dans les conditions précisées aux CGV.',
      ],
    },
  ];
};

/* ─── Snapshot de figement ───────────────────────────────────────────────── */

const normalizeText = (value) => (typeof value === 'string' ? value : '');

const normalizeSnapshotSections = (sections) =>
  (Array.isArray(sections) ? sections : [])
    .map((section) => ({
      title: normalizeText(section?.title),
      text: normalizeText(section?.text),
    }))
    .filter((section) => section.title || section.text);

const normalizeSnapshotStrings = (values) =>
  (Array.isArray(values) ? values : [])
    .map((value) => normalizeText(value))
    .filter(Boolean);

const normalizeSnapshotNotices = (columns) =>
  (Array.isArray(columns) ? columns : [])
    .map((column) => ({
      title: normalizeText(column?.title),
      items: normalizeSnapshotStrings(column?.items),
    }))
    .filter((column) => column.title || column.items.length > 0);

export const normalizeCgvSnapshotEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;

  const normalized = {
    variantId: normalizeText(entry.variantId) || 'mono',
    contractType:
      entry.contractType === CONTRACT_TYPES.AVEC_POSE
        ? CONTRACT_TYPES.AVEC_POSE
        : CONTRACT_TYPES.FOURNITURE_SEULE,
    taxRegime: normalizeTaxRegime(entry.taxRegime),
    paymentMode: normalizeText(entry.paymentMode),
    sections: normalizeSnapshotSections(entry.sections),
    paymentTerms: normalizeSnapshotStrings(entry.paymentTerms),
    legalNotices: normalizeSnapshotNotices(entry.legalNotices),
  };

  return normalized.sections.length > 0 ? normalized : null;
};

export const normalizeCgvSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') return null;

  const entries = (Array.isArray(snapshot.entries) ? snapshot.entries : [])
    .map((entry) => normalizeCgvSnapshotEntry(entry))
    .filter(Boolean);

  if (!entries.length) return null;

  return {
    version: normalizeText(snapshot.version) || CGV_VERSION,
    generatedAt: normalizeText(snapshot.generatedAt),
    clientType: normalizeClientType(snapshot.clientType),
    entries,
  };
};

/**
 * Retrouve l'entrée de snapshot applicable à une variante donnée (ou l'unique
 * entrée d'un devis mono-option lorsque variantId n'est pas fourni).
 */
export const matchCgvSnapshotEntry = (snapshot, variantId = '') => {
  const normalized = normalizeCgvSnapshot(snapshot);
  if (!normalized) return null;

  const wanted = normalizeText(variantId);
  if (wanted) {
    const match = normalized.entries.find((entry) => entry.variantId === wanted);
    if (match) return match;
  }

  return normalized.entries.length === 1 ? normalized.entries[0] : null;
};

/**
 * Un devis n'ouvre droit à la retenue de garantie du bon de fin de chantier
 * (lib/completion-certificate.mjs) que si SES CGV figées au moment de sa
 * signature contenaient déjà la clause (article 4.5, ajoutée en 2026.08.1).
 * On inspecte le TEXTE figé plutôt que de comparer des numéros de version :
 * un devis signé avant cet ajout n'a jamais eu cette clause sous les yeux du
 * client, quelle que soit la version nominale enregistrée sur son snapshot.
 */
export const cgvSnapshotEntryHasRetentionClause = (cgvSnapshotEntry) => {
  const article4 = (cgvSnapshotEntry?.sections || []).find((section) =>
    /^Article 4\b/.test(section?.title || '')
  );
  return typeof article4?.text === 'string' && article4.text.includes('Retenue de garantie');
};

/**
 * Construit le snapshot à figer dans le payload du devis au moment de sa
 * finalisation (génération PDF) ou de son envoi en signature.
 * `entries` : [{ variantId, contractType, quoteSettings }] — une entrée par
 * variante (une seule pour un devis mono-option, variantId 'mono').
 * Retourne null si le type de client n'a pas été explicitement choisi
 * (aucun figement possible tant que le devis est bloqué).
 */
export const buildCgvSnapshot = ({ clientType, generatedAt, entries, insurance } = {}) => {
  if (!isKnownClientType(clientType)) return null;

  const normalizedClientType = normalizeClientType(clientType);

  const snapshotEntries = (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const settings = normalizeQuoteSettings(entry?.quoteSettings);
      const contractType =
        entry?.contractType === CONTRACT_TYPES.AVEC_POSE
          ? CONTRACT_TYPES.AVEC_POSE
          : CONTRACT_TYPES.FOURNITURE_SEULE;
      const taxRegime = normalizeTaxRegime(entry?.taxRegime);

      return {
        variantId: normalizeText(entry?.variantId) || 'mono',
        contractType,
        taxRegime,
        paymentMode: settings.paymentMode,
        sections: buildCgvSections({
          clientType: normalizedClientType,
          contractType,
          quoteSettings: settings,
          insurance,
          taxRegime,
        }),
        paymentTerms: buildPaymentTermsForPdf(settings),
        legalNotices: getLegalNoticeColumns(contractType, insurance),
      };
    })
    .filter(Boolean);

  if (!snapshotEntries.length) return null;

  return {
    version: CGV_VERSION,
    generatedAt: normalizeText(generatedAt),
    clientType: normalizedClientType,
    entries: snapshotEntries,
  };
};
