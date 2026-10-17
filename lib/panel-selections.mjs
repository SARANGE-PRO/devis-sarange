// Sélections de panneaux décoratifs d'un devis : une entrée par porte « panneau
// décoratif », avec le LIBELLÉ DE COULEUR EXACT du devis (intérieur/extérieur), pour
// que le sélecteur impose la bonne couleur (et non un générique « Bicoloration »).
//
// Importé côté serveur (calcul à l'envoi, par devis et PAR VARIANTE) ET côté client
// (HomePageClient). L'énumération des portes déco — y compris celles imbriquées dans un
// châssis composé — est déléguée à `getItemDecoDoors` (lib/products) pour garantir des
// `lineId` identiques à ceux posés dans le PDF (ligne + ancre de tampon). La couleur vient
// de `item.marketingFinition` (ex. « Bicoloration : Blanc interieur / Gris 7016 exterieur »)
// ou, pour une porte de composé, de la coloration du module.

import { getItemDecoDoors } from '@/lib/products';

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

// Choix pré-rempli, à la forme des choix de la page de signature ; aucune
// valeur `undefined` (la sélection est écrite telle quelle dans Firestore).
const presetOf = (choice) => {
  if (!choice || typeof choice !== 'object') return null;
  const image = cleanText(choice.image);
  const preset = {
    gamme: cleanText(choice.gamme),
    panelName: cleanText(choice.panelName),
    panelRef: cleanText(choice.panelRef),
    image: /^[A-Za-z0-9_-]+\.(jpe?g|png)$/i.test(image) ? image : '',
    croisillon: cleanText(choice.croisillon),
    couleur: cleanText(choice.couleur),
    legendeVitrage: cleanText(choice.legendeVitrage),
    plusValueTotaleHT: Number(choice.plusValueTotaleHT) || 0,
  };
  return preset.panelName || preset.panelRef ? preset : null;
};

export const buildPanelSelections = (cartItems) => {
  const items = Array.isArray(cartItems) ? cartItems : [];
  const selections = [];
  items.forEach((item, index) => {
    getItemDecoDoors(item).forEach((door, doorIndex) => {
      selections.push({
        lineId:
          cleanText(door?.lineId) || `porte-${index + 1}-${doorIndex + 1}`,
        // On masque la distinction Réno / Neuf (utile uniquement au configurateur).
        productLabel:
          (cleanText(door?.productLabel) || "Porte d'entrée")
            .replace(/\s*[–-]?\s*(rénovation|renovation|réno|reno|neuf)\s*$/i, '')
            .trim() || "Porte d'entrée",
        repere: cleanText(door?.repere),
        widthMm: Number(door?.widthMm) || null,
        heightMm: Number(door?.heightMm) || null,
        colorId: cleanText(door?.colorOptionId),
        colorLabel: cleanText(door?.colorLabel) || resolveColorLabel(door),
        // Panneau déjà choisi (configurateur du site) : pré-sélectionné à la
        // signature, le client peut le changer.
        preset: presetOf(door?.panelChoice),
      });
    });
  });
  return selections;
};
