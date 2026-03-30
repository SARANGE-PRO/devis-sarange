'use client';

import { useEffect, useRef, useMemo } from 'react';
import { MenuiserieRenderer } from '@/lib/MenuiserieRenderer';

/**
 * MenuiserieVisual Component
 * Renders a visual preview of a window, door or shutter using the MenuiserieRenderer.
 * 
 * @param {Object} props
 * @param {string} props.sheetName - The sheet name from products.js (e.g., 'Fenêtre 1V')
 * @param {number} props.width - Width in mm
 * @param {number} props.height - Height in mm
 * @param {Object} props.options - Additional options (color, panneauDecoratif, etc.)
 * @param {string} props.className - Tailwind classes for the container
 */
export default function MenuiserieVisual({ 
  sheetName, 
  width, 
  height, 
  options = {}, 
  className = "" 
}) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);

  const config = useMemo(() => {
    if (!sheetName) return null;

    const w = parseInt(width) || 1200;
    const h = parseInt(height) || 1250;
    const type = sheetName.startsWith('Volet') ? 'volet' : (sheetName.includes('Coulissant') ? 'coulissant' : 'frappe');
    
    let sashes = [];
    let panelType = null;
    let solarPanel = false;

    if (type === 'volet') {
      solarPanel = options.productId === 'volet-solaire';
    } else if (sheetName.startsWith('Porte Entrée')) {
      sashes = [{ ratio: 1, symbols: ['triangle-right'], handle: 'right' }];
      if (options.panneauDecoratif) {
        panelType = 'deco';
      }
    } else if (sheetName === 'Fenêtre 1V' || sheetName === 'Porte-Fenêtre 1V') {
      sashes = [{ ratio: 1, symbols: ['triangle-left'], handle: 'left' }];
    } else if (sheetName === 'Fenêtre 2V' || sheetName === 'Porte-Fenêtre 2V') {
      sashes = [
        { ratio: 0.5, symbols: ['triangle-right'], handle: null },
        { ratio: 0.5, symbols: ['triangle-left'], handle: 'left' }
      ];
    } else if (sheetName === 'Fenêtre 3V') {
      sashes = [
        { ratio: 0.33, symbols: ['triangle-right'], handle: null },
        { ratio: 0.33, symbols: ['triangle-left'], handle: 'left' },
        { ratio: 0.34, symbols: ['triangle-left'], handle: 'left' }
      ];
    } else if (sheetName === 'Fenêtre 4V') {
      sashes = [
        { ratio: 0.25, symbols: ['triangle-right'], handle: null },
        { ratio: 0.25, symbols: ['triangle-left'], handle: 'left' },
        { ratio: 0.25, symbols: ['triangle-right'], handle: null },
        { ratio: 0.25, symbols: ['triangle-left'], handle: 'left' }
      ];
    } else if (sheetName === 'Fenêtre 2V+1F' || sheetName === 'Porte-Fenêtre 2V+1F') {
      sashes = [
        { ratio: 0.33, symbols: [], handle: null }, // Fixe
        { ratio: 0.33, symbols: ['triangle-right'], handle: null },
        { ratio: 0.34, symbols: ['triangle-left'], handle: 'left' }
      ];
    } else if (sheetName === 'Fenêtre 2V+2F' || sheetName === 'Porte-Fenêtre 2V+2F') {
      sashes = [
        { ratio: 0.25, symbols: [], handle: null },
        { ratio: 0.25, symbols: ['triangle-right'], handle: null },
        { ratio: 0.25, symbols: ['triangle-left'], handle: 'left' },
        { ratio: 0.25, symbols: [], handle: null }
      ];
    } else if (sheetName === 'Fenêtre Fixe') {
      sashes = [{ ratio: 1, symbols: ['cross'], handle: null }];
    } else if (sheetName === 'Fenêtre Soufflet') {
      sashes = [{ ratio: 1, symbols: ['triangle-up'], handle: 'top' }];
    } else if (sheetName === 'Coulissant 2 vantaux 2 rails') {
      sashes = [
        { ratio: 0.5, symbols: ['arrow-right-outline'], handle: 'left' },
        { ratio: 0.5, symbols: ['arrow-left'], handle: 'right' }
      ];
    }

    // Apply sash options (OB and Ventilation)
    if (options.sashOptions) {
      sashes = sashes.map((sash, index) => {
        const opts = options.sashOptions[index];
        if (!opts) return sash;
        
        const newSash = { ...sash };
        if (opts.ob && !newSash.symbols.includes('triangle-up')) {
          newSash.symbols = [...newSash.symbols, 'triangle-up'];
        }
        if (opts.vent) {
          newSash.hasVentilation = true;
        }
        return newSash;
      });
    }

    // Invert visual direction if requested
    if (options.openingDirection === 'inverse') {
      sashes = sashes.slice().reverse().map(sash => {
        const newSash = { ...sash };
        if (newSash.handle === 'left') newSash.handle = 'right';
        else if (newSash.handle === 'right') newSash.handle = 'left';
        
        newSash.symbols = newSash.symbols.map(sym => {
          if (sym === 'triangle-left') return 'triangle-right';
          if (sym === 'triangle-right') return 'triangle-left';
          if (sym === 'arrow-left') return 'arrow-right';
          if (sym === 'arrow-right-outline') return 'arrow-left-outline';
          return sym;
        });
        return newSash;
      });
    }

    // Color mapping
    let frameColor = options.svgColor || '#FFFFFF';


    return {
      width: w,
      height: h,
      type,
      sashes,
      panelType,
      solarPanel,
      frameColor,
      sousBassement: options.hasSousBassement ? options.sousBassementHeight : 0
    };
  }, [sheetName, width, height, options]);

  useEffect(() => {
    if (canvasRef.current && config) {
      if (!rendererRef.current) {
        rendererRef.current = new MenuiserieRenderer(canvasRef.current);
      }
      
      // Update canvas dimensions to match internal resolution (1mm = 1px)
      canvasRef.current.width = config.width;
      canvasRef.current.height = config.height;
      
      rendererRef.current.draw(config);
    }
  }, [config]);

  if (!sheetName) return null;

  return (
    <div className={`flex items-center justify-center overflow-hidden bg-slate-50/50 rounded-xl border border-slate-100 p-4 ${className}`}>
      <canvas 
        ref={canvasRef} 
        className="max-w-full max-h-full object-contain drop-shadow-md"
        style={{ 
          imageRendering: 'auto',
          aspectRatio: `${config?.width || 1} / ${config?.height || 1}`
        }}
      />
    </div>
  );
}
