/**
 * vat-window-eligibility.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Conformité technique Uw/Sw des menuiseries pour la TVA à 5,5 % (rénovation
 * énergétique). Distinct de vat-verification.mjs (numéro de TVA intra) et de
 * tax-regime.mjs (autoliquidation BTP) : ce module vérifie que la PERFORMANCE
 * THERMIQUE du produit posé justifie bien le taux réduit.
 *
 * Base légale (vérifiée le 04/08/2026 par citation directe Légifrance) :
 *  - Taux : art. 278-0 bis A du CGI.
 *  - Seuils techniques : art. 30-0 D bis de l'annexe IV du CGI (issu de
 *    l'arrêté du 4 décembre 2024, en vigueur depuis le 01/01/2025).
 *
 * ⚠️ RECODIFICATION EN COURS : l'ordonnance n° 2025-1247 du 17/12/2025 bascule
 * toute la TVA du CGI vers le Code des impositions sur les biens et services
 * (CIBS). Le Livre II (TVA) du CIBS entre en vigueur le 01/09/2026. Annoncé "à
 * droit constant" (mêmes taux, mêmes seuils), mais les numéros d'article vont
 * changer. Les références légales ci-dessous sont donc VOLONTAIREMENT isolées
 * dans ce module (pas dispersées dans le reste du code) pour pouvoir être
 * mises à jour en un seul endroit dès que la DGFiP publiera la table de
 * concordance CIBS. Les valeurs numériques elles-mêmes ne devraient pas
 * changer (codification à droit constant).
 *
 * La responsabilité de la conformité technique (Uw/Sw réels du produit posé)
 * reste celle du professionnel, même si le client certifie par ailleurs sur
 * le devis les conditions qu'il est en mesure de connaître (ancienneté du
 * logement, usage d'habitation — voir components/QuoteSummary.jsx). Ce module
 * ne remplace jamais une fiche technique fabricant en cas de doute réel.
 *
 * Module pur (aucun import) : testable par le runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const REDUCED_VAT_RATE = 5.5;
export const FALLBACK_VAT_RATE = 10;

export const VAT_LINE_CATEGORIES = Object.freeze({
  // Fenêtre, porte-fenêtre, coulissant, baie vitrée, composite assemblé.
  WINDOW: 'WINDOW',
  // Fenêtre de toit Velux (configurateur dédié, hors grille catalogue).
  ROOF_WINDOW_VELUX: 'ROOF_WINDOW_VELUX',
  // Porte d'entrée (RENO/NEUF) : critère Ud, jamais calculé automatiquement.
  ENTRY_DOOR: 'ENTRY_DOOR',
  // Hors périmètre de l'art. 30-0 D bis : volets, services, lignes libres...
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

export const VAT_ELIGIBILITY_STATUS = Object.freeze({
  ELIGIBLE: 'ELIGIBLE',
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  // Catégorie concernée par l'article, mais donnée Uw/Sw/Ud manquante ou non
  // fiable : on ne peut PAS conclure à la conformité, donc jamais assimilé à
  // ELIGIBLE.
  NOT_VERIFIABLE: 'NOT_VERIFIABLE',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

// Sheets qui ne relèvent PAS de la famille "fenêtre/porte-fenêtre" au sens de
// cet article (même liste d'exclusion que lib/glazing.js#isGlazedProduct,
// dupliquée ici à dessein : ce module n'importe rien, pour rester testable en
// isolation comme line-nature.mjs).
const NON_WINDOW_SHEET_PREFIXES = ['Volet', 'Porte Entr', 'Gestion D'];

const isWindowFamilySheet = (sheetName) =>
  typeof sheetName === 'string' &&
  sheetName.trim().length > 0 &&
  sheetName !== 'Custom' &&
  !NON_WINDOW_SHEET_PREFIXES.some((prefix) => sheetName.startsWith(prefix));

/**
 * Catégorie d'une ligne de devis au regard de cet article de loi.
 * `item.veluxRange` et `item.manualUd` sont posés par ProductSelector.jsx.
 */
export const classifyVatLine = (item = {}) => {
  if (item?.veluxRange) return VAT_LINE_CATEGORIES.ROOF_WINDOW_VELUX;
  if (typeof item?.sheetName === 'string' && item.sheetName.startsWith('Porte Entr')) {
    return VAT_LINE_CATEGORIES.ENTRY_DOOR;
  }
  if (isWindowFamilySheet(item?.sheetName)) return VAT_LINE_CATEGORIES.WINDOW;
  return VAT_LINE_CATEGORIES.NOT_APPLICABLE;
};

/**
 * Fenêtres ou portes-fenêtres complètes (art. 30-0 D bis, I) : deux couples
 * alternatifs Uw/Sw, l'un OU l'autre suffit.
 *   "coefficient de transmission thermique inférieur ou égal à 1,3 watt par
 *   mètre carré-kelvin et un facteur de transmission solaire supérieur ou
 *   égal à 0,3" OU "... inférieur ou égal à 1,7 ... supérieur ou égal à 0,36"
 * (citation vérifiée directement sur Légifrance, art. 30-0 D bis).
 */
export const WINDOW_RULE = Object.freeze({
  label: 'Fenêtre ou porte-fenêtre complète (art. 30-0 D bis, I, annexe IV CGI)',
  tiers: [
    { maxUw: 1.3, minSw: 0.3 },
    { maxUw: 1.7, minSw: 0.36 },
  ],
});

export const isWindowUwSwCompliant = (uw, sw) =>
  Number.isFinite(uw) &&
  Number.isFinite(sw) &&
  WINDOW_RULE.tiers.some((tier) => uw <= tier.maxUw && sw >= tier.minSw);

/**
 * Fenêtres de toiture (art. 30-0 D bis, I) : le plafond de Sw (et non un
 * plancher, contrairement aux fenêtres verticales) évite la surchauffe d'été
 * sous rampant. "... inférieur ou égal à 1,5 ... et un facteur de
 * transmission solaire inférieur ou égal à 0,36" (citation vérifiée
 * Légifrance).
 */
export const ROOF_WINDOW_RULE = Object.freeze({
  label: 'Fenêtre de toiture (art. 30-0 D bis, I, annexe IV CGI)',
  maxUw: 1.5,
  maxSw: 0.36,
});

export const isRoofWindowUwSwCompliant = (uw, sw) =>
  Number.isFinite(uw) && Number.isFinite(sw) && uw <= ROOF_WINDOW_RULE.maxUw && sw <= ROOF_WINDOW_RULE.maxSw;

/**
 * Portes d'entrée donnant sur l'extérieur (art. 30-0 D bis, I) : critère Ud
 * seul, pas de facteur solaire. Confiance MOYENNE (une seule source
 * indépendante lors de la vérification du 04/08/2026, non recoupée par
 * citation Légifrance directe) — à confirmer avant un usage à fort enjeu.
 *
 * Ce seuil n'est JAMAIS appliqué automatiquement : lib/products.js ne modélise
 * aucun système de porte dédié (contrairement à FRAME_SYSTEMS pour les
 * fenêtres — voir lib/glazing.js) et data/pricing.json ne référence aucune
 * marque/modèle pour "Porte Entrée RENO/NEUF" (grille de prix générique). Le
 * Uw calculé par ailleurs pour une porte vitrée réutilise donc un profilé de
 * FENÊTRE (Uf Schüco) qui n'est pas représentatif d'une porte réelle. Seule
 * une saisie manuelle de l'Ud déclaré par le fabricant (fiche DoP / marquage
 * CE de la porte réellement posée) permet de vérifier ce critère.
 */
export const DOOR_RULE = Object.freeze({
  label: "Porte d'entrée donnant sur l'extérieur (art. 30-0 D bis, I, annexe IV CGI) — confiance moyenne",
  maxUd: 1.7,
});

export const isDoorUdCompliant = (ud) => Number.isFinite(ud) && ud <= DOOR_RULE.maxUd;

/**
 * Fenêtres de toit Velux : GGL/GGU (rotation) et GPL/GPU (projection),
 * gammes de vitrage "Standard" / "Confort" / "Tout Confort" — ce sont les
 * noms COMMERCIAUX OFFICIELS Velux (codes vitrage --54 / --76 / --57), pas
 * une approximation Sarange. Valeurs prises au cas le PLUS DÉFAVORABLE
 * publié (pose standard sans isolant périphérique BDX) par prudence : si ce
 * cas défavorable passe le seuil légal, la fenêtre passe dans tous les cas
 * de pose.
 *
 * Sources (vérifiées le 04/08/2026) :
 *  - Tarif-catalogue professionnel Velux France, daté du 03/02/2026 (Uw et Sw
 *    explicites pour Confort et Tout Confort — confiance haute).
 *  - Fiches techniques DTA CSTB GGL/GPL/GPU (2016) et catalogue GGU (2012)
 *    pour recoupement Ug/g/Sw.
 *
 * Limites connues (voir analyse complète transmise à l'utilisateur) :
 *  - Sw de la gamme "Standard" : confiance MOYENNE (dérivé d'une fiche 2012 +
 *    g EN 410 2016, pas retrouvé sur le tarif 2026 lui-même — mais l'écart
 *    au seuil légal est large, la conclusion qualitative "non éligible" est
 *    robuste même si la valeur exacte doit être rafraîchie).
 *  - Sw de GPL/GPU : déduit par analogie avec GGL/GGU (même composant
 *    vitrage pour un même code gamme), non confirmé indépendamment.
 *  - Aucune variation par taille de fenêtre trouvée (Velux publie une valeur
 *    déclarative par gamme, pas par code dimensionnel).
 */
export const VELUX_GLAZING_THERMAL = Object.freeze({
  standard: Object.freeze({ label: 'Standard (vitrage --54)', uw: 1.4, sw: 0.39, confidence: 'haute (Uw) / moyenne (Sw)' }),
  confort: Object.freeze({ label: 'Confort (vitrage --76)', uw: 1.3, sw: 0.23, confidence: 'haute' }),
  'tout-confort': Object.freeze({ label: 'Tout Confort (vitrage --57)', uw: 1.3, sw: 0.22, confidence: 'haute' }),
});

const buildEvaluation = (status, category, extra = {}) => ({
  status,
  category,
  uw: null,
  sw: null,
  ud: null,
  rule: null,
  message: '',
  ...extra,
});

/**
 * Évalue si une ligne de devis remplit les conditions TECHNIQUES (Uw/Sw/Ud)
 * du taux de 5,5 %. Ne dit rien des conditions non techniques (ancienneté du
 * logement, usage d'habitation...), déjà couvertes par la certification du
 * devis (components/QuoteSummary.jsx).
 *
 * @param {object} item ligne de panier (cartItem)
 * @returns {{status:string, category:string, uw:?number, sw:?number, ud:?number, rule:?object, message:string}}
 */
export const evaluateReducedVatEligibility = (item = {}) => {
  const category = classifyVatLine(item);

  if (category === VAT_LINE_CATEGORIES.NOT_APPLICABLE) {
    return buildEvaluation(VAT_ELIGIBILITY_STATUS.NOT_APPLICABLE, category, {
      message:
        "Ligne hors du périmètre \"fenêtres/portes-fenêtres\" de l'art. 30-0 D bis : le taux sélectionné s'applique sans contrôle Uw/Sw.",
    });
  }

  if (category === VAT_LINE_CATEGORIES.ROOF_WINDOW_VELUX) {
    const thermal = VELUX_GLAZING_THERMAL[item.veluxRange];

    if (!thermal) {
      return buildEvaluation(VAT_ELIGIBILITY_STATUS.NOT_VERIFIABLE, category, {
        rule: ROOF_WINDOW_RULE,
        message: `Gamme de vitrage Velux "${item.veluxRange}" inconnue : performance thermique non vérifiable.`,
      });
    }

    const eligible = isRoofWindowUwSwCompliant(thermal.uw, thermal.sw);
    return buildEvaluation(
      eligible ? VAT_ELIGIBILITY_STATUS.ELIGIBLE : VAT_ELIGIBILITY_STATUS.NOT_ELIGIBLE,
      category,
      {
        uw: thermal.uw,
        sw: thermal.sw,
        rule: ROOF_WINDOW_RULE,
        message: eligible
          ? `Velux ${thermal.label} : Uw=${thermal.uw} / Sw=${thermal.sw}, conforme au seuil fenêtre de toit (Uw ≤ ${ROOF_WINDOW_RULE.maxUw} et Sw ≤ ${ROOF_WINDOW_RULE.maxSw}).`
          : `Velux ${thermal.label} : Uw=${thermal.uw} / Sw=${thermal.sw}, NE respecte PAS le seuil fenêtre de toit (Uw ≤ ${ROOF_WINDOW_RULE.maxUw} et Sw ≤ ${ROOF_WINDOW_RULE.maxSw}).`,
      }
    );
  }

  if (category === VAT_LINE_CATEGORIES.ENTRY_DOOR) {
    const ud = Number.isFinite(item.manualUd) ? item.manualUd : null;

    if (ud === null) {
      return buildEvaluation(VAT_ELIGIBILITY_STATUS.NOT_VERIFIABLE, category, {
        rule: DOOR_RULE,
        message:
          "Coefficient Ud non renseigné pour cette porte : saisissez la valeur déclarée par le fabricant (fiche DoP/marquage CE) pour vérifier l'éligibilité au taux de 5,5 %.",
      });
    }

    const eligible = isDoorUdCompliant(ud);
    return buildEvaluation(
      eligible ? VAT_ELIGIBILITY_STATUS.ELIGIBLE : VAT_ELIGIBILITY_STATUS.NOT_ELIGIBLE,
      category,
      {
        ud,
        rule: DOOR_RULE,
        message: eligible
          ? `Porte : Ud=${ud}, conforme au seuil (Ud ≤ ${DOOR_RULE.maxUd}).`
          : `Porte : Ud=${ud}, NE respecte PAS le seuil (Ud ≤ ${DOOR_RULE.maxUd}).`,
      }
    );
  }

  // WINDOW : fenêtre, porte-fenêtre, coulissant, baie, composite assemblé.
  const uw = Number.isFinite(item.thermalUw) ? item.thermalUw : null;
  const sw = Number.isFinite(item.thermalSw) ? item.thermalSw : null;

  if (uw === null || sw === null) {
    return buildEvaluation(VAT_ELIGIBILITY_STATUS.NOT_VERIFIABLE, category, {
      rule: WINDOW_RULE,
      message:
        'Coefficients Uw/Sw non calculables pour cette configuration (vitrage sans données thermiques disponibles) : performance non vérifiable.',
    });
  }

  const eligible = isWindowUwSwCompliant(uw, sw);
  return buildEvaluation(
    eligible ? VAT_ELIGIBILITY_STATUS.ELIGIBLE : VAT_ELIGIBILITY_STATUS.NOT_ELIGIBLE,
    category,
    {
      uw,
      sw,
      rule: WINDOW_RULE,
      message: eligible
        ? `Uw=${uw} / Sw=${sw}, conforme à l'un des seuils fenêtre (Uw ≤ 1,3 et Sw ≥ 0,3, ou Uw ≤ 1,7 et Sw ≥ 0,36).`
        : `Uw=${uw} / Sw=${sw}, NE respecte AUCUN des seuils fenêtre (Uw ≤ 1,3 et Sw ≥ 0,3, ou Uw ≤ 1,7 et Sw ≥ 0,36).`,
    }
  );
};

/**
 * Taux de TVA EFFECTIF d'une ligne, après contrôle de conformité technique.
 *
 * Ne s'applique QUE lorsque le taux demandé est 5,5 % (les autres taux ne
 * dépendent pas d'un critère Uw/Sw et ne sont jamais retouchés ici). Si la
 * ligne ne respecte pas le seuil légal — ou si sa conformité n'est pas
 * vérifiable (donnée manquante) — le taux est automatiquement ramené à 10 %
 * (rénovation, hors condition de performance énergétique) : jamais de facture
 * à 5,5 % non couverte par les seuils Uw/Sw/Ud.
 *
 * @param {object} item ligne de panier
 * @param {number} nominalRate taux demandé pour cette ligne (déjà normalisé)
 * @returns {{rate:number, requestedRate:number, wasCorrected:boolean, evaluation:?object}}
 */
/**
 * Interrupteur du contrôle des seuils, réglé dans /parametres et DÉSACTIVÉ
 * PAR DÉFAUT. Injecté plutôt qu'importé : ce module doit rester pur (aucun
 * accès au navigateur) pour rester testable par le runner Node.
 * `null` = non renseigné → on retombe sur le réglage du poste.
 */
let thresholdCheckResolver = null;

export const setVatThresholdCheckResolver = (resolver) => {
  thresholdCheckResolver = typeof resolver === 'function' ? resolver : null;
};

const isThresholdCheckEnabled = () => (thresholdCheckResolver ? thresholdCheckResolver() === true : false);

export const resolveEffectiveTvaRate = (item, nominalRate) => {
  if (Number(nominalRate) !== REDUCED_VAT_RATE) {
    return { rate: nominalRate, requestedRate: nominalRate, wasCorrected: false, evaluation: null };
  }

  // Contrôle désactivé : le taux saisi est respecté tel quel. L'évaluation
  // reste calculée et renvoyée, pour continuer à informer l'utilisateur sans
  // jamais requalifier le devis à sa place.
  if (!isThresholdCheckEnabled()) {
    return {
      rate: REDUCED_VAT_RATE,
      requestedRate: REDUCED_VAT_RATE,
      wasCorrected: false,
      checkDisabled: true,
      evaluation: evaluateReducedVatEligibility(item),
    };
  }

  const evaluation = evaluateReducedVatEligibility(item);
  const staysAtReducedRate =
    evaluation.status === VAT_ELIGIBILITY_STATUS.ELIGIBLE ||
    evaluation.status === VAT_ELIGIBILITY_STATUS.NOT_APPLICABLE;

  if (staysAtReducedRate) {
    return { rate: REDUCED_VAT_RATE, requestedRate: REDUCED_VAT_RATE, wasCorrected: false, evaluation };
  }

  return {
    rate: FALLBACK_VAT_RATE,
    requestedRate: REDUCED_VAT_RATE,
    wasCorrected: true,
    evaluation,
  };
};
