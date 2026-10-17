// Adresse d'un lead du site, découpée comme l'autocomplétion du bureau.
//
// Le configurateur envoie l'adresse telle que la Base Adresse Nationale la
// libelle (« 35 Avenue Michel Chartier 77090 Collégien »), le code postal à
// part, et la ville seulement dans le projet ; les anciens formulaires
// envoient une adresse tapée à la main et « 77550 Moissy-Cramayel » dans le
// champ zip. L'Apps Script remplace un champ vide par « Non renseigné ».
// Ici tout cela devient les trois champs de la fiche client (voie, code
// postal, ville), ceux que remplit AddressAutocomplete au bureau.

const PLACEHOLDER = /^(non renseign[ée]e?s?|inconnue?|n\/a|-)$/i;

/** Texte nettoyé, vide si c'est un bouche-trou de l'Apps Script. */
export const cleanLeadField = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return PLACEHOLDER.test(text) ? '' : text;
};

/** Comparaison sans accents, sans casse, sans ponctuation. */
const fold = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s,.;:'’-]+/g, ' ')
    .trim();

const trimEdges = (value) => String(value || '').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '');

/** Retire la ville répétée en fin de voie (« 12 rue Haute, Melun »). */
const stripCitySuffix = (adresse, ville) => {
  const foldedAddress = fold(adresse);
  const foldedCity = fold(ville);
  if (!foldedAddress || !foldedCity) return adresse;
  if (foldedAddress === foldedCity) return '';
  if (!foldedAddress.endsWith(` ${foldedCity}`)) return adresse;
  const target = foldedAddress.slice(0, -foldedCity.length).trim();
  let cut = adresse.length;
  while (cut > 0 && fold(adresse.slice(0, cut)) !== target) cut -= 1;
  return trimEdges(adresse.slice(0, cut));
};

/**
 * @param {{ address?: string, zip?: string, city?: string }} lead
 * @returns {{ adresse: string, codePostal: string, ville: string }}
 */
export function splitLeadAddress({ address, zip, city } = {}) {
  const fullAddress = cleanLeadField(address);
  const zipField = cleanLeadField(zip);
  let codePostal = '';
  let ville = cleanLeadField(city);

  // Le champ zip : le code postal seul, ou suivi de la ville, ou la ville seule.
  const zipOnly = zipField.match(/^(\d{5})$/);
  const zipAndCity = zipField.match(/^(\d{5})\s+(.+)$/);
  if (zipOnly) codePostal = zipOnly[1];
  else if (zipAndCity) {
    codePostal = zipAndCity[1];
    ville = ville || trimEdges(zipAndCity[2]);
  } else if (zipField && !ville) ville = zipField;

  // Dans l'adresse, le dernier nombre à cinq chiffres est le code postal et
  // ce qui le suit la localité : la voie s'arrête devant.
  let adresse = fullAddress;
  const tokens = [...fullAddress.matchAll(/(?<!\d)(\d{5})(?!\d)/g)];
  const last = tokens[tokens.length - 1];
  if (last) {
    const before = fullAddress.slice(0, last.index);
    const after = trimEdges(fullAddress.slice(last.index + 5));
    // Une voie précède (des lettres) : on coupe. L'adresse qui commence par
    // ce nombre n'est coupée que s'il est bien le code postal déjà connu, ou
    // s'il est suivi de la ville connue ; sinon ce peut être un numéro de voie.
    const startsWithLocality =
      !before.trim() && (last[1] === codePostal || (ville !== '' && fold(after).startsWith(fold(ville))));
    if (/[A-Za-zÀ-ÿ]/.test(before) || startsWithLocality) {
      codePostal = last[1];
      ville = ville || after;
      adresse = trimEdges(before);
    }
  }

  adresse = stripCitySuffix(adresse, ville);
  return { adresse, codePostal, ville: trimEdges(ville) };
}
