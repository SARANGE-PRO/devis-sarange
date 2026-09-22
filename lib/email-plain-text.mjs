/**
 * email-plain-text.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Conversion d'un e-mail HTML (gabarits de lib/quote-signature-service.js et
 * lib/completion-signature-service.js) en texte lisible, pour l'aperçu de
 * vérification affiché AVANT l'envoi au client. Le texte montré est produit
 * depuis le même HTML que celui qui partira : rien n'est réécrit à la main.
 *
 * Module pur (aucun import) : testable par le runner Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const NAMED_ENTITIES = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  zwnj: '',
  zwj: '',
  shy: '',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  agrave: 'à',
  acirc: 'â',
  ccedil: 'ç',
  ugrave: 'ù',
  ucirc: 'û',
  ocirc: 'ô',
  icirc: 'î',
  iuml: 'ï',
  euro: '€',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  ndash: '–',
  mdash: '—',
  copy: '©',
  deg: '°',
  middot: '·',
  bull: '•',
};

const decodeEntities = (value) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code =
        entity[1].toLowerCase() === 'x'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    return named === undefined ? match : named;
  });

/**
 * Texte lisible d'un e-mail HTML : contenu masqué et technique retiré,
 * structure conservée par des sauts de ligne, puces sur les listes.
 */
export const htmlToPlainText = (html) => {
  let text = String(html || '');

  // Rien de ce qui n'est pas du contenu : commentaires, styles, scripts, en-tête.
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Blocs masqués (pré-en-tête des gabarits) : jamais visibles dans le mail.
  text = text.replace(/<(div|span)\b[^>]*display:\s*none[^>]*>[\s\S]*?<\/\1>/gi, '');

  // Structure : un saut de ligne par ligne de liste ou de tableau, une ligne
  // vide entre les blocs (paragraphes, titres, listes, tableaux).
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<li\b[^>]*>/gi, '• ');
  text = text.replace(/<\/(li|tr)>/gi, '\n');
  text = text.replace(/<\/(p|div|h[1-6]|table|ul|ol|blockquote|section|article)>/gi, '\n\n');
  text = text.replace(/<\/t[dh]>/gi, ' ');

  // Toutes les autres balises disparaissent, le texte reste.
  text = text.replace(/<[^>]+>/g, '');
  text = decodeEntities(text);

  // Blancs : espaces multiples, lignes vides en cascade, puces consécutives
  // sans ligne vide entre elles.
  text = text
    .replace(/[ \t \r]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(• [^\n]*)\n\n(?=• )/g, '$1\n')
    .trim();

  return text;
};
