// Plus-value d'un panneau de porte décoratif, calculée comme le sélecteur de
// panneaux (public/selecteur-panneaux/selecteur.html, calcPVPanneau).
//
// À la signature, la plus-value vient du sélecteur au moment où le client
// choisit. Un panneau déjà choisi sur le configurateur du site arrive sans
// montant (le site n'en transmet aucun) : on la recalcule ici pour que la
// signature l'ajoute comme si le client l'avait choisi sur place. La couleur
// est celle du devis, donc sans supplément couleur.
//
// Les données sont une copie de celles du sélecteur ; le test
// tests/door-panel-pricing.test.mjs relit selecteur.html et échoue au moindre
// écart : modifier les deux ensemble.

export const TAUX_REMISE_ACHAT = 463.68 / 900;
export const MARGE_VENTE = 2;
export const HAUSSE_ACHAT = 0.06;
const MULTIPLICATEUR_GLOBAL = TAUX_REMISE_ACHAT * MARGE_VENTE;
const PRIX_BASE_INCLUS = 900 * (1 + HAUSSE_ACHAT) * MULTIPLICATEUR_GLOBAL;

export const DOOR_PANEL_DEFINITIONS = [
    { gamme: "ELA", brut: 900, list: Array.from({length: 70}, (_, i) => String(i + 1).padStart(2, '0')) },
    { gamme: "GEO", brut: 700, list: Array.from({length: 10}, (_, i) => String(i + 1).padStart(2, '0')) },
    { gamme: "LEO", brut: 970, list: ['01','02','03','04','05','06','07','08','09'] },
    { gamme: "LEO", brut: 740, list: ['10','11','12','13','14','15','16','17','18','19','20'] },
    { gamme: "LINA", brut: 920, list: ['19','34'] },
    { gamme: "LINA", brut: 1050, list: ['02','15','29','31'] },
    { gamme: "LINA", brut: 1080, list: ['07','16','32'] },
    { gamme: "LINA", brut: 1120, list: ['01','14','28'] },
    { gamme: "LINA", brut: 1180, list: ['33'] },
    { gamme: "LINA", brut: 1260, list: ['22','25'] },
    { gamme: "LINA", brut: 1360, list: ['26'] },
    { gamme: "REVA", brut: 920, list: ['05','20','22','44','48','63','64','65'] },
    { gamme: "REVA", brut: 980, list: ['01','02','03','26','34','55'] },
    { gamme: "REVA", brut: 1050, list: ['04','15','21','28','53'] },
    { gamme: "REVA", brut: 1080, list: ['06','23','27','31','52','74','75','76'] },
    { gamme: "REVA", brut: 1120, list: ['16','35','36','38','43','56'] },
    { gamme: "REVA", brut: 1140, list: ['29','30','40'] },
    { gamme: "REVA", brut: 1180, list: ['09','10','17'] },
    { gamme: "REVA", brut: 1240, list: ['19'] },
    { gamme: "REVA", brut: 1260, list: ['39','57'] },
    { gamme: "REVA", brut: 1300, list: ['11','12','58','59','60','70','73'] },
    { gamme: "REVA", brut: 1340, list: ['13','61','79'] },
    { gamme: "REVA", brut: 1400, list: ['78','81'] },
    { gamme: "REVA", brut: 1460, list: ['18','62','77'] },
    { gamme: "REVA", brut: 1500, list: ['71','80'] },
    { gamme: "REVA", brut: 1540, list: ['68','82'] },
    { gamme: "REVA", brut: 1580, list: ['69'] },
    { gamme: "REVA", brut: 1600, list: ['66','67','72'] },
    { gamme: "CLASSICO", brut: 680, list: ['01','02','03','04','05','06','07','08','09','10'] },
    { gamme: "CLASSICO", brut: 730, list: ['11','14','15','16','17','18'] },
    { gamme: "CLASSICO", brut: 760, list: ['06-A','07-A'] },
    { gamme: "CLASSICO", brut: 860, list: ['08-A','17-A'] },
    { gamme: "CLASSICO", brut: 880, list: ['02-A','11-A'] },
    { gamme: "CLASSICO", brut: 930, list: ['02-D','06-B','06-D','07-B','07-C','08-D'] },
    { gamme: "CLASSICO", brut: 1000, list: ['09-D','15-A','16-A','18-A'] },
    { gamme: "CLASSICO", brut: 1050, list: ['03-A','04-A','05-A','09-A','10-A','10-F','10-G','10-H','14-A','14-B'] },
    { gamme: "CLASSICO", brut: 1100, list: ['01-A','04-F','04-G','04-H','10-D'] },
    { gamme: "CLASSICO", brut: 1150, list: ['01-D','01-F','01-G','01-H','02-F','02-G','03-D','04-I','11-D','11-F','11-G','11-H','16-B'] },
    { gamme: "CLASSICO", brut: 1180, list: ['03-F','03-G','03-H','03-I','04-D','05-D','06-C','18-I'] },
    { gamme: "CLASSICO", brut: 1200, list: ['05-F','05-G','05-H','09-F','09-G','09-H','10-I'] },
    { gamme: "CLASSICO", brut: 1280, list: ['08-F'] },
    { gamme: "CLASSICO", brut: 1340, list: ['11-I','12','13'] },
    { gamme: "CLASSICO", brut: 1400, list: ['02-E','06-F','06-I','11-E','15-C'] },
    { gamme: "CLASSICO", brut: 1420, list: ['01-E','03-E','05-E','14-C'] },
    { gamme: "CLASSICO", brut: 1600, list: ['12-A','13-A'] },
    { gamme: "CLASSICO", brut: 1760, list: ['12-I','13-I'] }
];

const brutApresHausse = (brut) => Math.round(brut * (1 + HAUSSE_ACHAT) * 100) / 100;

const calcPVPanneau = (prixBrutCatalogue) => {
  const pv = prixBrutCatalogue * MULTIPLICATEUR_GLOBAL - PRIX_BASE_INCLUS;
  if (pv > 0.01) return pv < 49.98 ? 49.98 : pv;
  return 0;
};

const PV_BY_PANEL = new Map();
DOOR_PANEL_DEFINITIONS.forEach((def) => {
  const pv = calcPVPanneau(brutApresHausse(def.brut));
  def.list.forEach((suffix) => PV_BY_PANEL.set(`${def.gamme} ${suffix}`, pv));
});

/**
 * Plus-value HT du modèle (« ELA 01 », « CLASSICO 01-D »), ou null si le
 * modèle est inconnu du catalogue.
 */
export const panelPlusValueHT = (panelName) => {
  const key = String(panelName || '').trim().replace(/\s+/g, ' ').toUpperCase();
  return PV_BY_PANEL.has(key) ? PV_BY_PANEL.get(key) : null;
};
