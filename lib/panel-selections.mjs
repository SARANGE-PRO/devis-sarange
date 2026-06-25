// Sélections de panneaux décoratifs d'un devis : une entrée par porte « panneau
// décoratif », avec le LIBELLÉ DE COULEUR EXACT du devis (intérieur/extérieur), pour
// que le sélecteur impose la bonne couleur (et non un générique « Bicoloration »).
//
// Module PUR (aucune dépendance) : importé côté serveur (calcul à l'envoi, par devis et
// PAR VARIANTE) ET côté client (HomePageClient) pour transmettre les sélections de
// chaque variante. La couleur vient de `item.marketingFinition`, déjà calculée et fidèle
// (ex. « Bicoloration : Blanc interieur / Gris 7016 exterieur »).

const cleanText = (value) => String(value ?? '').trim();

// Couleur lisible à imposer au sélecteur (affichée telle quelle dans l'outil).
const resolveColorLabel = (item) => {
  // 1) Finition marketing (source la plus fidèle : contient les coloris int/ext réels).
  const finition = cleanText(item?.marketingFinition).replace(/^Finition\s*:\s*/i, '').trim();
  if (finition) return finition;
  // 2) Repli : libellé de l'option de couleur, puis « Blanc » par défaut.
  const optionLabel = cleanText(item?.colorOption?.label) || cleanText(item?.colorOptionLabel);
  if (optionLabel && !/^(pvc\s+)?blanc$/i.test(optionLabel)) return optionLabel;
  return 'Blanc';
};

export const buildPanelSelections = (cartItems) => {
  const items = Array.isArray(cartItems) ? cartItems : [];
  const selections = [];
  items.forEach((item, index) => {
    const isDeco =
      item?.panneauDecoratif === true || item?.options?.panneauDecoratif === true;
    if (!isDeco) return;
    selections.push({
      lineId: cleanText(item?.id) || cleanText(item?.leafId) || `porte-${index + 1}`,
      productLabel:
        cleanText(item?.productLabel) || cleanText(item?.sheetName) || "Porte d'entrée",
      repere: cleanText(item?.repere),
      widthMm: Number(item?.widthMm) || null,
      heightMm: Number(item?.heightMm) || null,
      colorId: cleanText(item?.colorOption?.id) || cleanText(item?.colorOptionId),
      colorLabel: resolveColorLabel(item),
    });
  });
  return selections;
};
