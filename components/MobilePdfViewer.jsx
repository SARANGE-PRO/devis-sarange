'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, ZoomIn, ZoomOut } from 'lucide-react';

/**
 * Visionneuse PDF en SCROLL VERTICAL CONTINU : toutes les pages sont rendues les unes
 * sous les autres (pas de pagination suivant/précédent), via pdfjs-dist sur des canvases.
 * Repli sur un lien de téléchargement si le rendu échoue.
 */
export default function MobilePdfViewer({
  url,
  title = 'Document PDF',
  heightClass = 'h-[70vh]',
}) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');
  const [viewportWidth, setViewportWidth] = useState(0);
  const scrollRef = useRef(null);
  const canvasRefs = useRef([]);
  // Tâches de rendu pdf.js en cours, une par page : permet d'annuler un rendu
  // encore actif avant d'en relancer un sur le même canvas (zoom, redimensionnement,
  // double-invocation des effets en dev) — sinon pdf.js lève « same canvas… ».
  const renderTasksRef = useRef([]);

  // --- Chargement du document -------------------------------------------------
  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;

    const loadPdf = async () => {
      setLoading(true);
      setError('');
      try {
        const pdfjsLib = await import('pdfjs-dist');
        if (typeof window !== 'undefined') {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        }
        const loadingTask = pdfjsLib.getDocument({
          url,
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
          cMapPacked: true,
        });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        canvasRefs.current = [];
        renderTasksRef.current = [];
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch (err) {
        if (!cancelled) {
          console.error('PDF loading error:', err);
          setError('Impossible de charger le PDF. Essayez de le télécharger directement.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadPdf();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // --- Largeur du conteneur (recalcul au redimensionnement) -------------------
  useEffect(() => {
    const measure = () => {
      if (scrollRef.current) setViewportWidth(scrollRef.current.clientWidth);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [loading]);

  // --- Rendu de TOUTES les pages, empilées ------------------------------------
  useEffect(() => {
    if (!pdfDoc || !numPages || !viewportWidth) return undefined;
    let cancelled = false;
    const tasks = renderTasksRef.current;

    const renderAll = async () => {
      setRendering(true);
      const targetWidth = Math.min(viewportWidth - 32, 860);
      const dpr = window.devicePixelRatio || 1;
      for (let i = 1; i <= numPages; i += 1) {
        if (cancelled) return;
        try {
          const page = await pdfDoc.getPage(i);
          if (cancelled) return;
          const canvas = canvasRefs.current[i - 1];
          if (!canvas) continue;

          // Annule un éventuel rendu encore en cours sur CE canvas et attend sa
          // fin réelle avant d'en relancer un (évite le rendu concurrent).
          const previous = tasks[i - 1];
          if (previous) {
            try {
              previous.cancel();
            } catch {
              /* déjà terminé */
            }
            try {
              await previous.promise;
            } catch {
              /* annulation attendue */
            }
            if (cancelled) return;
          }

          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          const base = page.getViewport({ scale: 1 });
          const fit = (targetWidth / base.width) * scale;
          const vp = page.getViewport({ scale: fit });
          canvas.width = Math.round(vp.width * dpr);
          canvas.height = Math.round(vp.height * dpr);
          canvas.style.width = `${Math.round(vp.width)}px`;
          canvas.style.height = `${Math.round(vp.height)}px`;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

          const task = page.render({ canvasContext: ctx, viewport: vp });
          tasks[i - 1] = task;
          await task.promise;
        } catch (err) {
          if (err?.name !== 'RenderingCancelledException') {
            console.error('PDF render error:', err);
          }
        }
      }
      if (!cancelled) setRendering(false);
    };

    void renderAll();
    return () => {
      cancelled = true;
      // Annule tous les rendus encore actifs au démontage / re-rendu.
      tasks.forEach((task) => {
        if (task) {
          try {
            task.cancel();
          } catch {
            /* déjà terminé */
          }
        }
      });
    };
  }, [pdfDoc, numPages, scale, viewportWidth]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 size={28} className="animate-spin text-orange-500" />
        <p className="text-sm text-slate-500">Chargement du document…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
        >
          <Download size={16} />
          Télécharger le PDF
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Barre d'outils : zoom + téléchargement (aucune pagination) */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          {numPages} page{numPages > 1 ? 's' : ''}
          {rendering ? ' · rendu…' : ''}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(s - 0.2, 0.6))}
            disabled={scale <= 0.6}
            className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-200 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700"
            aria-label="Dézoomer"
          >
            <ZoomOut size={16} />
          </button>
          <span className="min-w-[40px] text-center text-xs font-medium text-slate-500 dark:text-slate-400">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(s + 0.2, 2.5))}
            disabled={scale >= 2.5}
            className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-200 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700"
            aria-label="Zoomer"
          >
            <ZoomIn size={16} />
          </button>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
          aria-label="Télécharger"
        >
          <Download size={16} />
        </a>
      </div>

      {/* Zone de défilement vertical continu */}
      <div
        ref={scrollRef}
        aria-label={title}
        className={`overflow-y-auto bg-slate-100 p-4 dark:bg-slate-900 ${heightClass}`}
      >
        <div className="mx-auto flex flex-col items-center gap-4">
          {Array.from({ length: numPages }).map((_, i) => (
            <canvas
              key={i}
              ref={(el) => {
                canvasRefs.current[i] = el;
              }}
              className="block max-w-full rounded bg-white shadow-lg"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
