/**
 * search.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Recherche plein texte commune aux onglets (Mes devis, Clients, Compta,
 * Demandes, Commissions) :
 *   • sans accents ni casse : « helene » trouve « Hélène » ;
 *   • chaque mot tapé doit se retrouver, dans n'importe quel ordre :
 *     « martin vendu » = les dossiers Martin vendus ;
 *   • les numéros (téléphone, devis, SIRET, code postal, montant) se cherchent
 *     avec ou sans espaces, points et tirets : « 06 62 68 90 84 » retrouve
 *     « 0662689084 » et l'inverse, « dv 262341234 » retrouve « DV-262341234 »,
 *     « 341234 » aussi (partie du numéro) ;
 *   • des mots consécutifs ne contenant que des chiffres sont lus comme UN
 *     numéro (« 06 62 68 90 84 »).
 *
 * Module pur (aucun import) : testable par le runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const foldSearchText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

// Lettres et chiffres seulement : « DV-26 23.41234 » → « dv262341234 ».
const compactSearchText = (value) => foldSearchText(value).replace(/[^a-z0-9]/g, '');

const flattenParts = (parts) =>
  (Array.isArray(parts) ? parts.flat(Infinity) : [parts])
    .filter((part) => part !== null && part !== undefined && part !== false && part !== '')
    .map((part) => String(part));

/**
 * Index d'un enregistrement à partir de ses champs (chaînes, nombres, tableaux
 * imbriqués ; les vides sont ignorés) : `text` pour les mots, `compact` pour
 * les numéros mis en forme (chaque champ réduit à ses lettres et chiffres,
 * séparément pour ne pas coller deux numéros voisins).
 */
export const buildSearchIndex = (...parts) => {
  const fields = flattenParts(parts);
  return {
    // Champs séparés par « | » (jamais tapé) : un numéro saisi avec des
    // espaces ne peut pas se reconstituer à cheval sur deux champs.
    text: ` ${fields.map(foldSearchText).filter(Boolean).join(' | ')} `,
    compact: ` ${fields.map(compactSearchText).filter(Boolean).join(' ')} `,
  };
};

/** Découpe la saisie : mots pliés, groupes de chiffres consécutifs fusionnés. */
export const tokenizeSearchQuery = (query) => {
  const tokens = [];
  foldSearchText(query)
    .split(/\s+/)
    .filter(Boolean)
    .forEach((word) => {
      const compact = compactSearchText(word);
      const numeric = compact.length > 0 && /^\d+$/.test(compact);
      const previous = tokens[tokens.length - 1];
      if (numeric && previous?.numeric) {
        previous.text += ` ${word}`;
        previous.compact += compact;
      } else {
        tokens.push({ text: word, compact, numeric });
      }
    });
  return tokens;
};

/** Vrai si chaque mot (ou numéro) de la saisie se retrouve dans l'index. */
export const matchesSearchIndex = (index, query) => {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return true;
  if (!index) return false;
  return tokens.every(
    (token) =>
      index.text.includes(token.text) ||
      (token.compact.length > 0 && index.compact.includes(token.compact))
  );
};

/**
 * Textes et nombres contenus dans un objet (profondeur limitée), pour indexer
 * un bloc de données sans en lister chaque champ (ex. analyse d'une demande).
 */
export const collectSearchValues = (value, depth = 3) => {
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'string' || typeof value === 'number') return [value];
  if (depth <= 0 || typeof value !== 'object') return [];
  return Object.values(value).flatMap((entry) => collectSearchValues(entry, depth - 1));
};

/** Raccourci : construit l'index des champs puis compare. */
export const matchesSearch = (parts, query) => matchesSearchIndex(buildSearchIndex(parts), query);
