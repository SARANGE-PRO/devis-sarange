/**
 * box-suggestion.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Box domotique proposée en option (vente additionnelle) quand le devis
 * comporte des volets roulants radio ou solaires, seuls ou monoblocs :
 *  - volets radio    → box CHERUBINI METAHome ;
 *  - volets solaires → box GAPOSA RollAppX.
 * UNE seule ligne discrète par devis et par type de volet, sous le premier
 * volet concerné, sur le modèle de « En option (non inclus) : oscillo-battant… ».
 * Rien si la box correspondante est déjà au devis ; rien pour les volets
 * filaires ou manuels (pas de pilotage par box). Le prix affiché porte la
 * même remise que le volet sous lequel la box est proposée.
 *
 * Ajoutée au RENDU (récap + PDF) seulement, jamais enregistrée ni exportée.
 * Module pur : les variantes de box sont passées par l'appelant.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const BOX_PRODUCT_ID = 'volet-box-domotique';

export const BOX_VARIANT_BY_MANOEUVRE = Object.freeze({
  radio: 'box_domotique_cherubini_metahome',
  solaire: 'box_domotique_gaposa_rollappx',
});

const BOX_SHORT_TEXT = Object.freeze({
  radio: 'pilotage des volets depuis le téléphone, compatible Alexa et Google',
  solaire: 'pilotage des volets depuis le téléphone, compatible Alexa et Google',
});

/** Manœuvre pilotable par box d'un poste (« radio », « solaire ») ou ''. */
export const getBoxManoeuvre = (item) => {
  if (!item) return '';
  const id = String(item.productId || '');
  if (id === 'volet-radio') return 'radio';
  if (id === 'volet-solaire') return 'solaire';
  if (item.voletMonobloc && (item.voletMonoblocManoeuvre === 'radio' || item.voletMonoblocManoeuvre === 'solaire')) {
    return item.voletMonoblocManoeuvre;
  }
  return '';
};

/**
 * Lignes à afficher, par identifiant de poste : Map(itemId → texte). Une box
 * par type de volet présent, sous le premier poste concerné.
 * @param {object[]} items  postes du devis
 * @param {object[]} variants  variantes de box ({ id, label, priceHt })
 * @param {(n: number) => string} formatPrice
 */
export const getBoxSuggestionLines = (items, variants, formatPrice) => {
  const lines = new Map();
  const list = Array.isArray(items) ? items : [];
  const byId = new Map((Array.isArray(variants) ? variants : []).map((variant) => [variant.id, variant]));
  const alreadyQuoted = new Set(
    list.filter((item) => item?.productId === BOX_PRODUCT_ID).map((item) => item.productVariantId).filter(Boolean)
  );

  for (const manoeuvre of ['radio', 'solaire']) {
    const variant = byId.get(BOX_VARIANT_BY_MANOEUVRE[manoeuvre]);
    if (!variant || alreadyQuoted.has(variant.id)) continue;
    const first = list.find((item) => getBoxManoeuvre(item) === manoeuvre && item?.id);
    if (!first) continue;
    const name = String(variant.label || '').replace(/^Box domotique\s*/i, '');
    // Même remise que le volet sous lequel la box est proposée.
    const remise = Number(first.remise) > 0 && Number(first.remise) < 100 ? Number(first.remise) : 0;
    const net = Math.round(Number(variant.priceHt) * (1 - remise / 100) * 100) / 100;
    const price = net > 0 ? ` +${formatPrice(net)} HT` : '';
    const line = `En option (non inclus) : box domotique ${name}, ${BOX_SHORT_TEXT[manoeuvre]}${price}`;
    lines.set(first.id, lines.has(first.id) ? `${lines.get(first.id)}\n${line}` : line);
  }
  return lines;
};
