'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

/**
 * Mobile-friendly PDF viewer that renders PDF pages to canvas elements.
 * Uses pdfjs-dist for cross-browser/cross-platform PDF rendering.
 * Falls back to a download link if rendering fails.
 */
export default function MobilePdfViewer({ url, title = 'Document PDF' }) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pageRendering, setPageRendering] = useState(false);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);

  // Load PDF document
  useEffect(() => {
    if (!url) return;

    let cancelled = false;

    const loadPdf = async () => {
      setLoading(true);
      setError('');

      try {
        const pdfjsLib = await import('pdfjs-dist');

        // Configure worker
        if (typeof window !== 'undefined') {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
        }

        const loadingTask = pdfjsLib.getDocument({
          url,
          cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/cmaps/`,
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;

        if (cancelled) return;

        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(1);
      } catch (err) {
        if (!cancelled) {
          console.error('PDF loading error:', err);
          setError("Impossible de charger le PDF. Essayez de le télécharger directement.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadPdf();

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Render current page
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    setPageRendering(true);

    try {
      // Cancel any pending render
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }

      const page = await pdfDoc.getPage(currentPage);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      // Calculate scale to fit container width
      const container = containerRef.current;
      const containerWidth = container ? container.clientWidth - 16 : 360;
      const viewport = page.getViewport({ scale: 1 });
      const baseScale = containerWidth / viewport.width;
      const finalScale = baseScale * scale;
      const scaledViewport = page.getViewport({ scale: finalScale });

      // Set canvas dimensions with device pixel ratio for sharpness
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(scaledViewport.width * dpr);
      canvas.height = Math.round(scaledViewport.height * dpr);
      canvas.style.width = `${Math.round(scaledViewport.width)}px`;
      canvas.style.height = `${Math.round(scaledViewport.height)}px`;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const renderTask = page.render({
        canvasContext: context,
        viewport: scaledViewport,
      });

      renderTaskRef.current = renderTask;
      await renderTask.promise;
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('PDF render error:', err);
      }
    } finally {
      setPageRendering(false);
    }
  }, [pdfDoc, currentPage, scale]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  const goToPrev = () => {
    if (currentPage > 1) setCurrentPage((p) => p - 1);
  };

  const goToNext = () => {
    if (currentPage < totalPages) setCurrentPage((p) => p + 1);
  };

  const zoomIn = () => {
    setScale((s) => Math.min(s + 0.25, 3));
  };

  const zoomOut = () => {
    setScale((s) => Math.max(s - 0.25, 0.5));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 size={28} className="animate-spin text-orange-300" />
        <p className="text-sm text-slate-400">Chargement du document...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
        <p className="text-sm text-red-300">{error}</p>
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
    <div className="flex flex-col" ref={containerRef}>
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToPrev}
            disabled={currentPage <= 1}
            className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-200 disabled:opacity-30"
            aria-label="Page précédente"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[80px] text-center text-xs font-semibold text-slate-700">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={goToNext}
            disabled={currentPage >= totalPages}
            className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-200 disabled:opacity-30"
            aria-label="Page suivante"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-200 disabled:opacity-30"
            aria-label="Dézoomer"
          >
            <ZoomOut size={16} />
          </button>
          <span className="min-w-[40px] text-center text-xs font-medium text-slate-500">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            disabled={scale >= 3}
            className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-200 disabled:opacity-30"
            aria-label="Zoomer"
          >
            <ZoomIn size={16} />
          </button>
        </div>

        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-200"
          aria-label="Télécharger"
        >
          <Download size={16} />
        </a>
      </div>

      {/* Canvas container */}
      <div className="overflow-auto bg-slate-100 p-2" style={{ maxHeight: '72vh' }}>
        <div className="flex justify-center">
          <div className="relative inline-block shadow-lg">
            {pageRendering && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
                <Loader2 size={24} className="animate-spin text-orange-400" />
              </div>
            )}
            <canvas ref={canvasRef} className="block rounded bg-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
