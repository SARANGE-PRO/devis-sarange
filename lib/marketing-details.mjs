/**
 * marketing-details.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Lignes « marketing » d'une ligne de devis (profils, poignée, finition) et
 * couleur du schéma, déduites du produit et de la coloration choisie.
 *
 * Partagé par le formulaire (components/ProductSelector.jsx) et par l'import
 * des demandes du site (lib/lead-quote-import.mjs) : une ligne créée depuis le
 * configurateur public porte exactement les mêmes mentions qu'une ligne saisie
 * au bureau.
 *
 * Module pur (aucun import) : testable par le runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const getMarketingDetails = ({
  product,
  colorOptionId,
  colorState = {},
  hasLockingHandle = false,
  panneauDecoratif = false,
}) => {
  if (!product) {
    return { marketingBase: '', marketingFinition: '', svgColor: '#FFFFFF' };
  }

  const isVolet = product.sheet.startsWith('Volet');
  const isPorte = product.sheet.startsWith('Porte Entr');
  const isAlu = product.material === 'alu' || /\bALU\b/i.test(product.sheet);
  const isCoulissant = product.sheet.includes('Coulissant');
  let marketingBase = '';

  if (!isVolet) {
    if (isAlu) {
      marketingBase = 'Profiles aluminium Schuco\nRupture de pont thermique';
    } else {
      marketingBase = isCoulissant
        ? "Profiles PVC Schuco\n5 chambres d'isolation avec renforts acier galvanise\nSysteme a double joint d'etancheite"
        : "Profiles PVC Schuco 70 mm\n5 chambres d'isolation avec renforts acier galvanise\nSysteme a double joint d'etancheite";
    }

    if (!isPorte) {
      const handleLabel = isAlu ? 'Poignee Schuco' : 'Poignee Schuco Euro';
      marketingBase += hasLockingHandle
        ? `\n${handleLabel} verrouillable a cle`
        : `\n${handleLabel}`;
    }
  }

  let marketingFinition = 'Finition : Blanc';
  let svgColor = '#FFFFFF';

  if (isVolet && colorOptionId === 'coloration-2f') {
    if (colorState.color2fType === 'standard_7016') {
      marketingFinition = 'Finition : Gris Anthracite RAL 7016';
      svgColor = '#4A4A4A';
    } else if (colorState.color2fType === 'standard_chene') {
      marketingFinition = 'Finition : Chene dore';
      svgColor = '#8B5A2B';
    } else {
      marketingFinition = `Finition : ${colorState.customColor2fText || 'Couleur a definir'}`;
      svgColor = colorState.customColor2fHex || '#4A4A4A';
    }
  } else if (!isVolet && colorOptionId === 'bicoloration') {
    if (colorState.bicoType === 'standard_7016') {
      marketingFinition = 'Bicoloration : Blanc interieur / Gris 7016 exterieur';
    } else if (colorState.bicoType === 'standard_chene') {
      marketingFinition = 'Bicoloration : Blanc interieur / Chene dore exterieur';
    } else {
      const inside = colorState.customColorIntText || 'Interieur a definir';
      const outsidePrefix = colorState.isExtPlaxageBico ? 'Plaxage ' : '';
      const outside = colorState.customColorExtText || 'Exterieur a definir';
      marketingFinition = `Bicoloration : ${inside} / ${outsidePrefix}${outside}`;
      svgColor =
        inside.toLowerCase().includes('blanc') || !inside.trim()
          ? '#FFFFFF'
          : colorState.customColorIntHex || '#FFFFFF';
    }
  } else if (colorOptionId === 'coloration-2f') {
    if (colorState.color2fType === 'standard_7016') {
      marketingFinition = 'Finition : Gris 7016 2 faces';
      svgColor = '#4A4A4A';
    } else if (colorState.color2fType === 'standard_chene') {
      marketingFinition = 'Finition : Chene dore 2 faces';
      svgColor = '#8B5A2B';
    } else {
      marketingFinition = `Finition : ${colorState.customColor2fText || 'Couleur a definir'}`;
      svgColor = colorState.customColor2fHex || '#4A4A4A';
    }
  }

  if (isPorte && panneauDecoratif) {
    marketingBase += '\nPanneau decoratif';
  }

  return { marketingBase, marketingFinition, svgColor };
};
