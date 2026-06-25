// Construit la version durcie (production) du sélecteur de panneaux à partir
// du fichier source de travail, puis l'écrit dans public/selecteur-panneaux/.
//
// Durcissement appliqué :
//  - suppression des 3 CDN (Tailwind Play, Lucide unpkg, Google Fonts) au profit
//    d'assets auto-hébergés (tailwind.css, lucide.js, inter.css) ;
//  - sécurité postMessage : diffusion vers l'origine du parent (jamais '*') ;
//    vérification de event.origin sur l'écouteur SET_DEVIS_COLOR ;
//  - Mode B « catalogue » (?mode=catalogue) : masque prix + boutons de sélection.
//  - habillage SARANGE : barre de marque (logo), signature footer, bascule
//    chromatique bleu -> orange, micro-animations sobres.
//
// Régénération :  node scripts/build-selecteur-html.mjs
// (nécessite le dossier source local « Outils Panneaux décoratifs/ »)

import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'Outils Panneaux décoratifs/s_lecteur_de_panneaux_multi_gammes.html';
const OUT = 'public/selecteur-panneaux/selecteur.html';

let html = readFileSync(SRC, 'utf8');

const edits = [];
const rep = (label, find, replace) => edits.push({ label, find, replace });

// ------------------------------------------------------------------ HEAD : CDN -> local
rep(
  'tailwind-cdn',
  '    <script src="https://cdn.tailwindcss.com"></script>',
  '    <link rel="stylesheet" href="tailwind.css">'
);
rep(
  'tailwind-config',
  '        tailwind.config = {',
  '        const _unusedTailwindConfig = {  // conservé pour référence ; les couleurs sarange sont compilées dans tailwind.css'
);
rep(
  'gfonts',
  '    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">',
  '    <link rel="stylesheet" href="inter.css">'
);
rep(
  'lucide-cdn',
  '    <script src="https://unpkg.com/lucide@latest"></script>',
  '    <script src="lucide.js"></script>'
);

// ------------------------------------------------------------------ CSS : mode catalogue + branding/animations
rep(
  'inject-styles',
  '        .chev { transition: transform 0.2s ease; }',
  '        .chev { transition: transform 0.2s ease; }\n' +
    '        /* === Mode catalogue (Mode B) : masque prix et boutons de sélection === */\n' +
    '        body.catalogue-mode .devis-only { display: none !important; }\n' +
    '        /* En catalogue, le bloc « Bon à savoir » passe de 3 à 2 colonnes (point Tarif masqué) */\n' +
    '        @media (min-width: 640px) { body.catalogue-mode .info-points { grid-template-columns: repeat(2, minmax(0, 1fr)); } }\n' +
    '\n' +
    '        /* === Branding & micro-animations SARANGE (sobres, respectent prefers-reduced-motion) === */\n' +
    '        @keyframes riseIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }\n' +
    '        .door-card.anim-rise { animation: riseIn .5s cubic-bezier(.22,1,.36,1) both; }\n' +
    '        .door-card:hover { box-shadow: 0 22px 32px -14px rgba(249,115,22,.30), 0 8px 14px -8px rgba(15,23,42,.12); }\n' +
    '        #tabsContainer button { transition: transform .15s ease, background-color .2s ease, color .2s ease, box-shadow .2s ease; }\n' +
    '        #tabsContainer button:active { transform: scale(.96); }\n' +
    '        .brand-dot { display: inline-block; transition: transform .35s cubic-bezier(.22,1,.36,1); }\n' +
    '        .brand-bar:hover .brand-dot { transform: translateY(-3px); }\n' +
    '        .btn-sheen { position: relative; overflow: hidden; }\n' +
    '        .btn-sheen::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 35%, rgba(255,255,255,.22) 50%, transparent 65%); transform: translateX(-130%); transition: transform .7s ease; }\n' +
    '        .btn-sheen:hover::after { transform: translateX(130%); }\n' +
    '        @media (prefers-reduced-motion: reduce) { .door-card.anim-rise { animation: none; } .btn-sheen::after { display: none; } .brand-dot { transition: none; } }'
);

// ------------------------------------------------------------------ devis-only : éléments à masquer en catalogue
rep('tarif-card', // 1re carte "Bon à savoir" (= Tarif transparent), repérée par son badge émeraude
  '                        <div class="flex gap-3 bg-slate-50 rounded-xl p-3">\n' +
    '                            <span class="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex-shrink-0">',
  '                        <div class="devis-only flex gap-3 bg-slate-50 rounded-xl p-3">\n' +
    '                            <span class="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex-shrink-0">'
);
rep('pv-block', 'id="modalPvBlock" class="bg-slate-50', 'id="modalPvBlock" class="devis-only bg-slate-50');
rep('croisillon', 'id="croisillonSection" class="hidden mb-4 bg-slate-50', 'id="croisillonSection" class="devis-only hidden mb-4 bg-slate-50');
rep('color-section', '<div id="colorSection" class="mb-4">', '<div id="colorSection" class="devis-only mb-4">');
rep('disclaimers', '<div id="dynamicDisclaimersContainer" class="mb-6"></div>', '<div id="dynamicDisclaimersContainer" class="devis-only mb-6"></div>');
rep('preselect-btn', 'id="preSelectBtn" class="w-full bg-sarange-blue', 'id="preSelectBtn" class="devis-only btn-sheen w-full bg-sarange-blue');
rep('confirm-btn', 'id="confirmSelectionBtn" class="w-full bg-green-600', 'id="confirmSelectionBtn" class="btn-sheen w-full bg-green-600');

// ------------------------------------------------------------------ JS : CATALOGUE_MODE + sécurité postMessage
rep(
  'url-params-block',
  '        const urlParams = new URLSearchParams(window.location.search);\n' +
    "        let devisColor = urlParams.get('couleur');\n" +
    '\n' +
    "        window.addEventListener('message', (event) => {\n" +
    "            if (event.data && event.data.event === 'SET_DEVIS_COLOR') {\n" +
    '                devisColor = event.data.color;\n' +
    '            }\n' +
    '        });',
  '        const urlParams = new URLSearchParams(window.location.search);\n' +
    "        let devisColor = urlParams.get('couleur');\n" +
    '\n' +
    "        // Mode catalogue (Mode B) : aperçu seul, sans prix ni parcours de sélection.\n" +
    "        const CATALOGUE_MODE = urlParams.get('mode') === 'catalogue';\n" +
    "        // Sous-mode : lien dédié n'affichant que les panneaux sans plus-value.\n" +
    "        const CATALOGUE_ONLY_INCLUS = CATALOGUE_MODE && urlParams.get('inclus') === '1';\n" +
    '\n' +
    '        // [SÉCURITÉ postMessage] Origine du parent autorisée :\n' +
    "        //  1) param ?parentOrigin= ; 2) origine de l'embarqueur (ancestorOrigins) ;\n" +
    '        //  3) referrer ; 4) repli sur la même origine (déploiement sous /public).\n' +
    '        //  On ne diffuse jamais vers "*".\n' +
    '        const PARENT_ORIGIN = (() => {\n' +
    "            const fromParam = urlParams.get('parentOrigin');\n" +
    '            if (fromParam) { try { return new URL(fromParam).origin; } catch (e) {} }\n' +
    '            try {\n' +
    '                const anc = window.location.ancestorOrigins;\n' +
    '                if (anc && anc.length) return anc[anc.length - 1];\n' +
    '            } catch (e) {}\n' +
    '            try { if (document.referrer) return new URL(document.referrer).origin; } catch (e) {}\n' +
    '            return window.location.origin;\n' +
    '        })();\n' +
    '\n' +
    "        window.addEventListener('message', (event) => {\n" +
    "            // N'accepter les ordres du parent que depuis l'origine attendue.\n" +
    '            if (event.origin !== PARENT_ORIGIN) return;\n' +
    "            if (event.data && event.data.event === 'SET_DEVIS_COLOR') {\n" +
    '                devisColor = event.data.color;\n' +
    '            }\n' +
    '        });'
);

// ------------------------------------------------------------------ JS : masquage prix dans les vues dynamiques
rep('pv-badge', '            const pvBadgeHtml = door.pv > 0', "            const pvBadgeHtml = CATALOGUE_MODE ? '' : door.pv > 0");
rep(
  'aria-label',
  " — ${door.pv > 0 ? 'plus-value ' + door.pv.toFixed(2).replace('.', ',') + ' euros HT' : 'inclus, sans supplément'}. Ouvrir pour choisir.",
  "${CATALOGUE_MODE ? '' : ' — ' + (door.pv > 0 ? 'plus-value ' + door.pv.toFixed(2).replace('.', ',') + ' euros HT' : 'inclus, sans supplément')}. Ouvrir pour ${CATALOGUE_MODE ? 'voir le détail' : 'choisir'}."
);
rep('tabs-filter',
  '            gammes.forEach(gamme => {',
  '            gammes.filter(g => {\n' +
    '                if (CATALOGUE_MODE && g === TAB_INCLUS) return false;          // pas de notion de prix en catalogue\n' +
    '                if (CATALOGUE_ONLY_INCLUS && g !== TAB_ALL && !GAMMES_WITH_INCLUS.has(g)) return false; // onglet sans modèle inclus\n' +
    '                return true;\n' +
    '            }).forEach(gamme => {'
);

// ------------------------------------------------------------------ JS : postMessage ciblé + init catalogue
rep('postmessage-origin', "            window.parent.postMessage(selection, '*');", '            window.parent.postMessage(selection, PARENT_ORIGIN);');
rep(
  'init-catalogue',
  '        renderTabs();\n        applyFilters();',
  "        if (CATALOGUE_MODE) {\n" +
    "            document.body.classList.add('catalogue-mode');\n" +
    "            const _sum = document.getElementById('infoSummary');\n" +
    "            if (_sum) _sum.textContent = 'Couleurs et visuels — l\\'essentiel en 2 points';\n" +
    "        }\n" +
    "        // Le catalogue « inclus » s'ouvre sur toute la collection filtrée (évite les onglets vides).\n" +
    "        if (CATALOGUE_ONLY_INCLUS) currentGammeFilter = TAB_ALL;\n" +
    "        renderTabs();\n        applyFilters();"
);

// ------------------------------------------------------------------ BRANDING : barre de marque SARANGE
rep(
  'brand-bar',
  '<body class="text-slate-800 antialiased flex flex-col min-h-screen">',
  '<body class="text-slate-800 antialiased flex flex-col min-h-screen">\n' +
    '\n' +
    '    <!-- Barre de marque SARANGE -->\n' +
    '    <header class="brand-bar bg-slate-900 text-white border-b-2 border-orange-500 shadow-lg shadow-slate-900/20 relative z-40">\n' +
    '        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">\n' +
    '            <div class="flex items-center gap-3 select-none">\n' +
    '                <span class="text-2xl sm:text-[28px] font-black text-white leading-none" style="letter-spacing:-0.04em">SARANGE<span class="brand-dot text-orange-500">.</span></span>\n' +
    '                <span class="hidden sm:block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 border-l border-slate-700 pl-3">Sélecteur de panneaux</span>\n' +
    '            </div>\n' +
    '            <div class="flex items-center gap-2 text-xs font-medium text-slate-300">\n' +
    '                <i data-lucide="shield-check" class="w-4 h-4 text-orange-400"></i>\n' +
    '                <span class="hidden sm:inline">Fabrication française sur-mesure</span>\n' +
    '            </div>\n' +
    '        </div>\n' +
    '    </header>'
);

// ------------------------------------------------------------------ BRANDING : signature SARANGE dans le footer
rep(
  'footer-brand',
  "        <p class=\"text-sm\">&copy; <script>document.write(new Date().getFullYear())</script> SARANGE. Outil d'aide à la vente. Visuels non contractuels.</p>",
  '        <div class="max-w-7xl mx-auto px-4">\n' +
    '            <p class="text-xl font-black text-white mb-1" style="letter-spacing:-0.03em">SARANGE<span class="text-orange-500">.</span></p>\n' +
    "            <p class=\"text-sm\">&copy; <script>document.write(new Date().getFullYear())</script> SARANGE — Outil d'aide à la vente. Visuels non contractuels.</p>\n" +
    '        </div>'
);

// ------------------------------------------------------------------ ANIMATION : apparition échelonnée des cartes
rep('render-doors-sig', '        function renderDoors(doorsToRender, grouped) {', '        function renderDoors(doorsToRender, grouped, animate) {');
rep(
  'render-doors-stagger',
  '            doorCountSpan.textContent = doorsToRender.length;',
  '            if (animate !== false) {\n' +
    '                grid.querySelectorAll(".door-card").forEach((c, i) => {\n' +
    '                    c.classList.add("anim-rise");\n' +
    '                    c.style.animationDelay = Math.min(i, 8) * 45 + "ms";\n' +
    '                });\n' +
    '            }\n' +
    '            doorCountSpan.textContent = doorsToRender.length;'
);
rep('applyfilters-animate', '            renderDoors(filtered, grouped);', '            renderDoors(filtered, grouped, !searching);');

// ------------------------------------------------------------------ Mode B v2 : lien « inclus » + correction « 2 points »
rep('catalogue-inclus-filter',
  '                return matchGamme && matchSearch;',
  '                return matchGamme && matchSearch && (!CATALOGUE_ONLY_INCLUS || door.pv === 0);'
);
rep('gammes-with-inclus',
  '        // Initialiser les icônes Lucide UI',
  '        // Gammes ayant au moins un modèle sans plus-value (catalogue « inclus »).\n' +
    '        const GAMMES_WITH_INCLUS = new Set(doors.filter(d => d.pv === 0).map(d => d.gamme));\n' +
    '\n' +
    '        // Initialiser les icônes Lucide UI'
);
rep('catalogue-inclus-banner',
  "            let html = '';\n\n            if (currentGammeFilter === TAB_ELA && !term) {",
  "            let html = '';\n\n" +
    "            if (CATALOGUE_ONLY_INCLUS && !term) {\n" +
    "                html = `\n" +
    '                    <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">\n' +
    '                        <i data-lucide="check-circle" class="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5"></i>\n' +
    '                        <div>\n' +
    '                            <p class="font-semibold text-emerald-800">Modèles inclus — sans supplément</p>\n' +
    '                            <p class="text-sm text-emerald-700">Cette sélection regroupe les panneaux proposés sans aucun surcoût. Touchez un modèle pour le découvrir.</p>\n' +
    '                        </div>\n' +
    '                    </div>`;\n' +
    "            } else if (currentGammeFilter === TAB_ELA && !term) {"
);
rep('info-summary-id',
  '<span class="block text-xs text-slate-500">Tarifs, couleurs et visuels — l\'essentiel en 3 points</span>',
  '<span id="infoSummary" class="block text-xs text-slate-500">Tarifs, couleurs et visuels — l\'essentiel en 3 points</span>'
);
rep('info-points-class',
  '<div class="border-t border-slate-100 p-4 md:p-5 grid gap-3 sm:grid-cols-3">',
  '<div class="info-points border-t border-slate-100 p-4 md:p-5 grid gap-3 sm:grid-cols-3">'
);

// ------------------------------------------------------------------ Application + assertions
for (const { label, find, replace } of edits) {
  const n = html.split(find).length - 1;
  if (n !== 1) {
    throw new Error(`[${label}] trouvé ${n} fois (attendu : 1). Remplacement annulé.`);
  }
  html = html.replace(find, replace);
}

// ---- Bascule chromatique : bleu accent d'origine -> orange de marque SARANGE ----
// (le bleu « sarange-blue » est traité via @theme dans build-selecteur-css.mjs ;
//  ici on convertit les classes bleues figées en équivalents orange.)
const colorSwaps = [
  ['bg-blue-50', 'bg-orange-50'],
  ['bg-blue-100', 'bg-orange-100'], // couvre aussi hover:bg-blue-100
  ['border-blue-100', 'border-orange-100'],
  ['border-blue-200', 'border-orange-200'],
  ['bg-blue-700', 'bg-orange-600'], // couvre hover:bg-blue-700
];
for (const [from, to] of colorSwaps) {
  const n = html.split(from).length - 1;
  html = html.split(from).join(to);
  console.log(`  couleur ${from} -> ${to} (${n})`);
}

writeFileSync(OUT, html);
console.log(`OK — ${edits.length} remplacements + bascule couleur appliqués -> ${OUT}`);
