'use client';

import { useEffect, useMemo, useRef } from 'react';
import CompositeSVG from '@/components/CompositeSVG';
import CompositeFrameSVG from '@/components/CompositeFrameSVG';
import { MenuiserieRenderer } from '@/lib/MenuiserieRenderer';
import { buildMenuiserieConfig } from '@/lib/menuiserie';

/**
 * MenuiserieVisual Component
 * Renders a visual preview of a window, door, shutter, or composite frame.
 *
 * @param {Object} props
 * @param {string} props.sheetName - The sheet name from products.js.
 * @param {number} props.width - Width in mm.
 * @param {number} props.height - Height in mm.
 * @param {Object} props.options - Additional options.
 * @param {string} props.className - Tailwind classes for the container.
 */
export default function MenuiserieVisual({
  sheetName,
  width,
  height,
  options = {},
  className = '',
}) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const compositionSource = options.composition;
  const isComposite =
    Boolean(options.isComposite) &&
    Boolean(compositionSource) &&
    (Array.isArray(compositionSource)
      ? compositionSource.length > 0
      : Boolean(compositionSource.type));
  const isFrame = Boolean(options.compositeFrame); // modèle « ossature » v2

  const config = useMemo(() => {
    if (isComposite || isFrame) return null;

    return buildMenuiserieConfig({
      sheetName,
      width,
      height,
      options,
    });
  }, [sheetName, width, height, options, isComposite]);

  useEffect(() => {
    if (isComposite || isFrame) return;
    if (!canvasRef.current || !config) return;

    if (!rendererRef.current) {
      rendererRef.current = new MenuiserieRenderer(canvasRef.current);
    }

    canvasRef.current.width = config.width;
    canvasRef.current.height = config.height;
    rendererRef.current.draw(config);
  }, [config, isComposite]);

  if (isFrame) {
    return <CompositeFrameSVG frame={options.compositeFrame} className={className} />;
  }

  if (isComposite) {
    return (
      <CompositeSVG
        composition={compositionSource}
        frameColor={options.svgColor}
        voletMonobloc={options.voletMonobloc}
        voletMonoblocManoeuvre={options.voletMonoblocManoeuvre}
        className={className}
        selectedLeafId={options.selectedLeafId ?? null}
        onSelectLeaf={options.onSelectLeaf ?? null}
      />
    );
  }

  if (!sheetName) return null;

  return (
    <div className={`flex items-center justify-center overflow-hidden bg-slate-50/50 rounded-xl border border-slate-100 p-4 ${className}`}>
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full object-contain drop-shadow-md"
        style={{
          imageRendering: 'auto',
          aspectRatio: `${config?.width || 1} / ${config?.height || 1}`,
        }}
      />
    </div>
  );
}
