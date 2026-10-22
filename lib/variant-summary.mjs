/**
 * variant-summary.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Colonne « Ce qui change » de la page comparative des variantes : texte saisi
 * sur la variante (`summary`) s'il existe, sinon un résumé AUTOMATIQUE des
 * différences avec la première variante (la référence). Les lignes d'une
 * variante dupliquée gardent leur identifiant : on compare poste par poste.
 *
 * Différences retenues, dans l'ordre, sans doublon, au plus 4 :
 * produit remplacé, matériau, coloris, vitrage, volet monobloc (ajouté,
 * retiré, manœuvre), petits bois, poste ajouté ou retiré, pose.
 * Module pur (aucun import).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const VARIANT_SUMMARY_MAX_LENGTH = 240;
const MAX_PHRASES = 4;

const MANOEUVRE_LABELS = Object.freeze({
  manuel: 'manuel',
  filaire: 'filaire',
  radio: 'radio',
  solaire: 'solaire',
});

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const productName = (item) => clean(item?.productLabel || item?.customLabel || item?.sheetName);

const materialOf = (item) => {
  if (item?.material === 'alu' || /-alu$/i.test(String(item?.productId || ''))) return 'alu';
  if (item?.material === 'pvc') return 'pvc';
  return '';
};

const colorOf = (item) => clean(item?.marketingFinition || item?.colorOption?.label);
const glazingOf = (item) => clean(item?.glazingOption?.label);
const petitsBoisOf = (item) =>
  Number(item?.petitsBoisH) > 0 || Number(item?.petitsBoisV) > 0 || Number(item?.petitsBois) > 0;

const voletOf = (item) =>
  item?.voletMonobloc ? MANOEUVRE_LABELS[item.voletMonoblocManoeuvre] || 'manuel' : '';

/** Différences d'un poste par rapport au même poste de la référence. */
const itemDifferences = (reference, item) => {
  const phrases = [];
  if (productName(item) !== productName(reference)) phrases.push(productName(item));

  const material = materialOf(item);
  if (material && material !== materialOf(reference)) phrases.push(material === 'alu' ? 'Aluminium' : 'PVC');

  const color = colorOf(item);
  if (color && color !== colorOf(reference)) phrases.push(`Coloris ${color}`);

  const glazing = glazingOf(item);
  if (glazing && glazing !== glazingOf(reference)) phrases.push(`Vitrage ${glazing}`);

  const volet = voletOf(item);
  const referenceVolet = voletOf(reference);
  if (volet && !referenceVolet) phrases.push(`Volet roulant monobloc ${volet}`);
  else if (!volet && referenceVolet) phrases.push('Sans volet roulant');
  else if (volet && volet !== referenceVolet) phrases.push(`Volet ${volet}`);

  if (petitsBoisOf(item) && !petitsBoisOf(reference)) phrases.push('Petits bois');
  else if (!petitsBoisOf(item) && petitsBoisOf(reference)) phrases.push('Sans petits bois');

  if (item?.includePose && !reference?.includePose) phrases.push('Avec pose');
  else if (!item?.includePose && reference?.includePose) phrases.push('Sans pose');

  return phrases;
};

/**
 * Résumé automatique d'une variante face à la référence ; la référence
 * elle-même est la « Configuration de base ».
 */
export const buildAutoVariantSummary = (variant, referenceVariant) => {
  if (!variant || !referenceVariant || variant.id === referenceVariant.id) return 'Configuration de base';
  const items = Array.isArray(variant.cartItems) ? variant.cartItems : [];
  const referenceItems = Array.isArray(referenceVariant.cartItems) ? referenceVariant.cartItems : [];
  const referenceById = new Map(referenceItems.filter((item) => item?.id).map((item) => [item.id, item]));
  const ids = new Set(items.map((item) => item?.id));

  const phrases = [];
  items.forEach((item) => {
    const reference = item?.id ? referenceById.get(item.id) : null;
    if (reference) phrases.push(...itemDifferences(reference, item));
    else if (productName(item)) phrases.push(`+ ${productName(item)}`);
  });
  referenceItems.forEach((item) => {
    if (item?.id && !ids.has(item.id) && productName(item)) phrases.push(`Sans ${productName(item)}`);
  });

  const unique = [...new Set(phrases.filter(Boolean))];
  if (!unique.length) return 'Même configuration, conditions différentes';
  const shown = unique.slice(0, MAX_PHRASES).join(' · ');
  return unique.length > MAX_PHRASES ? `${shown}…` : shown;
};

/** Texte saisi sur la variante : nettoyé et borné ; vide = automatique. */
export const normalizeVariantSummary = (value) => clean(value).slice(0, VARIANT_SUMMARY_MAX_LENGTH);

/** Texte de la colonne « Ce qui change » : saisi, sinon automatique. */
export const resolveVariantSummary = (variant, referenceVariant) =>
  normalizeVariantSummary(variant?.summary) || buildAutoVariantSummary(variant, referenceVariant);
