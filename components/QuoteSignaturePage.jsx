'use client';

import dynamic from 'next/dynamic';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  ImagePlus,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  PenLine,
  Phone,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  X,
  XCircle,
} from 'lucide-react';

const MobilePdfViewer = dynamic(() => import('./MobilePdfViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={24} className="animate-spin text-orange-400" />
    </div>
  ),
});

import {
  getQuoteNumberDisplay,
  getQuoteSignatureStatusMeta,
} from '@/lib/quote-signature';

const SUPPORT_PHONE = '09 86 71 34 44';
const FETCH_TIMEOUT_MS = 15000;
const ACTION_TIMEOUT_MS = 25000;

const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
};

// Calcule la validité du devis : date d'émission + 30 jours.
// Renvoie la date d'expiration ainsi que le nombre de jours restants
// (arrondi au jour supérieur). Renvoie null si la date est invalide.
const getQuoteValidity = (issueDate) => {
  if (!issueDate) return null;
  const issued = new Date(issueDate);
  if (Number.isNaN(issued.getTime())) return null;

  const expiry = new Date(issued);
  expiry.setDate(expiry.getDate() + 30);

  const msParJour = 1000 * 60 * 60 * 24;
  const joursRestants = Math.ceil((expiry.getTime() - Date.now()) / msParJour);

  return { expiry, joursRestants };
};

const getStatusMessage = (session) => {
  switch (session?.status) {
    case 'signed':
      return 'Ce devis a déjà été signé.';
    case 'refused':
      return 'Ce devis a déjà été refusé.';
    case 'expired':
      return 'Le lien de signature a expiré.';
    default:
      return session?.active === false ? "Ce lien de signature n'est plus actif." : '';
  }
};

/**
 * fetch wrapper that aborts after `timeoutMs` and reports a friendly,
 * distinguishable error when the network is too slow.
 */
const fetchWithTimeout = async (url, options = {}, timeoutMs = ACTION_TIMEOUT_MS) => {
  const controller = new AbortController();
  let didTimeout = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (didTimeout || error?.name === 'AbortError') {
      throw new Error(
        'La connexion est trop lente. Vérifiez votre réseau puis réessayez.'
      );
    }
    throw new Error('Problème de connexion. Vérifiez votre réseau puis réessayez.');
  } finally {
    clearTimeout(timer);
  }
};

const loadImageElement = (dataUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Impossible de charger l'image importée."));
    image.src = dataUrl;
  });

const getContainedImageRect = (image, width, height, padding = 18) => {
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
  if (!Array.isArray(stroke) || stroke.length === 0) {
    return;
  }

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
  if (!context) {
    throw new Error('Impossible de préparer la signature.');
  }

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
  if (!trimmedContext) {
    throw new Error('Impossible de préparer la signature.');
  }

  trimmedContext.drawImage(
    canvas,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  );

  return trimmedCanvas.toDataURL('image/png');
};

/* -------------------------------------------------------------------------- */
/*  Signature pad — touch friendly, prevents page scroll while drawing        */
/* -------------------------------------------------------------------------- */

const SignaturePad = forwardRef(function SignaturePad(
  { disabled = false, onContentChange },
  ref
) {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const drawingRef = useRef(false);
  const activePointerIdRef = useRef(null);
  const activeStrokeRef = useRef([]);
  const strokesRef = useRef([]);
  const stampImageRef = useRef(null);
  const [stampFileName, setStampFileName] = useState('');
  const [padError, setPadError] = useState('');

  const hasContent = useCallback(
    () => Boolean(stampImageRef.current || strokesRef.current.length > 0),
    []
  );

  const notifyContent = useCallback(() => {
    onContentChange?.(hasContent());
  }, [hasContent, onContentChange]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.width / ratio;
    const height = canvas.height / ratio;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';
    context.lineWidth = 2.2;

    const projectPoint = (point) => ({ x: point.x * width, y: point.y * height });

    if (stampImageRef.current) {
      const placement = getContainedImageRect(stampImageRef.current, width, height);
      context.drawImage(
        stampImageRef.current,
        placement.x,
        placement.y,
        placement.width,
        placement.height
      );
    }

    strokesRef.current.forEach((stroke) => {
      drawStroke(context, stroke.map(projectPoint));
    });

    if (drawingRef.current && activeStrokeRef.current.length > 0) {
      drawStroke(context, activeStrokeRef.current.map(projectPoint));
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let frameId = null;
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      redrawCanvas();
    };

    // Two passes: immediate + next frame, so the canvas is crisp once the
    // modal has finished its open transition.
    resizeCanvas();
    frameId = requestAnimationFrame(resizeCanvas);

    const scheduleResize = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(resizeCanvas);
    };

    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleResize) : null;
    observer?.observe(canvas);
    window.addEventListener('resize', scheduleResize);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener('resize', scheduleResize);
    };
  }, [redrawCanvas]);

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
    if (disabled) return;
    const point = getCanvasPoint(event);
    if (!point) return;

    event.preventDefault();
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    activeStrokeRef.current = [point];
    setPadError('');
    redrawCanvas();
  };

  const handlePointerMove = (event) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    if (!drawingRef.current) return;
    const point = getCanvasPoint(event);
    if (!point) return;

    event.preventDefault();
    activeStrokeRef.current = [...activeStrokeRef.current, point];
    redrawCanvas();
    notifyContent();
  };

  const handlePointerUp = (event) => {
    if (event?.pointerId != null && activePointerIdRef.current !== event.pointerId) return;
    if (!drawingRef.current) return;

    if (event?.pointerId != null) {
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {
        // Pointer may already be released — ignore.
      }
    }

    activePointerIdRef.current = null;
    drawingRef.current = false;
    if (activeStrokeRef.current.length > 0) {
      strokesRef.current = [...strokesRef.current, activeStrokeRef.current];
    }
    activeStrokeRef.current = [];
    redrawCanvas();
    notifyContent();
  };

  const clearAll = useCallback(() => {
    strokesRef.current = [];
    activeStrokeRef.current = [];
    drawingRef.current = false;
    activePointerIdRef.current = null;
    stampImageRef.current = null;
    setStampFileName('');
    setPadError('');
    redrawCanvas();
    notifyContent();
  }, [notifyContent, redrawCanvas]);

  const clearDrawing = () => {
    strokesRef.current = [];
    activeStrokeRef.current = [];
    drawingRef.current = false;
    activePointerIdRef.current = null;
    redrawCanvas();
    notifyContent();
    setPadError('');
  };

  const removeImportedStamp = () => {
    stampImageRef.current = null;
    setStampFileName('');
    redrawCanvas();
    notifyContent();
    setPadError('');
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
      notifyContent();
    } catch (nextError) {
      setPadError(nextError.message || "Impossible d'importer l'image.");
    }
  };

  const buildDataUrl = useCallback(() => {
    const previewCanvas = canvasRef.current;
    if (!previewCanvas) {
      throw new Error('Impossible de préparer la signature.');
    }

    const rect = previewCanvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width || 640));
    const height = Math.max(160, Math.round(rect.height || 220));
    const ratio = Math.min(2.5, Math.max(window.devicePixelRatio || 1, 1));
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = Math.round(width * ratio);
    exportCanvas.height = Math.round(height * ratio);

    const context = exportCanvas.getContext('2d');
    if (!context) {
      throw new Error('Impossible de préparer la signature.');
    }

    context.scale(ratio, ratio);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';
    context.lineWidth = 2.4;

    if (stampImageRef.current) {
      const placement = getContainedImageRect(stampImageRef.current, width, height);
      context.drawImage(
        stampImageRef.current,
        placement.x,
        placement.y,
        placement.width,
        placement.height
      );
    }

    const projectPoint = (point) => ({ x: point.x * width, y: point.y * height });

    strokesRef.current.forEach((stroke) => {
      drawStroke(context, stroke.map(projectPoint));
    });

    return exportTrimmedTransparentPng(exportCanvas, Math.max(8, Math.round(12 * ratio)));
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      buildDataUrl,
      hasContent,
      clear: clearAll,
    }),
    [buildDataUrl, clearAll, hasContent]
  );

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImportStamp}
        className="hidden"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload size={15} />
          Importer un cachet
        </button>
        {stampFileName && (
          <span className="inline-flex max-w-full items-center gap-2 truncate rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            <ImagePlus size={14} className="shrink-0 text-orange-500" />
            <span className="truncate">{stampFileName}</span>
          </span>
        )}
      </div>

      <div className="mt-3 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-2.5">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`h-48 w-full rounded-xl bg-white sm:h-56 ${
            disabled
              ? 'pointer-events-none opacity-60'
              : 'cursor-crosshair touch-none select-none'
          }`}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          Signez avec le doigt ou la souris, ou importez votre cachet.
        </p>
        <div className="flex gap-2">
          {stampFileName && (
            <button
              type="button"
              onClick={removeImportedStamp}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <Trash2 size={13} />
              Cachet
            </button>
          )}
          <button
            type="button"
            onClick={clearDrawing}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCcw size={13} />
            Effacer
          </button>
        </div>
      </div>

      {padError && (
        <p className="mt-2 text-xs font-semibold text-red-600">{padError}</p>
      )}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/*  Signature modal                                                           */
/* -------------------------------------------------------------------------- */

function SignatureModal({
  session,
  displayQuoteNumber,
  onClose,
  onSubmit,
  isSubmitting,
  submitError,
}) {
  const padRef = useRef(null);
  const [signerName, setSignerName] = useState(session?.recipient?.fullName || '');
  const [signerFunction, setSignerFunction] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [acceptReducedVat, setAcceptReducedVat] = useState(false);
  const [consent, setConsent] = useState(false);

  const requiresVat = session?.requiresReducedVatAck === true;

  const canSubmit =
    !isSubmitting &&
    signerName.trim().length > 1 &&
    hasSignature &&
    consent &&
    (!requiresVat || acceptReducedVat);

  const handleConfirm = () => {
    if (!canSubmit || !padRef.current) return;
    let signatureDataUrl;
    try {
      signatureDataUrl = padRef.current.buildDataUrl();
    } catch {
      signatureDataUrl = null;
    }
    if (!signatureDataUrl) return;

    const composedName = [signerName.trim(), signerFunction.trim()]
      .filter(Boolean)
      .join(' — ');

    onSubmit({ signerName: composedName, acceptReducedVat, signatureDataUrl });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Signer le devis"
    >
      <div
        className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-500">
              Signature électronique
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-900">
              {displayQuoteNumber ? `Devis n°${displayQuoteNumber}` : 'Signer le devis'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-700 disabled:opacity-40"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">
              Nom et prénom du signataire *
              <input
                value={signerName}
                onChange={(event) => setSignerName(event.target.value)}
                disabled={isSubmitting}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                placeholder="Ex : Jean Dupont"
                autoComplete="name"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Fonction
              <input
                value={signerFunction}
                onChange={(event) => setSignerFunction(event.target.value)}
                disabled={isSubmitting}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                placeholder="Ex : Gérant (facultatif)"
              />
            </label>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold text-slate-700">Votre signature *</p>
            <SignaturePad
              ref={padRef}
              disabled={isSubmitting}
              onContentChange={setHasSignature}
            />
          </div>

          {requiresVat && (
            <label className="mt-5 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <input
                type="checkbox"
                checked={acceptReducedVat}
                onChange={(event) => setAcceptReducedVat(event.target.checked)}
                disabled={isSubmitting}
                className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
              />
              <span className="leading-relaxed">
                Je certifie que les travaux réalisés concernent un local à usage
                d&apos;habitation achevé depuis plus de deux ans et qu&apos;ils remplissent les
                conditions d&apos;éligibilité au taux réduit de TVA.
              </span>
            </label>
          )}

          <label className="mt-4 flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              disabled={isSubmitting}
              className="mt-0.5 h-4 w-4 shrink-0 accent-orange-500"
            />
            <span className="leading-relaxed">
              Lu et approuvé, bon pour accord. Je reconnais avoir pris connaissance du devis et
              j&apos;accepte la proposition dans son intégralité.
            </span>
          </label>

          {submitError && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Signature en cours…
              </>
            ) : (
              <>
                <PenLine size={16} />
                Valider et signer
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Refusal modal                                                             */
/* -------------------------------------------------------------------------- */

function RefuseModal({ onClose, onSubmit, isSubmitting, submitError }) {
  const [reason, setReason] = useState('');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Refuser le devis"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-black text-slate-900">Refuser le devis</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-700 disabled:opacity-40"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <p className="text-sm text-slate-600">
            Vous pouvez nous indiquer la raison de votre refus afin que nous puissions ajuster
            notre proposition si nécessaire.
          </p>
          <label className="mt-4 block text-sm font-semibold text-slate-700">
            Motif (facultatif)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={isSubmitting}
              rows={3}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              placeholder="Expliquez brièvement votre refus si besoin"
            />
          </label>

          {submitError && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onSubmit(reason)}
            disabled={isSubmitting}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <XCircle size={16} />
            )}
            Confirmer le refus
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Modale de contact multi-choix (WhatsApp / Téléphone / Email)              */
/* -------------------------------------------------------------------------- */

function ContactModal({ onClose, waLink, telLink, emailLink }) {
  // Les 3 canaux de contact, présentés en gros boutons empilés et tactiles.
  const options = [
    {
      key: 'whatsapp',
      href: waLink,
      external: true,
      icon: MessageCircle,
      title: 'Parler sur WhatsApp',
      subtitle: 'Réponse rapide en journée',
      accent: 'bg-green-500',
      frame: 'border-green-200 bg-green-50 hover:bg-green-100',
    },
    {
      key: 'phone',
      href: telLink,
      external: false,
      icon: Phone,
      title: 'Appeler le 09 86 71 34 44',
      subtitle: 'Du lundi au vendredi',
      accent: 'bg-orange-500',
      frame: 'border-orange-200 bg-orange-50 hover:bg-orange-100',
    },
    {
      key: 'email',
      href: emailLink,
      external: false,
      icon: Mail,
      title: 'Envoyer un email',
      subtitle: 'contact@sarange.fr',
      accent: 'bg-slate-800',
      frame: 'border-slate-200 bg-slate-50 hover:bg-slate-100',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Nous contacter"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-black text-slate-900">
            Comment préférez-vous nous contacter ?
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-700"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Les 3 canaux de contact */}
        <div className="space-y-3 px-5 py-5 sm:px-6">
          {options.map((option) => {
            const Icon = option.icon;
            return (
              <a
                key={option.key}
                href={option.href}
                target={option.external ? '_blank' : undefined}
                rel={option.external ? 'noreferrer' : undefined}
                className={`flex items-center gap-4 rounded-2xl border px-4 py-4 text-left transition ${option.frame}`}
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white ${option.accent}`}
                >
                  <Icon size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900">
                    {option.title}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {option.subtitle}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-slate-400" />
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Document recap header (premium, inspired by the official PDF)             */
/* -------------------------------------------------------------------------- */

function RecapHeader({ session, displayQuoteNumber }) {
  const recipient = session.recipient || {};
  const chantierAddress = recipient.chantierAddress || recipient.address || '';
  const chantierName = recipient.chantierFullName || recipient.fullName || '';

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 bg-slate-900 px-5 py-4">
        <div>
          <p className="text-xl font-black tracking-tight text-white">
            SARANGE<span className="text-orange-500">.</span>
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
            Menuiseries sur-mesure
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-bold text-emerald-300">
          <BadgeCheck size={14} />
          Certifié RGE
        </span>
      </div>

      <div className="px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-black text-slate-900">
            Devis n°{displayQuoteNumber || '—'}
          </p>
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <CalendarDays size={13} />
            {formatDate(session.quote?.issueDate)}
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <User size={12} /> Client
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {recipient.fullName || 'Client'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <MapPin size={12} /> Chantier
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {chantierAddress || chantierName || 'Non renseigné'}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl bg-orange-50 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-700">
            Montant total TTC
          </p>
          <p className="text-xl font-black text-slate-900">
            {currencyFormatter.format(session.quote?.totalTTC || 0)}
          </p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Badge de validité dynamique (devis émis + 30 jours)                       */
/* -------------------------------------------------------------------------- */

function ValidityBadge({ issueDate }) {
  const validity = getQuoteValidity(issueDate);
  if (!validity) return null;

  const { expiry, joursRestants } = validity;

  // Devis déjà expiré
  if (joursRestants <= 0) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm font-bold text-red-100">
        <span aria-hidden>⏳</span>
        Ce devis a expiré le {formatDate(expiry)}
      </div>
    );
  }

  // Échéance proche (7 jours ou moins) → badge qui attire l'œil
  if (joursRestants <= 7) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-orange-400/40 bg-orange-500/15 px-4 py-2.5 text-sm font-bold text-orange-100">
        <span aria-hidden>⏳</span>
        Expire dans {joursRestants} jour{joursRestants > 1 ? 's' : ''}
      </div>
    );
  }

  // Validité confortable → badge discret et rassurant
  return (
    <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100/90">
      <ShieldCheck size={15} className="shrink-0 text-emerald-300" />
      Valable jusqu&apos;au {formatDate(expiry)}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main page                                                                 */
/* -------------------------------------------------------------------------- */

export default function QuoteSignaturePage({ token }) {
  const successCardRef = useRef(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [submitError, setSubmitError] = useState('');
  const [submitMessage, setSubmitMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justSigned, setJustSigned] = useState(false);

  const [signModalOpen, setSignModalOpen] = useState(false);
  const [refuseModalOpen, setRefuseModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);

  // ---- Data fetching (timeout + abort + retry) ----
  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      setLoading(true);
      setError('');
      setSubmitError('');
      setSubmitMessage('');
      setJustSigned(false);

      const controller = new AbortController();
      let didTimeout = false;
      const timer = setTimeout(() => {
        didTimeout = true;
        controller.abort();
      }, FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(
          `/api/quote-signatures/${encodeURIComponent(token)}`,
          { cache: 'no-store', signal: controller.signal }
        );
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.error ||
              'Le devis demandé est introuvable. Vérifiez votre lien ou contactez SARANGE.'
          );
        }

        if (!cancelled) {
          setSession(data);
        }
      } catch (nextError) {
        if (cancelled) return;
        if (didTimeout || nextError?.name === 'AbortError') {
          setError(
            'Le chargement du devis prend trop de temps. Vérifiez votre connexion internet, puis réessayez.'
          );
        } else {
          setError(
            nextError.message ||
              'Impossible de charger le devis. Vérifiez votre connexion ou contactez SARANGE.'
          );
        }
      } finally {
        clearTimeout(timer);
        if (!cancelled) setLoading(false);
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  const retry = useCallback(() => setReloadKey((value) => value + 1), []);

  // ---- Lock body scroll while a modal is open ----
  useEffect(() => {
    if (!signModalOpen && !refuseModalOpen && !contactModalOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [signModalOpen, refuseModalOpen, contactModalOpen]);

  useEffect(() => {
    if (!justSigned || !successCardRef.current) return;
    successCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [justSigned]);

  // ---- Actions ----
  const handleSign = async ({ signerName, acceptReducedVat, signatureDataUrl }) => {
    setIsSubmitting(true);
    setSubmitError('');
    setSubmitMessage('');

    try {
      const response = await fetchWithTimeout(
        `/api/quote-signatures/${encodeURIComponent(token)}/sign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signerName, acceptReducedVat, signatureDataUrl }),
        }
      );
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'Impossible de signer ce devis.');
      }

      setSession(data);
      setSignModalOpen(false);
      setJustSigned(true);
      setSubmitMessage('Le devis a bien été signé.');
    } catch (nextError) {
      setSubmitError(nextError.message || 'Impossible de signer ce devis.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefuse = async (reason) => {
    setIsSubmitting(true);
    setSubmitError('');
    setSubmitMessage('');

    try {
      const response = await fetchWithTimeout(
        `/api/quote-signatures/${encodeURIComponent(token)}/refuse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        }
      );
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'Impossible de refuser ce devis.');
      }

      setSession(data);
      setRefuseModalOpen(false);
      setSubmitMessage('Le refus du devis a bien été enregistré.');
    } catch (nextError) {
      setSubmitError(nextError.message || 'Impossible de refuser ce devis.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- Derived ----
  const displayQuoteNumber = getQuoteNumberDisplay(session?.quote?.number);
  const statusMeta = getQuoteSignatureStatusMeta(session?.status);
  const isSigned = session?.status === 'signed';
  const isRefused = session?.status === 'refused';
  const isReadOnly =
    !session ||
    session.active === false ||
    ['signed', 'refused', 'expired'].includes(session.status || '');
  const sessionMessage = getStatusMessage(session);
  const canAct = Boolean(session) && !isReadOnly;

  // Liens de contact dynamiques pré-remplis avec le numéro du devis
  const waMessage = `Bonjour l'équipe SARANGE, j'ai une question concernant mon devis N° ${displayQuoteNumber}.`;
  const waLink = `https://wa.me/33986713444?text=${encodeURIComponent(waMessage)}`;
  const telLink = 'tel:+33986713444';
  const emailLink = `mailto:contact@sarange.fr?subject=Question%20Devis%20${encodeURIComponent(displayQuoteNumber)}`;

  /* ----- Loading state ----- */
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 size={36} className="animate-spin text-orange-400" />
          <div>
            <p className="text-lg font-bold text-white">Chargement de votre devis…</p>
            <p className="mt-1 text-sm text-slate-400">Merci de patienter quelques instants.</p>
          </div>
        </div>
      </main>
    );
  }

  /* ----- Error state (bulletproof, with retry) ----- */
  if (error || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl shadow-black/30 backdrop-blur">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 text-red-300">
            <AlertTriangle size={30} />
          </div>
          <h1 className="mt-5 text-xl font-black text-white">Devis indisponible</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {error ||
              'Impossible de charger le devis. Vérifiez votre connexion ou contactez SARANGE.'}
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600"
          >
            <RefreshCcw size={16} />
            Réessayer
          </button>
          <p className="mt-6 text-xs text-slate-400">
            Besoin d&apos;aide ? Contactez SARANGE au{' '}
            <a href={`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`} className="font-bold text-orange-300">
              {SUPPORT_PHONE}
            </a>
          </p>
        </div>
      </main>
    );
  }

  /* ----- Main content ----- */
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div
        className={`mx-auto max-w-6xl px-4 py-6 sm:py-8 ${
          canAct ? 'pb-32 xl:pb-8' : ''
        }`}
      >
        {/* Page header */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
            Signature de devis
          </p>
          <h1 className="mt-3 text-2xl font-black text-white sm:text-3xl">
            {displayQuoteNumber ? `Devis n°${displayQuoteNumber}` : 'Votre devis'}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">
            {isSigned
              ? 'Votre signature a bien été enregistrée. Vous pouvez retrouver votre devis signé ci-dessous.'
              : isRefused
                ? 'Votre refus a bien été enregistré. Nous reviendrons vers vous si nécessaire.'
                : 'Consultez votre devis, puis signez-le en ligne en toute sécurité ou refusez-le si nécessaire.'}
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-5 xl:grid xl:grid-cols-[1.45fr_0.9fr] xl:items-start">
          {/* ---- Document column ---- */}
          <section className="space-y-4">
            <RecapHeader session={session} displayQuoteNumber={displayQuoteNumber} />

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
                <div className="flex items-center gap-3">
                  <FileText size={18} className="text-orange-500" />
                  <div>
                    <p className="text-sm font-bold text-slate-900">Document officiel</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Le PDF ci-dessous est exactement le document que vous signez.
                    </p>
                  </div>
                </div>
                <a
                  href={session.originalDocumentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 transition hover:bg-orange-100"
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">Télécharger</span>
                </a>
              </div>
              <MobilePdfViewer url={session.originalDocumentUrl} title="Aperçu du devis" />
            </div>
          </section>

          {/* ---- Action column ---- */}
          <aside className="space-y-4 xl:sticky xl:top-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">Récapitulatif</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Vérifiez les informations avant de valider.
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${statusMeta.className}`}
                >
                  {statusMeta.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-white/5 p-3">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                    Client
                  </p>
                  <p className="mt-1 font-semibold text-white">{session.recipient.fullName}</p>
                </div>
                <div className="rounded-2xl bg-white/5 p-3">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                    Montant TTC
                  </p>
                  <p className="mt-1 font-semibold text-white">
                    {currencyFormatter.format(session.quote.totalTTC || 0)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/5 p-3">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                    Date du devis
                  </p>
                  <p className="mt-1 font-semibold text-white">
                    {formatDate(session.quote.issueDate)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/5 p-3">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                    Statut
                  </p>
                  <p className="mt-1 font-semibold text-white">{statusMeta.label}</p>
                </div>
              </div>

              {/* Badge de validité dynamique : visible tant que le devis peut être signé */}
              {canAct && <ValidityBadge issueDate={session.quote?.issueDate} />}

              {sessionMessage && !isSigned && !isRefused && (
                <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  {sessionMessage}
                </div>
              )}

              {submitMessage && !isSigned && !isRefused && (
                <div className="mt-4 rounded-2xl border border-green-400/20 bg-green-500/10 px-4 py-3 text-sm text-green-100">
                  {submitMessage}
                </div>
              )}

              {submitError && !signModalOpen && !refuseModalOpen && (
                <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Desktop action buttons */}
              {canAct && (
                <div className="mt-5 hidden gap-2 xl:flex xl:flex-col">
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitError('');
                      setSignModalOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600"
                  >
                    <PenLine size={16} />
                    Accepter et signer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitError('');
                      setRefuseModalOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    <XCircle size={16} />
                    Refuser le devis
                  </button>
                </div>
              )}

              {/* Bouton secondaire discret ouvrant la modale de contact multi-choix */}
              <button
                type="button"
                onClick={() => setContactModalOpen(true)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-transparent px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
              >
                <MessageCircle size={16} className="text-slate-300" />
                Une question ? Contactez-nous
              </button>

              {session.signedDocumentUrl && (
                <a
                  href={session.signedDocumentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/25"
                >
                  <RefreshCcw size={15} />
                  Ouvrir le devis signé
                </a>
              )}
            </div>

            {/* Signed / refused result cards */}
            {isSigned && (
              <div
                ref={successCardRef}
                className="relative overflow-hidden rounded-3xl border border-emerald-300/20 bg-gradient-to-br from-emerald-500/15 via-emerald-400/10 to-cyan-400/10 p-6 shadow-2xl shadow-black/20 backdrop-blur"
              >
                {justSigned && (
                  <div className="pointer-events-none absolute left-8 top-8 h-16 w-16 rounded-full bg-emerald-300/25 animate-ping" />
                )}
                <div className="relative flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-500/25">
                    <CheckCircle2 size={28} strokeWidth={2.5} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">
                      Signature validée
                    </p>
                    <h2 className="mt-2 text-xl font-black text-white">
                      {justSigned ? 'Votre devis a bien été signé' : 'Ce devis est déjà signé'}
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-emerald-50/90">
                      {justSigned
                        ? 'Votre signature a été prise en compte et un email de confirmation vous a été envoyé.'
                        : 'La signature de ce devis a déjà été enregistrée. Vous pouvez rouvrir le document signé à tout moment.'}
                    </p>
                  </div>
                </div>
                {session.signedDocumentUrl && (
                  <a
                    href={session.signedDocumentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
                  >
                    <ShieldCheck size={16} />
                    Ouvrir le devis signé
                  </a>
                )}
              </div>
            )}

            {isRefused && (
              <div className="rounded-3xl border border-red-300/20 bg-red-500/10 p-6 shadow-2xl shadow-black/20 backdrop-blur">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-red-300 text-red-950">
                    <XCircle size={28} strokeWidth={2.5} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-red-200">
                      Refus enregistré
                    </p>
                    <h2 className="mt-2 text-xl font-black text-white">
                      Votre refus a bien été pris en compte
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-red-50/90">
                      Notre équipe sera notifiée automatiquement. Si besoin, nous reviendrons vers
                      vous pour ajuster la proposition.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* ---- Mobile sticky bottom action bar ---- */}
      {canAct && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-900/95 px-4 py-3 backdrop-blur xl:hidden">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Total TTC
              </p>
              <p className="text-base font-black text-white">
                {currencyFormatter.format(session.quote.totalTTC || 0)}
              </p>
            </div>
            <div className="flex flex-1 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSubmitError('');
                  setRefuseModalOpen(true);
                }}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-white/15 bg-white/5 px-3 py-3 text-sm font-semibold text-slate-200 transition active:bg-white/10"
              >
                Refuser
              </button>
              <button
                type="button"
                onClick={() => {
                  setSubmitError('');
                  setSignModalOpen(true);
                }}
                className="inline-flex flex-[1.6] items-center justify-center gap-2 rounded-full bg-orange-500 px-3 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/30 transition active:bg-orange-600"
              >
                <PenLine size={16} />
                Signer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Modals ---- */}
      {signModalOpen && (
        <SignatureModal
          session={session}
          displayQuoteNumber={displayQuoteNumber}
          onClose={() => {
            if (isSubmitting) return;
            setSignModalOpen(false);
            setSubmitError('');
          }}
          onSubmit={handleSign}
          isSubmitting={isSubmitting}
          submitError={submitError}
        />
      )}

      {refuseModalOpen && (
        <RefuseModal
          onClose={() => {
            if (isSubmitting) return;
            setRefuseModalOpen(false);
            setSubmitError('');
          }}
          onSubmit={handleRefuse}
          isSubmitting={isSubmitting}
          submitError={submitError}
        />
      )}

      {contactModalOpen && (
        <ContactModal
          onClose={() => setContactModalOpen(false)}
          waLink={waLink}
          telLink={telLink}
          emailLink={emailLink}
        />
      )}
    </main>
  );
}
