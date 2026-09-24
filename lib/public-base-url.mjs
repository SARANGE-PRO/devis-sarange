/**
 * Domaine public de l'application (liens partagés avec les clients et les
 * poseurs). Toujours la production, quel que soit le poste depuis lequel le
 * lien est copié.
 */
export const PUBLIC_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://devis.sarange.fr').replace(
  /\/$/,
  ''
);
