// Compile une feuille Tailwind STATIQUE pour le sélecteur de panneaux, en
// remplacement du CDN « Tailwind Play ». Le balayage se limite à selecteur.html
// (source(none) désactive la détection automatique). Les couleurs « sarange »
// d'origine sont redéclarées via @theme.
//
// Régénération :  node scripts/build-selecteur-css.mjs
// (à relancer après toute modification de public/selecteur-panneaux/selecteur.html)

import { writeFileSync } from 'node:fs';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';

const DIR = 'public/selecteur-panneaux';

const input = `@import "tailwindcss" source(none);
@source "./selecteur.html";
@theme {
  /* Identité SARANGE : ardoise #0f172a + orange #f97316.
     NB : la classe historique « sarange-blue » est conservée mais pointe
     désormais vers l'orange de marque (bascule globale bleu -> orange). */
  --color-sarange-dark: #0f172a;
  --color-sarange-blue: #f97316;
  --color-sarange-light: #f8fafc;
}
`;

const result = await postcss([tailwindcss()]).process(input, {
  from: `${DIR}/_tw-input.css`,
  to: `${DIR}/tailwind.css`,
});

writeFileSync(`${DIR}/tailwind.css`, result.css);
console.log(`OK — tailwind.css écrit (${(result.css.length / 1024).toFixed(1)} Ko)`);
