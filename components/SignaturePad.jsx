'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

/**
 * Pad de signature manuscrite (canvas), sur le même principe que celui du
 * devis (QuoteSignaturePage.jsx) mais en composant autonome et minimal :
 * pas de tampon/upload d'image, juste un tracé au doigt/souris exporté en
 * PNG transparent recadré.
 */
export default function SignaturePad({ onChange, height = 160 }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const isDrawingRef = useRef(false);
  const hasStrokeRef = useRef(false);
  const lastPointRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const getContext = useCallback(() => canvasRef.current?.getContext('2d') || null, []);

  // Redimensionne le canvas au ratio de l'écran pour un tracé net, sans
  // perdre le contenu déjà dessiné (recopie avant resize).
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const previous = canvas.toDataURL ? canvas.toDataURL('image/png') : null;

      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = getContext();
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a';

      if (previous && hasStrokeRef.current) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, width, height);
        img.src = previous;
      }
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [getContext, height]);

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    canvasRef.current?.setPointerCapture?.(event.pointerId);
    isDrawingRef.current = true;
    lastPointRef.current = getPoint(event);
  };

  const handlePointerMove = (event) => {
    if (!isDrawingRef.current) return;
    const ctx = getContext();
    const point = getPoint(event);
    const last = lastPointRef.current;
    if (ctx && last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    lastPointRef.current = point;
    hasStrokeRef.current = true;
    setIsEmpty(false);
  };

  const emitChange = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokeRef.current) {
      onChange?.(null);
      return;
    }
    onChange?.(canvas.toDataURL('image/png'));
  }, [onChange]);

  const handlePointerUp = (event) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    canvasRef.current?.releasePointerCapture?.(event.pointerId);
    emitChange();
  };

  const handleClear = () => {
    const ctx = getContext();
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    hasStrokeRef.current = false;
    setIsEmpty(true);
    onChange?.(null);
  };

  return (
    <div>
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 touch-none"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            Signez ici avec le doigt ou la souris
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handleClear}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"
      >
        <Eraser size={13} />
        Effacer
      </button>
    </div>
  );
}
