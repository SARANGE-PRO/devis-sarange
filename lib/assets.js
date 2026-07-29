// Pictogrammes du « Tableau de financement » du PDF (un par étape de
// l'échéancier) : panier validé (acompte/commande), usine (fabrication),
// casque (pose/chantier). Style « trait affiné » (1.8) avec détails : coche
// centrée dans le caddie, fenêtres de l'usine, jugulaire du casque. Couleurs
// codées en dur — elles doivent correspondre aux accents des blocs
// (MILESTONE_BLOCK_STYLES, lib/pdf-generator.js).
export const MILESTONE_ICON_SVGS = {
  deposit: `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M2.6 3.2h2.1l2.46 10.9a1.75 1.75 0 0 0 1.7 1.35h7.62a1.75 1.75 0 0 0 1.7-1.32l1.76-7.03H6.05"></path>
  <circle cx="9.4" cy="19.7" r="1.45"></circle>
  <circle cx="16.8" cy="19.7" r="1.45"></circle>
  <path d="m10.7 11.1 1.85 1.85 3.45-3.45"></path>
</svg>
`.trim(),
  fabrication: `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M3 21V8.7a.6.6 0 0 1 .95-.49L9 11.6V8.7a.6.6 0 0 1 .95-.49L15 11.6V4.5c0-.83.67-1.5 1.5-1.5h3c.83 0 1.5.67 1.5 1.5V21Z"></path>
  <path d="M6.1 17h1.7M11 17h1.7M15.9 17h1.7"></path>
</svg>
`.trim(),
  chantier: `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M9.9 9.7V5.8c0-.61.49-1.1 1.1-1.1h2c.61 0 1.1.49 1.1 1.1v3.9"></path>
  <path d="M4.5 15v-1.4a7 7 0 0 1 5.4-6.82"></path>
  <path d="M14.1 6.78A7 7 0 0 1 19.5 13.6V15"></path>
  <path d="M2.7 17.4c0-.66.54-1.2 1.2-1.2h16.2c.66 0 1.2.54 1.2 1.2v1c0 .66-.54 1.2-1.2 1.2H3.9c-.66 0-1.2-.54-1.2-1.2Z"></path>
</svg>
`.trim(),
};

export const WASTE_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-recycle text-green-500 shrink-0" aria-hidden="true">
  <path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"></path>
  <path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"></path>
  <path d="m14 16-3 3 3 3"></path>
  <path d="M8.293 13.596 7.196 9.5 3.1 10.598"></path>
  <path d="m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843"></path>
  <path d="m13.378 9.633 4.096 1.098 1.097-4.096"></path>
</svg>
`.trim();

// Icône « Remise commerciale » : étiquette de prix avec symbole pourcentage.
// Partagée entre l'UI (composant React) et le PDF (rasterisation canvas).
export const REMISE_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12.6 2.6 21 11a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6z"/>
  <circle cx="6.8" cy="6.8" r="1.1"/>
  <path d="m9.7 15.5 5.8-5.8"/>
  <circle cx="10.6" cy="10.6" r="1.2"/>
  <circle cx="14.6" cy="14.6" r="1.2"/>
</svg>
`.trim();

export const LOGO_NEGATIVE_SVG = `
<svg viewBox="0 0 280 60" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="textGradDark" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#FFFFFF" />
            <stop offset="100%" stop-color="#CBD5E1" />
        </linearGradient>
    </defs>
    <text x="0" y="45" font-family="'Inter', sans-serif" font-weight="900" font-size="48" fill="url(#textGradDark)" letter-spacing="-0.05em">
        SARANGE<tspan fill="#F97316">.</tspan>
    </text>
</svg>
`.trim();
