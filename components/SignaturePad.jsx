'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Upload, X } from 'lucide-react';

/**
 * Pad de signature manuscrite + cachet d'entreprise importé, REPRIS du pad
 * de signature des devis (QuoteSignaturePage.jsx) : les tracés sont stockés
 * en coordonnées normalisées et recomposés à chaque rendu, le cachet importé
 * est dessiné SOUS la signature, et l'export produit un PNG transparent
 * rogné aux contours (exportTrimmedTransparentPng), exactement comme le
 * devis — le tampon serveur pdf-lib reçoit donc la même matière.
 *
 * `onChange(dataUrl|null)` est appelé à chaque évolution du contenu.
 */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const loadImageElement = (dataUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Impossible de charger l'image importée."));
    image.src = dataUrl;
  });

const getContainedImageRect = (image, width, height, padding = 14) => {
  const safeWidth = Math.max(1, width - padding * 2);
  const safeHeight = Math.max(1, height - padding * 2);
  const imageRatio = image.width / image.height || 1;
  const targetRatio = safeWidth / safeHeight || 1;

  let drawWidth = safeWidth;
  let drawHeight = safeHeight;
  if (imageRatio > targetRatio) {
    drawHeight = drawWidth / imageRatio;
  } else {
    drawWidth = drawHeight * imageRatio;
  }

  return {
    x: (width - drawWidth) / 2,
    y: (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };
};

const drawStroke = (context, stroke) => {
  if (!Array.isArray(stroke) || stroke.length === 0) return;

  if (stroke.length === 1) {
    const point = stroke[0];
    context.beginPath();
    context.arc(point.x, point.y, 1.4, 0, Math.PI * 2);
    context.fillStyle = '#0f172a';
    context.fill();
    return;
  }

  context.beginPath();
  context.moveTo(stroke[0].x, stroke[0].y);
  stroke.slice(1).forEach((point) => {
    context.lineTo(point.x, point.y);
  });
  context.stroke();
};

const exportTrimmedTransparentPng = (canvas, padding = 10) => {
  const context = canvas.getContext('2d');
  if (!context) return canvas.toDataURL('image/png');

  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (alpha === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return canvas.toDataURL('image/png');
  }

  const cropX = Math.max(0, minX - padding);
  const cropY = Math.max(0, minY - padding);
  const cropWidth = Math.min(width - cropX, maxX - minX + padding * 2 + 1);
  const cropHeight = Math.min(height - cropY, maxY - minY + padding * 2 + 1);
  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = cropWidth;
  trimmedCanvas.height = cropHeight;

  const trimmedContext = trimmedCanvas.getContext('2d');
  if (!trimmedContext) return canvas.toDataURL('image/png');

  trimmedContext.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return trimmedCanvas.toDataURL('image/png');
};

export default function SignaturePad({ onChange, height = 160 }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const drawingRef = useRef(false);
  const activeStrokeRef = useRef([]);
  const strokesRef = useRef([]);
  const stampImageRef = useRef(null);
  const [stampFileName, setStampFileName] = useState('');
  const [padError, setPadError] = useState('');
  const [isEmpty, setIsEmpty] = useState(true);

  const hasContent = () => Boolean(stampImageRef.current || strokesRef.current.length > 0);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.width / ratio;
    const canvasHeight = canvas.height / ratio;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, canvasHeight);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';
    context.lineWidth = 2.4;

    const projectPoint = (point) => ({ x: point.x * width, y: point.y * canvasHeight });

    if (stampImageRef.current) {
      const placement = getContainedImageRect(stampImageRef.current, width, canvasHeight);
      context.drawImage(stampImageRef.current, placement.x, placement.y, placement.width, placement.height);
    }

    strokesRef.current.forEach((stroke) => {
      drawStroke(context, stroke.map(projectPoint));
    });
    if (drawingRef.current && activeStrokeRef.current.length > 0) {
      drawStroke(context, activeStrokeRef.current.map(projectPoint));
    }
  }, []);

  // Export composé (cachet + tracés) en PNG transparent rogné, à la
  // définition du devis (jusqu'à 2,5× la densité d'écran).
  const emitChange = useCallback(() => {
    setIsEmpty(!hasContent());
    if (!hasContent()) {
      onChange?.(null);
      return;
    }

    const container = containerRef.current;
    const width = Math.max(320, Math.round(container?.clientWidth || 640));
    const exportHeight = Math.max(160, height);
    const ratio = Math.min(2.5, Math.max(window.devicePixelRatio || 1, 1));
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = Math.round(width * ratio);
    exportCanvas.height = Math.round(exportHeight * ratio);

    const context = exportCanvas.getContext('2d');
    if (!context) {
      onChange?.(null);
      return;
    }

    context.scale(ratio, ratio);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';
    context.lineWidth = 2.4;

    if (stampImageRef.current) {
      const placement = getContainedImageRect(stampImageRef.current, width, exportHeight);
      context.drawImage(stampImageRef.current, placement.x, placement.y, placement.width, placement.height);
    }

    const projectPoint = (point) => ({ x: point.x * width, y: point.y * exportHeight });
    strokesRef.current.forEach((stroke) => {
      drawStroke(context, stroke.map(projectPoint));
    });

    onChange?.(exportTrimmedTransparentPng(exportCanvas, Math.max(8, Math.round(12 * ratio))));
  }, [height, onChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(container.clientWidth * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      canvas.style.width = `${container.clientWidth}px`;
      canvas.style.height = `${height}px`;
      redrawCanvas();
    };

    resize();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    observer?.observe(container);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [height, redrawCanvas]);

  const getCanvasPoint = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  };

  const handlePointerDown = (event) => {
    const point = getCanvasPoint(event);
    if (!point) return;
    event.preventDefault();
    canvasRef.current?.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    activeStrokeRef.current = [point];
    setPadError('');
    setIsEmpty(false);
    redrawCanvas();
  };

  const handlePointerMove = (event) => {
    if (!drawingRef.current) return;
    const point = getCanvasPoint(event);
    if (!point) return;
    event.preventDefault();
    activeStrokeRef.current = [...activeStrokeRef.current, point];
    redrawCanvas();
  };

  const handlePointerUp = (event) => {
    if (!drawingRef.current) return;
    try {
      canvasRef.current?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer déjà relâché : ignoré.
    }
    drawingRef.current = false;
    if (activeStrokeRef.current.length > 0) {
      strokesRef.current = [...strokesRef.current, activeStrokeRef.current];
    }
    activeStrokeRef.current = [];
    redrawCanvas();
    emitChange();
  };

  const handleClearDrawing = () => {
    strokesRef.current = [];
    activeStrokeRef.current = [];
    drawingRef.current = false;
    setPadError('');
    redrawCanvas();
    emitChange();
  };

  const handleRemoveStamp = () => {
    stampImageRef.current = null;
    setStampFileName('');
    setPadError('');
    redrawCanvas();
    emitChange();
  };

  const handleImportStamp = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPadError('Le cachet importé doit être une image.');
      return;
    }

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error("Impossible de lire l'image importée."));
        reader.readAsDataURL(file);
      });

      stampImageRef.current = await loadImageElement(dataUrl);
      setStampFileName(file.name);
      setPadError('');
      redrawCanvas();
      emitChange();
    } catch (importError) {
      setPadError(importError.message || "Impossible d'importer l'image.");
    }
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImportStamp}
        className="hidden"
      />

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
        >
          <Upload size={14} />
          Importer un cachet
          <span className="text-slate-400">(optionnel)</span>
        </button>
        {stampFileName && (
          <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700">
            <span className="truncate">{stampFileName}</span>
            <button type="button" onClick={handleRemoveStamp} aria-label="Retirer le cachet" className="shrink-0">
              <X size={13} />
            </button>
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative w-full touch-none overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50"
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

      <div className="mt-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleClearDrawing}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          <Eraser size={13} />
          Effacer le tracé
        </button>
        {padError && <span className="text-xs font-semibold text-rose-600">{padError}</span>}
      </div>
    </div>
  );
}
