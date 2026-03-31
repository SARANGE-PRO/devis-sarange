/**
 * MenuiserieRenderer Class
 * Handles drawing windows, doors, and shutters on a HTML5 Canvas.
 */
const normalizeHexColor = (value = '') => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('#')) return null;
  if (trimmed.length === 4) {
    return `#${trimmed
      .slice(1)
      .split('')
      .map((character) => character + character)
      .join('')}`;
  }
  return trimmed.length === 7 ? trimmed : null;
};

const isLightColor = (value) => {
  const normalized = normalizeHexColor(value);
  if (!normalized) return false;

  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance >= 0.85;
};

const resolvePetitBoisColor = (frameColor) =>
  isLightColor(frameColor) ? '#CBD5E1' : frameColor || '#4A4A4A';

export class MenuiserieRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    this.colors = {
      frame: '#FFFFFF',
      frameBorder: '#4A4A4A',
      glass: '#9BDBFE',
      glassBorder: '#666666',
      symbol: '#FF0000',
      shutterBox: '#F0F0F0',
      shutterSlat: '#EAEAEA',
      handle: '#E5E5E5',
      petitsBois: '#CBD5E1'
    };
    
    this.scaleFactor = 1;
    this.metrics = {};
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // Initialise les dimensions dynamiques (1mm = 1px interne, échelle relative pour les traits)
  updateScale(width, height) {
    const maxDim = Math.max(width, height);
    this.scaleFactor = maxDim / 500; 

    this.metrics = {
      outerFrameThick: 12 * this.scaleFactor,
      sashFrameThick: 18 * this.scaleFactor,
      shutterBoxHeight: 60 * this.scaleFactor,
      slatHeight: 8 * this.scaleFactor,
      railWidth: 8 * this.scaleFactor,
      traverseThick: 12 * this.scaleFactor,
      gap: 2 * this.scaleFactor,
      mGap: 6 * this.scaleFactor
    };
  }

  draw(config) {
    const { width, height, sashes, type = 'frappe', globalSymbols, solarPanel, frameColor } = config;
    
    // Application de la couleur du profilé si définie, sinon blanc par défaut
    if (frameColor) {
      this.colors.frame = frameColor;
    } else {
      this.colors.frame = '#FFFFFF';
    }
    this.colors.petitsBois = resolvePetitBoisColor(this.colors.frame);

    this.updateScale(width, height);
    this.clear();

    // --- RENDU SPÉCIFIQUE : VOLET ROULANT SEUL ---
    if (type === 'volet') {
      this.drawStandaloneShutter(0, 0, width, height, { ...config, solarPanel });
      return;
    }

    // --- RENDU STANDARD : FENÊTRE / PORTE ---
    let currentY = 0;
    let availableHeight = height;

    // 1. Cadre dormant (extérieur)
    this.drawRect(0, currentY, width, availableHeight, this.colors.frame, this.colors.frameBorder, 1);
    
    const innerX = this.metrics.outerFrameThick;
    const innerY = currentY + this.metrics.outerFrameThick;
    const innerW = width - (this.metrics.outerFrameThick * 2);
    const innerH = availableHeight - (this.metrics.outerFrameThick * 2);

    // 2. Vantaux
    if (sashes && sashes.length > 0) {
      let currentX = innerX;
      
      sashes.forEach((sash, index) => {
        const sashWidth = innerW * (sash.ratio || (1 / sashes.length));
        
        if (type === 'coulissant') {
          this.drawSlidingSash(currentX, innerY, sashWidth, innerH, sash, index, sashes.length, config);
        } else {
          this.drawCasementSash(currentX, innerY, sashWidth, innerH, sash, config);
        }
        
        currentX += sashWidth;
      });
    } else {
      this.drawGlassWithPetitsBois(innerX, innerY, innerW, innerH, config);
    }

    // 3. Symboles globaux
    if (globalSymbols) {
      globalSymbols.forEach(symbol => {
        this.drawSymbol(innerX, innerY, innerW, innerH, symbol);
      });
    }
  }

  drawStandaloneShutter(x, y, w, h, config) {
    this.drawRect(x, y, w, h, null, this.colors.frameBorder, 1);
    
    const boxH = this.metrics.shutterBoxHeight;
    this.drawRect(x, y, w, boxH, this.colors.frame, this.colors.frameBorder, 1);
    
    if (config.solarPanel) {
      const spW = 35 * this.scaleFactor;
      const spH = 12 * this.scaleFactor;
      const spX = x + 20 * this.scaleFactor;
      const spY = y + 15 * this.scaleFactor;
      this.drawRect(spX, spY, spW, spH, '#333333', null, 0);
    }

    const rw = this.metrics.railWidth;
    this.drawRect(x, y + boxH, rw, h - boxH, this.colors.frame, this.colors.frameBorder, 1);
    this.drawRect(x + w - rw, y + boxH, rw, h - boxH, this.colors.frame, this.colors.frameBorder, 1);

    const slatsX = x + rw;
    const slatsY = y + boxH;
    const slatsW = w - (rw * 2);
    const slatsH = h - boxH;
    
    this.drawRect(slatsX, slatsY, slatsW, slatsH, this.colors.frame, this.colors.frameBorder, 1);
    
    this.ctx.beginPath();
    this.ctx.strokeStyle = '#999999';
    this.ctx.lineWidth = 0.5 * this.scaleFactor;
    for (let i = slatsY + this.metrics.slatHeight; i < y + h; i += this.metrics.slatHeight) {
      this.ctx.moveTo(slatsX, i);
      this.ctx.lineTo(slatsX + slatsW, i);
    }
    this.ctx.stroke();
  }

  drawCasementSash(x, y, w, h, sash, config) {
    this.drawRect(x, y, w, h, this.colors.frame, this.colors.frameBorder, 1);
    
    const gap = this.metrics.gap;
    this.drawRect(x + gap, y + gap, w - gap*2, h - gap*2, this.colors.frame, this.colors.frameBorder, 0.5);

    const glassX = x + gap + this.metrics.sashFrameThick;
    const glassY = y + gap + this.metrics.sashFrameThick;
    const glassW = w - (gap*2) - (this.metrics.sashFrameThick * 2);
    const glassH = h - (gap*2) - (this.metrics.sashFrameThick * 2);

    const isDecoPanel = config.panelType === 'deco';
    const isOpaquePanel = config.panelType === 'sandwich';

    if (isDecoPanel) {
      // 1. Panneau opaque plein
      this.drawRect(glassX, glassY, glassW, glassH, this.colors.frame, this.colors.frameBorder, 1);
      
      // 2. Décorations (Vitrage incurvé style photo)
      this.drawDecoCutouts(glassX, glassY, glassW, glassH);
    } else {
      // --- Gestion du Sous-bassement Classique ---
      const sbHeight = config.sousBassement || 0;
      const validSbHeight = Math.min(sbHeight, glassH - (40 * this.scaleFactor));

      if (validSbHeight > 0) {
        const traverseThick = this.metrics.traverseThick;
        const topGlassH = glassH - validSbHeight - traverseThick;
        const sbY = glassY + topGlassH + traverseThick;

        // 1. Vitrage supérieur
        if (isOpaquePanel) {
          this.drawPVCPanel(glassX, glassY, glassW, topGlassH);
        } else {
          this.drawGlassWithPetitsBois(glassX, glassY, glassW, topGlassH, config);
        }
        
        // 2. Traverse (séparation)
        this.drawRect(glassX, glassY + topGlassH, glassW, traverseThick, this.colors.frame, this.colors.frameBorder, 1);
        
        // 3. Panneau opaque bas
        this.drawPVCPanel(glassX, sbY, glassW, validSbHeight);
      } else {
        // Plein vitrage
        if (isOpaquePanel) {
          this.drawPVCPanel(glassX, glassY, glassW, glassH);
        } else {
          this.drawGlassWithPetitsBois(glassX, glassY, glassW, glassH, config);
        }
      }
    }

    // Les symboles sont dessinés PAR-DESSUS et englobent le vantail entier (x, y, w, h)
    if (sash.symbols) {
      sash.symbols.forEach(symbol => {
        this.drawSymbol(x, y, w, h, symbol);
      });
    }

    // Pas de grille de ventilation sur un panneau déco complet
    if (sash.hasVentilation && !isDecoPanel && !isOpaquePanel) {
      this.drawVentilationGrid(x, y, w);
    }

    if (sash.handle) {
      if (isDecoPanel) {
        this.drawDoorHandle(x, y, w, h, sash.handle);
      } else {
        this.drawHandle(x, y, w, h, sash.handle);
      }
    }
  }

  // Fonction spécifique pour dessiner le panneau décoratif de la porte
  drawDecoCutouts(x, y, w, h) {
    const rectW = w * 0.3;
    const rectX = x + w * 0.15; // Alignées sur la gauche
    const startY = y + h * 0.15;
    const blockH = h * 0.2;
    const gap = h * 0.05;

    for(let i=0; i<3; i++) {
        const currentY = startY + i * (blockH + gap);
        // Léger décalage horizontal pour simuler une courbe
        const shiftX = (i === 1) ? -(w * 0.05) : 0; 
        
        // Bloc Vitré
        this.drawRect(rectX + shiftX, currentY, rectW, blockH, this.colors.glass, this.colors.frameBorder, 1);
        
        // Inserts métalliques de séparation (entre les blocs vitrés)
        if (i < 2) {
            this.drawRect(rectX + shiftX, currentY + blockH + (gap*0.1), rectW, gap*0.8, '#A0A0A0', this.colors.frameBorder, 1);
        }
    }
  }

  drawSlidingSash(x, y, w, h, sash, index, totalSashes, config) {
    const overlap = 10 * this.scaleFactor;
    let adjustedX = x;
    let adjustedW = w;
    
    if (index > 0) {
      adjustedX -= overlap;
      adjustedW += overlap;
    } else if (index === 0 && totalSashes > 1) {
      adjustedW += overlap;
    }

    this.drawRect(adjustedX, y, adjustedW, h, this.colors.frame, this.colors.frameBorder, 1);
    
    const glassX = adjustedX + this.metrics.sashFrameThick;
    const glassY = y + this.metrics.sashFrameThick;
    const glassW = adjustedW - (this.metrics.sashFrameThick * 2);
    const glassH = h - (this.metrics.sashFrameThick * 2);
    const isOpaquePanel = config.panelType === 'sandwich';

    // --- Gestion du Sous-bassement ---
    const sbHeight = config.sousBassement || 0;
    const validSbHeight = Math.min(sbHeight, glassH - (40 * this.scaleFactor));

    if (validSbHeight > 0) {
      const traverseThick = this.metrics.traverseThick;
      const topGlassH = glassH - validSbHeight - traverseThick;
      const sbY = glassY + topGlassH + traverseThick;

      if (isOpaquePanel) {
        this.drawPVCPanel(glassX, glassY, glassW, topGlassH);
      } else {
        this.drawGlassWithPetitsBois(glassX, glassY, glassW, topGlassH, config);
      }
      this.drawRect(glassX, glassY + topGlassH, glassW, traverseThick, this.colors.frame, this.colors.frameBorder, 1);
      this.drawPVCPanel(glassX, sbY, glassW, validSbHeight);
    } else {
      if (isOpaquePanel) {
        this.drawPVCPanel(glassX, glassY, glassW, glassH);
      } else {
        this.drawGlassWithPetitsBois(glassX, glassY, glassW, glassH, config);
      }
    }

    if (sash.symbols) {
      sash.symbols.forEach(symbol => {
        this.drawSymbol(glassX, glassY, glassW, glassH, symbol);
      });
    }

    if (sash.handle) {
      this.drawHandle(adjustedX, y, adjustedW, h, sash.handle, true);
    }
  }

  drawVentilationGrid(x, y, w) {
    const gridW = Math.min(100 * this.scaleFactor, w - 20 * this.scaleFactor);
    const gridH = 10 * this.scaleFactor;
    const gridX = x + (w / 2) - (gridW / 2);
    const gridY = y + 4 * this.scaleFactor;

    this.drawRect(gridX, gridY, gridW, gridH, '#FFFFFF', '#666666', 1);

    this.ctx.beginPath();
    this.ctx.strokeStyle = '#333333';
    this.ctx.lineWidth = 1 * this.scaleFactor;
    const step = 3 * this.scaleFactor;
    for (let i = gridY + step; i < gridY + gridH - step/2; i += step) {
      this.ctx.moveTo(gridX + 4 * this.scaleFactor, i);
      this.ctx.lineTo(gridX + gridW - 4 * this.scaleFactor, i);
    }
    this.ctx.stroke();
  }

  drawGlass(x, y, w, h) {
    this.drawRect(x, y, w, h, this.colors.glass, this.colors.glassBorder, 1);
  }

  drawGlassWithPetitsBois(x, y, w, h, config) {
    this.drawGlass(x, y, w, h);
    this.drawPetitsBoisLines(x, y, w, h, config);
  }

  drawPetitsBoisLines(x, y, w, h, config = {}) {
    if (w <= 0 || h <= 0) return;

    const horizontalCount = Math.max(
      0,
      Number.parseInt(config.petitsBoisH, 10) || 0
    );
    const verticalCount = Math.max(
      0,
      Number.parseInt(config.petitsBoisV, 10) || 0
    );

    if (horizontalCount === 0 && verticalCount === 0) return;

    this.ctx.beginPath();
    this.ctx.strokeStyle = this.colors.petitsBois;
    this.ctx.lineWidth = Math.max(2, 4 * this.scaleFactor);

    if (horizontalCount > 0) {
      const horizontalSpacing = h / (horizontalCount + 1);
      for (let index = 1; index <= horizontalCount; index += 1) {
        const lineY = y + horizontalSpacing * index;
        this.ctx.moveTo(x, lineY);
        this.ctx.lineTo(x + w, lineY);
      }
    }

    if (verticalCount > 0) {
      const verticalSpacing = w / (verticalCount + 1);
      for (let index = 1; index <= verticalCount; index += 1) {
        const lineX = x + verticalSpacing * index;
        this.ctx.moveTo(lineX, y);
        this.ctx.lineTo(lineX, y + h);
      }
    }

    this.ctx.stroke();
  }

  drawPVCPanel(x, y, w, h) {
    this.drawRect(x, y, w, h, '#FFFFFF', this.colors.frameBorder, 1);

    const mGap = Math.min(this.metrics.mGap, h / 2, w / 2);
    if (w > mGap * 2 && h > mGap * 2) {
      this.drawRect(x + mGap, y + mGap, w - mGap * 2, h - mGap * 2, null, '#CCCCCC', 1);
    }
  }

  drawSymbol(x, y, w, h, type) {
    this.ctx.beginPath();
    this.ctx.strokeStyle = this.colors.symbol;
    this.ctx.lineWidth = 2.5 * this.scaleFactor;

    switch (type) {
      case 'cross': // Vitrage fixe (X)
        this.ctx.moveTo(x, y); this.ctx.lineTo(x + w, y + h);
        this.ctx.moveTo(x, y + h); this.ctx.lineTo(x + w, y);
        break;
      case 'triangle-left': // Poignée à GAUCHE (<)
        this.ctx.moveTo(x + w, y); this.ctx.lineTo(x, y + h / 2); this.ctx.lineTo(x + w, y + h);
        break;
      case 'triangle-right': // Poignée à DROITE (>)
        this.ctx.moveTo(x, y); this.ctx.lineTo(x + w, y + h / 2); this.ctx.lineTo(x, y + h);
        break;
      case 'triangle-up': // Oscillo (^)
        this.ctx.moveTo(x, y + h); this.ctx.lineTo(x + w / 2, y); this.ctx.lineTo(x + w, y + h);
        break;
      case 'triangle-down': // Tombant (v)
        this.ctx.moveTo(x, y); this.ctx.lineTo(x + w / 2, y + h); this.ctx.lineTo(x + w, y);
        break;
      case 'arrow-left':
        this.drawArrow(x + w / 2 + 20 * this.scaleFactor, y + h / 2, -40 * this.scaleFactor, 0, true);
        break;
      case 'arrow-right':
        this.drawArrow(x + w / 2 - 20 * this.scaleFactor, y + h / 2, 40 * this.scaleFactor, 0, true);
        break;
      case 'arrow-right-outline':
        this.drawArrow(x + w / 2 - 20 * this.scaleFactor, y + h / 2, 40 * this.scaleFactor, 0, false);
        break;
      case 'arrow-left-outline':
        this.drawArrow(x + w / 2 + 20 * this.scaleFactor, y + h / 2, -40 * this.scaleFactor, 0, false);
        break;
    }
    this.ctx.stroke();
  }

  drawArrow(x, y, dx, dy, filled) {
    const headlen = 12 * this.scaleFactor; 
    const angle = Math.atan2(dy, dx);
    const endX = x + dx;
    const endY = y + dy;
    
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(endX, endY);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(endX, endY);
    this.ctx.lineTo(endX - headlen * Math.cos(angle - Math.PI / 6), endY - headlen * Math.sin(angle - Math.PI / 6));
    this.ctx.lineTo(endX - headlen * Math.cos(angle + Math.PI / 6), endY - headlen * Math.sin(angle + Math.PI / 6));
    this.ctx.lineTo(endX, endY);
    
    if (filled) {
      this.ctx.fillStyle = this.colors.symbol;
      this.ctx.fill();
    } else {
      this.ctx.fillStyle = this.colors.glass;
      this.ctx.fill();
      this.ctx.stroke();
    }
  }

  drawHandle(sashX, sashY, sashW, sashH, position, isSliding = false) {
    const w = (isSliding ? 6 : 8) * this.scaleFactor;
    const h = (isSliding ? 40 : 35) * this.scaleFactor;
    let x, y;

    const offset = (isSliding ? 6 : 8) * this.scaleFactor;

    if (position === 'left') {
      x = sashX + offset;
      y = sashY + sashH / 2 - h / 2;
    } else if (position === 'right') {
      x = sashX + sashW - w - offset;
      y = sashY + sashH / 2 - h / 2;
    } else if (position === 'top') {
      x = sashX + sashW / 2 - h / 2;
      y = sashY + 14 * this.scaleFactor;
      this.drawRect(x, y, h, w, this.colors.handle, '#999', 1);
      return; 
    }

    this.drawRect(x, y, w, h, this.colors.handle, '#999', 1);
  }

  // Poignée spécifique (Barre de tirage + Serrure) pour Porte d'Entrée
  drawDoorHandle(sashX, sashY, sashW, sashH, position) {
    const barW = 10 * this.scaleFactor;
    const barH = 200 * this.scaleFactor;
    let x, y;
    const offset = 25 * this.scaleFactor;

    if (position === 'left') {
      x = sashX + offset;
      y = sashY + sashH / 2 - barH / 2;
    } else {
      x = sashX + sashW - barW - offset;
      y = sashY + sashH / 2 - barH / 2;
    }

    // 1. Barre de tirage verticale
    this.drawRect(x, y, barW, barH, this.colors.handle, '#666', 1);
    
    // Fixations horizontales
    const fixW = 15 * this.scaleFactor;
    const fixH = 8 * this.scaleFactor;
    const fixX = (position === 'left') ? x - fixW : x + barW;
    this.drawRect(fixX, y + barH * 0.15, fixW, fixH, this.colors.handle, '#666', 1);
    this.drawRect(fixX, y + barH * 0.85, fixW, fixH, this.colors.handle, '#666', 1);

    // 2. Serrure (Cylindre / Barillet)
    const cylW = 14 * this.scaleFactor;
    const cylH = 22 * this.scaleFactor;
    const cylX = (position === 'left') ? x + barW + 15 * this.scaleFactor : x - cylW - 15 * this.scaleFactor;
    const cylY = sashY + sashH / 2 - cylH / 2;

    this.ctx.beginPath();
    this.ctx.arc(cylX + cylW/2, cylY + cylW/2, cylW/2, 0, Math.PI, true);
    this.ctx.lineTo(cylX + cylW, cylY + cylH);
    this.ctx.lineTo(cylX, cylY + cylH);
    this.ctx.closePath();
    this.ctx.fillStyle = '#E5E5E5';
    this.ctx.fill();
    this.ctx.stroke();
    
    this.ctx.beginPath();
    this.ctx.arc(cylX + cylW/2, cylY + cylW/2, cylW/6, 0, Math.PI*2);
    this.ctx.fillStyle = '#333';
    this.ctx.fill();
  }

  drawRect(x, y, w, h, fill, stroke, lineWidth) {
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    if (fill) {
      this.ctx.fillStyle = fill;
      this.ctx.fill();
    }
    if (stroke) {
      this.ctx.lineWidth = (lineWidth || 1) * this.scaleFactor;
      this.ctx.strokeStyle = stroke;
      this.ctx.stroke();
    }
  }
}
