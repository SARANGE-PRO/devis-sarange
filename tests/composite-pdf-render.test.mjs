// Rendu PDF des châssis composés avec volet roulant monobloc.
//
// À lancer avec le chargeur d'alias :
//   node --import ./tests/helpers/register-alias.mjs tests/composite-pdf-render.test.mjs
//
// Régression du 21/09/2026 : chaque châssis du composé recevait son propre
// coffre miniature dans l'image du PDF (le champ `voletMonobloc` de l'article
// composé était copié sur chaque châssis), d'où un « volet » visible au milieu
// de l'ensemble, sous un soufflet. Le client pouvait croire que le soufflet
// n'avait pas de volet.
//
// Le test exécute le VRAI code de rendu (lib/pdf-generator.js +
// lib/MenuiserieRenderer.js) sur un faux canvas qui enregistre les tracés.
import assert from 'node:assert/strict';

/* ─── Faux DOM : canvas et contexte 2D enregistreurs ─────────────────────── */

const createdCanvases = [];

class FakeContext2D {
  constructor() {
    this.calls = [];
  }
}

const CONTEXT_METHODS = [
  'lineTo', 'moveTo', 'beginPath', 'stroke', 'drawImage', 'clearRect', 'fill',
  'fillRect', 'strokeRect', 'save', 'restore', 'closePath', 'clip', 'arc', 'rect',
  'fillText', 'strokeText', 'translate', 'rotate', 'scale', 'setLineDash',
];

const contextHandler = {
  get(target, property) {
    if (property in target) return target[property];
    if (property === 'measureText') return () => ({ width: 0 });
    if (property === 'createLinearGradient' || property === 'createRadialGradient') {
      return () => ({ addColorStop() {} });
    }
    // Toute méthode de dessin : enregistrée, sans effet.
    if (CONTEXT_METHODS.includes(property) || typeof property === 'string') {
      return (...args) => {
        target.calls.push({ name: property, args });
      };
    }
    return undefined;
  },
  set(target, property, value) {
    target[property] = value;
    return true;
  },
};

class FakeCanvas {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.context = new Proxy(new FakeContext2D(), contextHandler);
    createdCanvases.push(this);
  }

  getContext() {
    return this.context;
  }

  toDataURL() {
    return `data:image/png;base64,${this.width}x${this.height}`;
  }
}

globalThis.document = {
  createElement(tag) {
    return tag === 'canvas' ? new FakeCanvas() : {};
  },
};

/* ─── Modules de l'application (chargés via le chargeur d'alias) ─────────── */

const { renderMenuiserieToDataURL } = await import('../lib/pdf-generator.js');
const { MenuiserieRenderer } = await import('../lib/MenuiserieRenderer.js');
const { buildCompositeModuleConfig } = await import('../lib/menuiserie.js');
const { createDefaultFrame, solveFrame, computeOpenings, placeChassis } = await import(
  '../lib/composite-frame.mjs'
);

// Espion : nombre de coffres dessinés PAR CHÂSSIS (méthode du renderer).
let moduleCoffreCount = 0;
const originalDrawMonoblocCoffre = MenuiserieRenderer.prototype.drawMonoblocCoffre;
MenuiserieRenderer.prototype.drawMonoblocCoffre = function spy(...args) {
  moduleCoffreCount += 1;
  return originalDrawMonoblocCoffre.apply(this, args);
};

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

const resetSpies = () => {
  moduleCoffreCount = 0;
  createdCanvases.length = 0;
};

const fillRectCalls = (canvas) =>
  canvas.context.calls.filter((call) => call.name === 'fillRect').map((call) => call.args);

/* ─── Cas de la photo : 3 colonnes × 2 rangées, soufflet en haut au centre ── */

const buildPhotoFrame = () => {
  let frame = createDefaultFrame(3500, 2250, 2, 1);
  const solved = solveFrame(frame);
  assert.equal(solved.ok, true);
  const { openings } = computeOpenings(frame, solved);
  assert.equal(openings.length, 6);

  // Soufflet dans la première ouverture de la rangée du haut au centre : on
  // prend simplement la deuxième ouverture ; le reste en fixe.
  openings.forEach((opening, index) => {
    frame = placeChassis(frame, opening.id, opening, {
      productId: index === 1 ? 'fenetre-soufflet' : 'fenetre-fixe',
      options: { colorOptionId: 'blanc' },
    });
  });

  frame.voletMonobloc = true;
  frame.voletMonoblocManoeuvre = 'radio';
  return frame;
};

run('espion : une menuiserie simple avec volet monobloc dessine bien UN coffre', () => {
  resetSpies();
  const rendered = renderMenuiserieToDataURL({
    id: 'simple',
    productId: 'fenetre-1v',
    sheetName: 'Fenêtre 1V',
    widthMm: 1200,
    heightMm: 1250,
    voletMonobloc: true,
    voletMonoblocManoeuvre: 'manuel',
  });

  assert.ok(rendered?.dataUrl);
  assert.equal(rendered.width, 1200);
  assert.equal(rendered.height, 1250);
  assert.equal(moduleCoffreCount, 1, 'le coffre d’une menuiserie simple passe par le renderer');
});

run('composé (ossature) avec volet monobloc : aucun coffre par châssis, un coffre global', () => {
  resetSpies();
  const frame = buildPhotoFrame();
  const rendered = renderMenuiserieToDataURL({
    id: 'compose',
    productId: 'chassis-compose',
    sheetName: 'Châssis composé',
    isComposite: true,
    compositeFrame: frame,
    widthMm: 3500,
    heightMm: 2250,
    // Copie du réglage du composé sur l'article : c'est ce champ qui fuyait
    // vers chaque châssis.
    voletMonobloc: true,
    voletMonoblocManoeuvre: 'radio',
  });

  assert.ok(rendered?.dataUrl);
  // Six châssis dessinés (six canvas de module + le canvas parent).
  assert.equal(createdCanvases.length, 7);
  assert.equal(moduleCoffreCount, 0, 'aucun châssis ne doit dessiner son propre coffre');

  // Coffre global : une bande sur TOUTE la largeur, au-dessus des châssis.
  const coffreH = Math.min(2250 * 0.06, 180);
  assert.equal(rendered.width, 3500);
  assert.equal(rendered.height, 2250 + coffreH);
  const parent = createdCanvases[0];
  assert.ok(
    fillRectCalls(parent).some(
      ([x, y, w, h]) => x === 0 && y === 0 && w === 3500 && h === coffreH
    ),
    'le coffre global couvre toute la largeur'
  );

  // Chaque châssis est posé sous le coffre, à sa place, à sa taille.
  const drawImages = parent.context.calls.filter((call) => call.name === 'drawImage');
  assert.equal(drawImages.length, 6);
  drawImages.forEach(({ args }) => {
    const [, , y] = args;
    assert.ok(y >= coffreH, 'un châssis ne remonte jamais dans le coffre');
  });
});

run('composé (ancien modèle en rangées) avec volet monobloc : aucun coffre par châssis', () => {
  resetSpies();
  const rendered = renderMenuiserieToDataURL({
    id: 'compose-legacy',
    productId: 'chassis-compose',
    sheetName: 'Châssis composé',
    isComposite: true,
    composition: [
      {
        id: 'row-1',
        modules: [
          { id: 'm-1', productId: 'fenetre-fixe', widthMm: 1000, heightMm: 2000 },
          { id: 'm-2', productId: 'fenetre-1v', widthMm: 1000, heightMm: 2000 },
        ],
      },
    ],
    voletMonobloc: true,
    voletMonoblocManoeuvre: 'manuel',
  });

  assert.ok(rendered?.dataUrl);
  assert.equal(moduleCoffreCount, 0);
  assert.equal(rendered.width, 2000);
  // Bande de coffre de l'ancien modèle : 60 × (2000 / 500).
  assert.equal(rendered.height, 2000 + 240);
});

run('constructeur partagé : un châssis de composé ne porte jamais de coffre', () => {
  const config = buildCompositeModuleConfig({
    module: {
      id: 'm',
      productId: 'fenetre-fixe',
      widthMm: 1166,
      heightMm: 1750,
      // Même si un ancien devis portait l'option au niveau du châssis.
      options: { voletMonobloc: true, voletMonoblocManoeuvre: 'radio' },
    },
    options: { voletMonobloc: true },
  });

  assert.equal(config.voletMonobloc, false);
  assert.equal(config.voletMonoblocManoeuvre, null);
  assert.equal(config.width, 1166);
  assert.equal(config.height, 1750);
});

/* ─── Traverse seule (24/09/2026) : même découpe que le soubassement, mais la
   partie basse reste vitrée. Espions sur les remplissages du renderer. ─── */

let pvcPanelCount = 0;
let glassCount = 0;
const originalDrawPVCPanel = MenuiserieRenderer.prototype.drawPVCPanel;
const originalDrawGlass = MenuiserieRenderer.prototype.drawGlass;
MenuiserieRenderer.prototype.drawPVCPanel = function spyPanel(...args) {
  pvcPanelCount += 1;
  return originalDrawPVCPanel.apply(this, args);
};
MenuiserieRenderer.prototype.drawGlass = function spyGlass(...args) {
  glassCount += 1;
  return originalDrawGlass.apply(this, args);
};

const renderSimpleWindow = (extra) => {
  pvcPanelCount = 0;
  glassCount = 0;
  createdCanvases.length = 0;
  return renderMenuiserieToDataURL({
    id: 'simple-traverse',
    productId: 'fenetre-1v',
    sheetName: 'Fenêtre 1V',
    widthMm: 1200,
    heightMm: 1250,
    ...extra,
  });
};

run('traverse seule : deux vitrages, aucun panneau plein', () => {
  const rendered = renderSimpleWindow({ hasTraverse: true, traverseHeight: 400 });
  assert.ok(rendered?.dataUrl);
  assert.equal(pvcPanelCount, 0, 'la partie basse reste vitrée');
  assert.ok(glassCount >= 2, `deux vitrages attendus (haut et bas), ${glassCount} dessinés`);
});

run('soubassement : un panneau plein en bas, un seul vitrage', () => {
  renderSimpleWindow({ hasSousBassement: true, sousBassementHeight: 400 });
  assert.equal(pvcPanelCount, 1);
  assert.equal(glassCount, 1);
});

run('les deux cochés : le soubassement a priorité sur la traverse seule', () => {
  renderSimpleWindow({
    hasSousBassement: true,
    sousBassementHeight: 400,
    hasTraverse: true,
    traverseHeight: 300,
  });
  assert.equal(pvcPanelCount, 1);
  assert.equal(glassCount, 1);
});

run('châssis de composé : la traverse seule suit les options du module', () => {
  const withTraverse = buildCompositeModuleConfig({
    module: {
      id: 'm',
      productId: 'fenetre-fixe',
      widthMm: 1166,
      heightMm: 1750,
      options: { hasTraverse: true, traverseHeight: 450 },
    },
    options: {},
  });
  assert.equal(withTraverse.traverse, 450);
  assert.equal(withTraverse.sousBassement, 0);

  const withBoth = buildCompositeModuleConfig({
    module: {
      id: 'm',
      productId: 'fenetre-fixe',
      widthMm: 1166,
      heightMm: 1750,
      options: { hasTraverse: true, traverseHeight: 450, hasSousBassement: true, sousBassementHeight: 400 },
    },
    options: {},
  });
  assert.equal(withBoth.traverse, 0);
  assert.equal(withBoth.sousBassement, 400);
});

console.log('Tous les tests de rendu PDF des châssis composés ont reussi.');
