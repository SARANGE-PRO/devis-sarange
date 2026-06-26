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
  Check,
  CheckCircle2,
  DoorOpen,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  ImagePlus,
  Loader2,
  Mail,
  MessageCircle,
  PenLine,
  Phone,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
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
import PdfGenerationLoader from './PdfGenerationLoader';

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
  { disabled = false, onContentChange, invalid = false },
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
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload size={14} />
          Importer un cachet
          <span className="text-slate-400">(optionnel)</span>
        </button>
        {stampFileName && (
          <span className="inline-flex max-w-full items-center gap-2 truncate rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            <ImagePlus size={14} className="shrink-0 text-orange-500" />
            <span className="truncate">{stampFileName}</span>
          </span>
        )}
      </div>

      <div
        className={`mt-3 rounded-2xl border-2 border-dashed bg-white p-2.5 transition ${
          invalid ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
        }`}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`h-48 w-full rounded-xl bg-white ${
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
/*  Case à cocher personnalisée (case native masquée + faux carré + icône)    */
/* -------------------------------------------------------------------------- */

// Le visuel est piloté DIRECTEMENT par l'état React (`checked`), pas par du CSS
// `:checked` : ainsi un clic n'importe où dans le <label> parent coche la case de
// manière infaillible (la case native, en sr-only, reste la source d'accessibilité).
function CustomCheckbox({ checked, onChange, disabled = false, accent = 'orange' }) {
  const onClasses =
    accent === 'emerald' ? 'border-emerald-600 bg-emerald-600' : 'border-orange-500 bg-orange-500';
  const offClasses =
    accent === 'emerald' ? 'border-emerald-300 bg-white' : 'border-slate-300 bg-white';
  return (
    <span
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
        checked ? onClasses : offClasses
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      {checked && <Check size={14} strokeWidth={3.5} className="text-white" />}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Signature modal                                                           */
/* -------------------------------------------------------------------------- */

const SignatureStep = forwardRef(function SignatureStep(
  { session, requiresReducedVat, onSubmit, isSubmitting, submitError, onValidityChange },
  ref
) {
  const padRef = useRef(null);
  const nameRef = useRef(null);
  const signatureRef = useRef(null);
  const vatRef = useRef(null);
  const consentRef = useRef(null);
  const [signerName, setSignerName] = useState(session?.recipient?.fullName || '');
  const [signerFunction, setSignerFunction] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [acceptReducedVat, setAcceptReducedVat] = useState(false);
  const [consent, setConsent] = useState(false);
  // Passe à true au 1er clic sur « Signer » : déclenche l'affichage des alertes ciblées.
  const [attempted, setAttempted] = useState(false);

  const requiresVat =
    requiresReducedVat != null ? requiresReducedVat === true : session?.requiresReducedVatAck === true;

  // Conditions manquantes (une par champ obligatoire) pour des alertes précises.
  const nameMissing = signerName.trim().length <= 1;
  const signatureMissing = !hasSignature;
  const vatMissing = requiresVat && !acceptReducedVat;
  const consentMissing = !consent;

  const canSubmit =
    !isSubmitting && !nameMissing && !signatureMissing && !consentMissing && !vatMissing;

  // Récap lisible de ce qu'il reste à compléter (affiché après une tentative).
  const missingItems = [
    nameMissing && 'votre nom et prénom',
    signatureMissing && 'votre signature',
    vatMissing && 'la case de certification TVA réduite',
    consentMissing && 'la case « Lu et approuvé, bon pour accord »',
  ].filter(Boolean);

  const handleConfirm = () => {
    // Champ manquant : on n'envoie pas, on révèle les alertes et on guide le client
    // vers le premier élément à compléter (scroll doux + focus du nom).
    if (!canSubmit) {
      setAttempted(true);
      const target = nameMissing
        ? nameRef.current
        : signatureMissing
          ? signatureRef.current
          : vatMissing
            ? vatRef.current
            : consentMissing
              ? consentRef.current
              : null;
      if (target?.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (nameMissing && nameRef.current?.focus) nameRef.current.focus();
      return;
    }
    if (!padRef.current) return;
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

    // Toujours un booléen explicite : c'est cette valeur qui coche (ou non) la case
    // TVA réduite sur le PDF officiel côté serveur. On ne laisse jamais d'ambiguïté.
    onSubmit({
      signerName: composedName,
      acceptReducedVat: acceptReducedVat === true,
      signatureDataUrl,
    });
  };

  // Le bouton principal « Signer et valider » vit dans la barre d'action en bas : on
  // expose la soumission (ref) et on remonte la validité du formulaire au parent.
  useImperativeHandle(ref, () => ({ submit: handleConfirm }));
  useEffect(() => {
    if (onValidityChange) onValidityChange(canSubmit);
  }, [canSubmit, onValidityChange]);

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-black/20">
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-500">
          Dernière étape — Signature
        </p>
        <h2 className="mt-1 text-lg font-black text-slate-900">Bon pour accord</h2>
        <p className="mt-1 text-xs text-slate-500">
          Renseignez votre nom puis signez ci-dessous pour valider votre commande.
        </p>
      </div>

      {/* Body — 2 colonnes sur desktop pour éviter le scroll vertical. */}
      <div className="px-5 py-5 sm:px-6">
          {/* Alerte récapitulative : visible seulement après une tentative de signature. */}
          {attempted && missingItems.length > 0 && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">
                  {missingItems.length === 1
                    ? 'Il reste 1 élément à compléter avant de signer :'
                    : `Il reste ${missingItems.length} éléments à compléter avant de signer :`}
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {missingItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {/* Colonne gauche : identité du signataire + attestation TVA. */}
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-slate-700">
                Nom et prénom du signataire *
                <input
                  ref={nameRef}
                  value={signerName}
                  onChange={(event) => setSignerName(event.target.value)}
                  disabled={isSubmitting}
                  className={`mt-1.5 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 ${
                    attempted && nameMissing
                      ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
                      : 'border-slate-200 focus:border-orange-400 focus:ring-orange-100'
                  }`}
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

              {requiresVat && (
                <div
                  ref={vatRef}
                  className={`rounded-2xl border bg-emerald-50 p-4 text-sm text-emerald-900 transition ${
                    attempted && vatMissing
                      ? 'border-red-400 ring-2 ring-red-200'
                      : 'border-emerald-200'
                  }`}
                >
                  {/* Case + intitulé restent toujours visibles. */}
                  <label className="flex cursor-pointer items-start gap-3">
                    <CustomCheckbox
                      checked={acceptReducedVat}
                      onChange={(event) => setAcceptReducedVat(event.target.checked)}
                      disabled={isSubmitting}
                      accent="emerald"
                    />
                    <strong className="leading-relaxed">
                      CERTIFICATION POUR L&rsquo;APPLICATION DES TAUX RÉDUITS DE TVA
                    </strong>
                  </label>
                  {/* Texte légal long : hauteur contrainte + scroll interne + fondu bas. */}
                  <div className="relative mt-2">
                    <div className="scrollbar-thin max-h-24 overflow-y-auto pr-2 text-sm leading-relaxed text-emerald-900/90">
                      Le client certifie que les travaux prévus au présent devis concernent des
                      locaux affectés à l&rsquo;habitation et achevés depuis plus de deux ans et que,
                      sur une période de deux ans au plus, ils ne concourent pas à la production
                      d&rsquo;un immeuble neuf ni à une augmentation de plus de 10&nbsp;% de la surface
                      de plancher existante. Pour les prestations soumises à la TVA à 5,5&nbsp;%, il
                      certifie également qu&rsquo;elles constituent des travaux de rénovation
                      énergétique. La signature du présent devis vaut certification de ces
                      déclarations.
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 rounded-b bg-gradient-to-t from-emerald-50 to-transparent" />
                  </div>
                </div>
              )}
            </div>

            {/* Colonne droite : zone de signature. */}
            <div ref={signatureRef}>
              <p
                className={`mb-2 text-sm font-semibold ${
                  attempted && signatureMissing ? 'text-red-600' : 'text-slate-700'
                }`}
              >
                Votre signature *
              </p>
              <SignaturePad
                ref={padRef}
                disabled={isSubmitting}
                onContentChange={setHasSignature}
                invalid={attempted && signatureMissing}
              />
              {attempted && signatureMissing && (
                <p className="mt-2 text-xs font-semibold text-red-600">
                  Veuillez signer dans le cadre ci-dessus (au doigt, à la souris, ou importez votre cachet).
                </p>
              )}
            </div>
          </div>

          {/* Bon pour accord — pleine largeur sous les 2 colonnes. */}
          <label
            ref={consentRef}
            className={`mt-6 flex cursor-pointer gap-3 rounded-2xl border bg-slate-50 p-4 text-sm text-slate-700 transition ${
              attempted && consentMissing ? 'border-red-400 ring-2 ring-red-200' : 'border-slate-200'
            }`}
          >
            <CustomCheckbox
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              disabled={isSubmitting}
              accent="orange"
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

        {/* Le bouton « Signer et valider » est dans la barre d'action fixe en bas. */}
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-center text-xs font-medium text-slate-500 sm:px-6">
          {canSubmit
            ? 'Tout est prêt — cliquez sur « Signer et valider » en bas de l’écran.'
            : 'Renseignez votre nom, signez et cochez « bon pour accord » : nous vous indiquerons ce qu’il manque.'}
        </div>
      </div>
  );
});

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
/*  Badge de validité dynamique (devis émis + 30 jours)                       */
/* -------------------------------------------------------------------------- */

function ValidityBadge({ issueDate }) {
  const validity = getQuoteValidity(issueDate);
  if (!validity) return null;

  const { expiry, joursRestants } = validity;

  // Devis déjà expiré
  if (joursRestants <= 0) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 dark:border-red-400/30 dark:bg-red-500/15 dark:text-red-100">
        <span aria-hidden>⏳</span>
        Ce devis a expiré le {formatDate(expiry)}
      </div>
    );
  }

  // Échéance proche (7 jours ou moins) → badge qui attire l'œil
  if (joursRestants <= 7) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-bold text-orange-700 dark:border-orange-400/40 dark:bg-orange-500/15 dark:text-orange-100">
        <span aria-hidden>⏳</span>
        Expire dans {joursRestants} jour{joursRestants > 1 ? 's' : ''}
      </div>
    );
  }

  // Validité confortable → badge discret et rassurant
  return (
    <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-100/90">
      <ShieldCheck size={15} className="shrink-0 text-emerald-600 dark:text-emerald-300" />
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
  // Spécifique à la signature (≠ refus) : pilote l'écran de chargement plein écran.
  const [isSigning, setIsSigning] = useState(false);
  const [justSigned, setJustSigned] = useState(false);

  // Étape courante du parcours guidé (wizard) : 'devis' | 'config' | 'signature'.
  const [step, setStep] = useState('devis');
  const [refuseModalOpen, setRefuseModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  // Choix de configuration (devis multi-variantes) — obligatoire avant signature.
  const [selectedVariantId, setSelectedVariantId] = useState('');
  // Choix de panneau décoratif par porte (lineId -> détail) — obligatoire avant signature.
  const [panelChoices, setPanelChoices] = useState({});
  const panelIframeRefs = useRef({});
  const panelSectionRef = useRef(null);
  // Cartes de porte (réf par lineId) pour scroller vers la première non validée.
  const panelCardRefs = useRef({});
  // Portes en erreur (clic « Continuer » sans choix) + secousse temporaire d'attention.
  const [panelErrorIds, setPanelErrorIds] = useState([]);
  const [panelShake, setPanelShake] = useState(false);
  // Raison d'un blocage de signature ('panel' | 'variant' | null) pour un message explicite.
  const [signBlockedReason, setSignBlockedReason] = useState(null);
  // Étape signature pilotée depuis la barre d'action (le bouton « Signer » est dans le footer).
  const signatureStepRef = useRef(null);
  const [signatureReady, setSignatureReady] = useState(false);
  // Panneaux ré-ouverts pour modification (force l'affichage de l'iframe même si choisi).
  const [reopenedPanels, setReopenedPanels] = useState({});
  // Pulse du bouton « Continuer » quand tous les panneaux viennent d'être choisis.
  const [pulseContinue, setPulseContinue] = useState(false);
  // Porte dont le sélecteur est affiché en plein écran (null = aucun).
  const [fullscreenPanelId, setFullscreenPanelId] = useState(null);

  // Échap ferme la vue plein écran du sélecteur (quand le focus est hors de l'iframe).
  useEffect(() => {
    if (!fullscreenPanelId) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setFullscreenPanelId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreenPanelId]);

  // Changement de variante : les portes/couleurs changent -> on réinitialise les choix
  // de panneaux (le client re-sélectionne avec la couleur de la variante retenue).
  useEffect(() => {
    setPanelChoices({});
  }, [selectedVariantId]);

  // Capture des choix remontés par les iframes du sélecteur de panneaux. L'outil est
  // servi en same-origin : on vérifie quand même l'origine et on retrouve la porte
  // concernée en comparant la source du message au contentWindow de chaque iframe.
  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.event !== 'PANEL_SELECTED') return;
      const match = Object.entries(panelIframeRefs.current).find(
        ([, el]) => el && el.contentWindow === event.source
      );
      if (!match) return;
      const [lineId] = match;
      setPanelChoices((previous) => ({
        ...previous,
        [lineId]: {
          gamme: data.gamme || '',
          panelName: data.panelName || '',
          panelRef: data.panelRef || '',
          image: data.image || '',
          croisillon: data.croisillonChoisi || '',
          couleur: data.couleurChoisie || '',
          legendeVitrage: data.legendeVitrage || '',
          plusValueTotaleHT: Number(data.plusValueTotaleHT) || 0,
        },
      }));
      // Le choix vaut validation : on referme le plein écran ET le mode « modification »
      // de cette porte (on bascule sur la carte de succès à la place de l'iframe).
      setFullscreenPanelId((current) => (current === lineId ? null : current));
      setReopenedPanels((previous) => ({ ...previous, [lineId]: false }));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

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
    if (!refuseModalOpen && !contactModalOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [refuseModalOpen, contactModalOpen]);

  useEffect(() => {
    if (!justSigned || !successCardRef.current) return;
    successCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [justSigned]);

  // ---- Actions ----
  const handleSign = async ({ signerName, acceptReducedVat, signatureDataUrl }) => {
    setIsSubmitting(true);
    setIsSigning(true);
    setSubmitError('');
    setSubmitMessage('');

    try {
      const response = await fetchWithTimeout(
        `/api/quote-signatures/${encodeURIComponent(token)}/sign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signerName,
            // Booléen garanti : pilote la case TVA réduite sur le PDF officiel.
            acceptReducedVat: acceptReducedVat === true,
            signatureDataUrl,
            selectedVariantId: selectedVariantId || undefined,
            panelChoices,
          }),
        }
      );
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'Impossible de signer ce devis.');
      }

      setSession(data);
      setJustSigned(true);
      setSubmitMessage('Le devis a bien été signé.');
    } catch (nextError) {
      setSubmitError(nextError.message || 'Impossible de signer ce devis.');
    } finally {
      setIsSubmitting(false);
      setIsSigning(false);
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
    session?.active === false ||
    ['signed', 'refused', 'expired'].includes(session?.status || '');
  const sessionMessage = getStatusMessage(session);
  const canAct = Boolean(session) && !isReadOnly;

  // Devis multi-variantes : le client doit choisir une configuration avant de signer.
  const variantOptions = Array.isArray(session?.variants) ? session.variants : [];
  const isVariantQuote = session?.variantsMode === true && variantOptions.length > 1;
  const selectedVariant = variantOptions.find((variant) => variant.id === selectedVariantId) || null;
  const variantChoiceMissing = isVariantQuote && !selectedVariant;
  // Portes à panneau décoratif : un panneau doit être choisi pour chacune avant signature.
  // En multi-variantes, on prend les portes/couleurs de la variante CHOISIE (chaque
  // variante peut avoir des coloris différents) ; sinon la liste globale du devis.
  const panelSelections = isVariantQuote
    ? (selectedVariant && Array.isArray(selectedVariant.panelSelections)
        ? selectedVariant.panelSelections
        : [])
    : Array.isArray(session?.panelSelections)
      ? session.panelSelections
      : [];
  const panelChoiceMissing =
    canAct && panelSelections.some((selection) => !panelChoices[selection.lineId]);

  // Lève le blocage dès que la condition manquante est satisfaite.
  useEffect(() => {
    if (signBlockedReason === 'panel' && !panelChoiceMissing) setSignBlockedReason(null);
    if (signBlockedReason === 'variant' && !variantChoiceMissing) setSignBlockedReason(null);
  }, [signBlockedReason, panelChoiceMissing, variantChoiceMissing]);

  // « Effet panier » : quand tous les panneaux viennent d'être choisis (étape config),
  // on fait pulser le bouton « Continuer » ~2 s pour guider vers l'étape suivante.
  useEffect(() => {
    if (step !== 'config' || panelSelections.length === 0 || panelChoiceMissing) return undefined;
    setPulseContinue(true);
    const timer = setTimeout(() => setPulseContinue(false), 2200);
    return () => clearTimeout(timer);
  }, [step, panelChoiceMissing, panelSelections.length]);

  // La secousse d'attention ne joue qu'une fois (~0,5 s) puis se désarme.
  useEffect(() => {
    if (!panelShake) return undefined;
    const timer = setTimeout(() => setPanelShake(false), 600);
    return () => clearTimeout(timer);
  }, [panelShake]);

  // ---- Parcours en étapes (wizard) ----
  const hasPanels = panelSelections.length > 0;
  // Wording dynamique : « Votre panneau » (1 porte) / « Vos panneaux » (2+).
  const panelStepLabel = panelSelections.length > 1 ? 'Vos panneaux' : 'Votre panneau';
  const steps = hasPanels
    ? [
        { id: 'devis', label: 'Votre devis' },
        { id: 'config', label: panelStepLabel },
        { id: 'signature', label: 'Signature' },
      ]
    : [
        { id: 'devis', label: 'Votre devis' },
        { id: 'signature', label: 'Signature' },
      ];
  const currentIndex = Math.max(0, steps.findIndex((entry) => entry.id === step));

  // Si l'étape courante n'existe plus (ex. variante sans porte), on recale sur la 1re.
  useEffect(() => {
    const validIds = hasPanels
      ? ['devis', 'config', 'signature']
      : ['devis', 'signature'];
    if (!validIds.includes(step)) setStep('devis');
  }, [hasPanels, step]);

  const goPrev = () => {
    setSignBlockedReason(null);
    if (currentIndex > 0) setStep(steps[currentIndex - 1].id);
  };
  const goNext = () => {
    setSubmitError('');
    if (step === 'devis') {
      if (variantChoiceMissing) {
        setSignBlockedReason('variant');
        return;
      }
      setSignBlockedReason(null);
      setStep(steps[Math.min(currentIndex + 1, steps.length - 1)].id);
      return;
    }
    if (step === 'config') {
      if (panelChoiceMissing) {
        setSignBlockedReason('panel');
        // Marque toutes les portes non validées et scrolle en douceur vers la 1re.
        const missing = panelSelections
          .filter((selection) => !panelChoices[selection.lineId])
          .map((selection) => selection.lineId);
        setPanelErrorIds(missing);
        // Rejoue la secousse : on désarme, puis on réarme à la frame suivante.
        setPanelShake(false);
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => requestAnimationFrame(() => setPanelShake(true)));
        } else {
          setPanelShake(true);
        }
        const firstNode = panelCardRefs.current[missing[0]];
        if (firstNode?.scrollIntoView) {
          firstNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      setSignBlockedReason(null);
      setStep('signature');
    }
  };
  // Mention TVA réduite : pour la variante choisie si dispo, sinon exigence globale.
  const requiresReducedVat = isVariantQuote
    ? Boolean(selectedVariant?.requiresReducedVatAck)
    : session?.requiresReducedVatAck === true;
  // Montant TTC affiché : variante choisie en cours de signature ; une fois signé,
  // session.quote.totalTTC reflète déjà la variante retenue (recalé côté serveur).
  const displayTotalTTC =
    isVariantQuote && !isSigned
      ? selectedVariant
        ? selectedVariant.totalTTC
        : null
      : session?.quote?.totalTTC;

  // Liens de contact dynamiques pré-remplis avec le numéro du devis
  const waMessage = `Bonjour l'équipe SARANGE, j'ai une question concernant mon devis N° ${displayQuoteNumber}.`;
  const waLink = `https://wa.me/33986713444?text=${encodeURIComponent(waMessage)}`;
  const telLink = 'tel:+33986713444';
  const emailLink = `mailto:contact@sarange.fr?subject=Question%20Devis%20${encodeURIComponent(displayQuoteNumber)}`;

  /* ----- Loading state ----- */
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 size={36} className="animate-spin text-orange-500 dark:text-orange-400" />
          <div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">Chargement de votre devis…</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Merci de patienter quelques instants.</p>
          </div>
        </div>
      </main>
    );
  }

  /* ----- Error state (bulletproof, with retry) ----- */
  if (error || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-2xl shadow-black/10 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:shadow-black/30">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300">
            <AlertTriangle size={30} />
          </div>
          <h1 className="mt-5 text-xl font-black text-slate-900 dark:text-white">Devis indisponible</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
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
          <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
            Besoin d&apos;aide ? Contactez SARANGE au{' '}
            <a href={`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`} className="font-bold text-orange-600 dark:text-orange-300">
              {SUPPORT_PHONE}
            </a>
          </p>
        </div>
      </main>
    );
  }

  /* ----- Parcours guidé (layout large SaaS) ----- */
  // Une fois signé, toutes les étapes passent au vert (« Validé… / Signé »).
  const stepsCompleted = isSigned;
  const stepBar = (
    <ol className="flex items-center">
      {steps.map((entry, index) => {
        const isLast = index === steps.length - 1;
        const done = stepsCompleted || index < currentIndex;
        const active = !stepsCompleted && index === currentIndex;
        const label = stepsCompleted ? (isLast ? 'Signé' : 'Validé') : entry.label;
        return (
          <li key={entry.id} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black transition ${
                  active
                    ? 'bg-orange-500 text-white'
                    : done
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400'
                }`}
              >
                {done ? <Check size={13} strokeWidth={3} /> : index + 1}
              </span>
              <span
                className={`hidden whitespace-nowrap text-xs font-bold sm:inline ${
                  done
                    ? 'text-emerald-600 dark:text-emerald-300'
                    : active
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span
                className={`mx-2 h-0.5 flex-1 rounded-full transition ${
                  done ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-white/10'
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );

  const signedCard = (
    <div
      ref={successCardRef}
      className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center"
    >
      {/* Icône de validation animée (cercle vert + halo). */}
      <div className="relative mb-8">
        {justSigned && (
          <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-emerald-400/30" />
        )}
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 text-white shadow-2xl shadow-emerald-500/40 ring-8 ring-emerald-100 dark:ring-emerald-500/15">
          <Check size={52} strokeWidth={3} className="duration-500 animate-in zoom-in" />
        </div>
      </div>

      <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-300">
        {justSigned ? 'Devis signé avec succès' : 'Devis déjà signé'}
      </p>
      <h1 className="mt-3 text-3xl font-black leading-tight text-slate-900 dark:text-white sm:text-4xl">
        {justSigned
          ? '🎉 Félicitations, votre projet est officiellement lancé !'
          : 'Ce devis est déjà signé'}
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
        {justSigned
          ? 'Votre devis a été signé avec succès. Une copie sécurisée vient de vous être envoyée par email.'
          : 'La signature de ce devis a déjà été enregistrée. Vous pouvez retélécharger le document signé à tout moment.'}
      </p>

      {session.selectedVariantName && (
        <p className="mt-6 inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-300/30 dark:bg-emerald-400/10 dark:text-emerald-50">
          Configuration retenue : {session.selectedVariantName}
          {session?.quote?.totalTTC ? ` — ${currencyFormatter.format(session?.quote?.totalTTC)} TTC` : ''}
        </p>
      )}

      {session.signedDocumentUrl && (
        <a
          href={session.signedDocumentUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-10 inline-flex items-center justify-center gap-2.5 rounded-full bg-emerald-500 px-8 py-4 text-base font-bold text-white shadow-xl shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-600 hover:shadow-2xl hover:shadow-emerald-500/40"
        >
          <Download size={20} />
          Télécharger mon devis signé
        </a>
      )}

      <p className="mt-8 inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
        <ShieldCheck size={14} className="text-emerald-500" />
        Document archivé en lieu sûr — l’équipe SARANGE reste à votre disposition.
      </p>
    </div>
  );

  const refusedCard = (
    <div className="mx-auto mt-2 max-w-2xl rounded-3xl border border-red-200 bg-red-50 p-8 shadow-xl shadow-black/5 dark:border-red-300/20 dark:bg-red-500/10 dark:shadow-black/20">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
          <XCircle size={28} strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-red-700 dark:text-red-200">Refus enregistré</p>
          <h2 className="mt-2 text-xl font-black text-slate-900 dark:text-white">Votre refus a bien été pris en compte</h2>
          <p className="mt-3 text-sm leading-6 text-red-800 dark:text-red-50/90">
            Notre équipe sera notifiée automatiquement. Si besoin, nous reviendrons vers vous pour
            ajuster la proposition.
          </p>
        </div>
      </div>
    </div>
  );

  // Ville du chantier (pour le micro-header). Best-effort depuis l'adresse.
  const projetVille =
    (session?.recipient?.chantierAddress || session?.recipient?.address || '')
      .match(/\b\d{5}\s+([^,]+)/)?.[1]
      ?.trim() || '';
  const stickyTotal =
    displayTotalTTC != null ? currencyFormatter.format(displayTotalTTC) : '—';

  return (
    <main className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* ---- Micro-header sticky ---- */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-slate-900/85">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:px-8">
          <div className="flex min-w-0 items-baseline gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span className="truncate font-bold text-slate-800 dark:text-slate-100">
              Devis n°{displayQuoteNumber || '—'}
            </span>
            {projetVille && <span className="hidden truncate sm:inline">— Projet à {projetVille}</span>}
          </div>

          {(canAct || isSigned) && !isRefused && (
            <div className="lg:max-w-md lg:flex-1 lg:px-2">{stepBar}</div>
          )}

          <div className="flex shrink-0 items-center justify-between gap-3 lg:justify-end">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wider ${statusMeta.className}`}
            >
              {statusMeta.label}
            </span>
            <span className="text-base font-black text-slate-900 dark:text-white">
              {stickyTotal}
              <span className="ml-1 text-xs font-semibold text-slate-400">TTC</span>
            </span>
          </div>
        </div>
      </header>

      {/* ---- Contenu (large) ---- */}
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-28 sm:px-6 lg:px-8">
        {isSigned ? (
          signedCard
        ) : isRefused ? (
          refusedCard
        ) : (
          <>
            {(sessionMessage || submitMessage) && (
              <div className="mb-4 space-y-3">
                {sessionMessage && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-300/20 dark:bg-amber-400/10 dark:text-amber-100">
                    {sessionMessage}
                  </div>
                )}
                {submitMessage && (
                  <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-400/20 dark:bg-green-500/10 dark:text-green-100">
                    {submitMessage}
                  </div>
                )}
              </div>
            )}

            {/* ÉTAPE 1 — Lecture du devis */}
            {step === 'devis' && (
              <div key="step-devis" className="space-y-5 duration-300 animate-in fade-in slide-in-from-right-4">
                {canAct && isVariantQuote && (
                  <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-300/20 dark:bg-orange-400/5">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      Quelle configuration retenez-vous ?
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Choisissez la configuration à signer ; elle seule deviendra la commande engageante.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {variantOptions.map((variant, index) => {
                        const active = variant.id === selectedVariantId;
                        const letter = String.fromCharCode(65 + index);
                        return (
                          <button
                            key={variant.id}
                            type="button"
                            onClick={() => setSelectedVariantId(variant.id)}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition ${
                              active
                                ? 'border-orange-400 bg-orange-100 dark:bg-orange-500/15'
                                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/25'
                            }`}
                          >
                            <span className="flex items-center gap-2.5">
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                  active ? 'border-orange-400' : 'border-slate-400'
                                }`}
                              >
                                {active && <span className="h-2 w-2 rounded-full bg-orange-500" />}
                              </span>
                              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                {letter} · {variant.name || `Variante ${letter}`}
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-bold text-slate-900 dark:text-white">
                              {currencyFormatter.format(variant.totalTTC || 0)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {variantChoiceMissing && (
                      <p className="mt-2 text-xs font-bold text-orange-700 dark:text-orange-200">
                        Sélectionnez une configuration pour continuer.
                      </p>
                    )}
                  </div>
                )}

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 dark:border-white/10 dark:bg-slate-800">
                    <div className="flex items-center gap-3">
                      <FileText size={18} className="text-orange-500" />
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">Votre devis</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          Le document ci-dessous est exactement celui que vous signez. Faites défiler pour tout consulter.
                        </p>
                      </div>
                    </div>
                    <a
                      href={session.originalDocumentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 transition hover:bg-orange-100 dark:border-orange-400/30 dark:bg-orange-500/10 dark:text-orange-200"
                    >
                      <Download size={14} />
                      <span className="hidden sm:inline">Télécharger</span>
                    </a>
                  </div>
                  <MobilePdfViewer
                    url={session.originalDocumentUrl}
                    title="Aperçu du devis"
                    heightClass="h-[68vh]"
                  />
                </div>

                {canAct && <ValidityBadge issueDate={session.quote?.issueDate} />}
              </div>
            )}

            {/* ÉTAPE 2 — Personnalisation des panneaux */}
            {step === 'config' && hasPanels && (
              <div
                key="step-config"
                ref={panelSectionRef}
                className="space-y-5 duration-300 animate-in fade-in slide-in-from-right-4"
              >
                {signBlockedReason === 'panel' && (
                  <div className="flex items-start gap-2 rounded-2xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-700 dark:border-orange-400/40 dark:bg-orange-500/10 dark:text-orange-200">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                    Choisissez un panneau pour chaque porte pour continuer.
                  </div>
                )}
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
                  <div className="flex items-center gap-3">
                    <DoorOpen size={18} className="text-orange-500" />
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        Personnalisez le panneau de votre porte
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Choisissez le modèle de panneau décoratif pour chaque porte. La couleur est
                        déjà imposée par votre devis : aucun supplément de couleur.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {panelSelections.map((selection, index) => {
                    const chosen = panelChoices[selection.lineId];
                    const showSelector = !chosen || Boolean(reopenedPanels[selection.lineId]);
                    const params = new URLSearchParams({ embed: 'true' });
                    if (selection.colorLabel) params.set('couleur', selection.colorLabel);
                    const iframeSrc = `/selecteur-panneaux/selecteur.html?${params.toString()}`;
                    const couleur = chosen?.couleur || selection.colorLabel || '';
                    const meta = [
                      selection.widthMm && selection.heightMm
                        ? `${selection.widthMm} × ${selection.heightMm} mm`
                        : null,
                      selection.colorLabel ? `Couleur : ${selection.colorLabel}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    const isFs = fullscreenPanelId === selection.lineId;
                    const inError = !chosen && panelErrorIds.includes(selection.lineId);
                    const doorTitle = `${selection.productLabel}${
                      selection.repere ? ` — ${selection.repere}` : ''
                    }`;
                    return (
                      <div
                        key={selection.lineId}
                        ref={(el) => {
                          panelCardRefs.current[selection.lineId] = el;
                        }}
                        className={`overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-slate-900 ${
                          inError
                            ? `border-red-500 ring-2 ring-red-200 dark:border-red-500 dark:ring-red-500/30 ${
                                panelShake ? 'animate-shake' : ''
                              }`
                            : 'border-slate-200 dark:border-white/10'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-900">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{doorTitle}</p>
                            {meta && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{meta}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            {chosen ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                                <CheckCircle2 size={14} />
                                {chosen.panelName || chosen.panelRef || 'Panneau choisi'}
                              </span>
                            ) : inError ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700 dark:bg-red-500/15 dark:text-red-300">
                                <AlertTriangle size={13} />
                                Sélection requise
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                                À choisir
                              </span>
                            )}
                            {showSelector && (
                              <button
                                type="button"
                                onClick={() => setFullscreenPanelId(selection.lineId)}
                                className="hidden items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 md:inline-flex dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
                              >
                                <Maximize2 size={14} />
                                Agrandir
                              </button>
                            )}
                          </div>
                        </div>
                        {showSelector ? (
                          <>
                            {/* MOBILE : pas d'iframe inline. Un bouton ouvre le catalogue
                                en plein écran (par-dessus tout le site). */}
                            {!isFs && (
                              <div className="p-4 md:hidden">
                                <button
                                  type="button"
                                  onClick={() => setFullscreenPanelId(selection.lineId)}
                                  className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-100 py-4 text-base font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                                >
                                  <Search size={20} className="text-orange-500" />
                                  {panelSelections.length > 1
                                    ? `Choisir le panneau — Porte ${index + 1}`
                                    : 'Choisir son panneau de porte'}
                                </button>
                              </div>
                            )}

                            {/* DESKTOP : iframe inline (masquée en mobile) ET overlay plein
                                écran partagé (déclenché par « Agrandir » ou le bouton mobile). */}
                            <div
                              className={
                                isFs
                                  ? 'fixed inset-0 z-[100] flex flex-col bg-slate-900'
                                  : 'hidden md:flex md:flex-col'
                              }
                            >
                              <div
                                className={
                                  isFs
                                    ? 'flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white'
                                    : 'hidden'
                                }
                              >
                                <span className="truncate text-sm font-bold">{doorTitle}</span>
                                <button
                                  type="button"
                                  onClick={() => setFullscreenPanelId(null)}
                                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-white/20"
                                >
                                  Fermer
                                  <X size={16} />
                                </button>
                              </div>
                              <iframe
                                ref={(el) => {
                                  panelIframeRefs.current[selection.lineId] = el;
                                }}
                                src={iframeSrc}
                                title={`Sélecteur de panneau — ${selection.productLabel}`}
                                className={isFs ? 'w-full flex-1 border-0' : 'block h-[640px] w-full border-0'}
                                loading="lazy"
                              />
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
                            {chosen.image && (
                              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-white/10 dark:bg-slate-800">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={`/selecteur-panneaux/thumbs/${chosen.image}`}
                                  onError={(event) => {
                                    event.currentTarget.src = `/selecteur-panneaux/${chosen.image}`;
                                  }}
                                  alt={chosen.panelName || 'Panneau choisi'}
                                  className="h-40 w-auto max-w-full object-contain"
                                />
                              </div>
                            )}
                            <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-4 py-1.5 text-sm font-bold text-green-700 dark:bg-green-500/15 dark:text-green-300">
                              <CheckCircle2 size={16} />
                              Panneau {chosen.panelName || chosen.panelRef || ''} sélectionné avec succès
                            </span>
                            {couleur && (
                              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                Couleur : {couleur}
                              </p>
                            )}
                            <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
                              Rappel : vous avez sélectionné uniquement le panneau décoratif. La
                              quincaillerie (poignée, serrure) sera celle prévue dans les lignes de
                              votre devis.
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                setReopenedPanels((previous) => ({
                                  ...previous,
                                  [selection.lineId]: true,
                                }))
                              }
                              className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
                            >
                              🔄 Modifier mon choix
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ÉTAPE 3 — Signature (carte centrée) */}
            {step === 'signature' && (
              <div key="step-signature" className="mx-auto max-w-5xl duration-300 animate-in fade-in slide-in-from-right-4">
                <SignatureStep
                  ref={signatureStepRef}
                  session={session}
                  requiresReducedVat={requiresReducedVat}
                  onSubmit={handleSign}
                  isSubmitting={isSubmitting}
                  submitError={submitError}
                  onValidityChange={setSignatureReady}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* ---- Barre d'action fixe (sticky footer) ---- */}
      {canAct && !isSigned && !isRefused && (
        <footer className="sticky bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-slate-900/90 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              {currentIndex > 0 && (
                <button
                  type="button"
                  onClick={goPrev}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  <ChevronLeft size={16} />
                  <span className="hidden sm:inline">Retour</span>
                </button>
              )}
              <div className="flex flex-col text-xs sm:flex-row sm:items-center sm:gap-3">
                <button
                  type="button"
                  onClick={() => setContactModalOpen(true)}
                  className="text-slate-400 underline underline-offset-2 transition hover:text-slate-600 dark:hover:text-slate-300"
                >
                  Une question ?
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitError('');
                    setRefuseModalOpen(true);
                  }}
                  className="text-slate-400 underline underline-offset-2 transition hover:text-slate-600 dark:hover:text-slate-300"
                >
                  Refuser le devis
                </button>
              </div>
            </div>

            {step === 'signature' ? (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => signatureStepRef.current?.submit()}
                className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition disabled:cursor-not-allowed ${
                  signatureReady || isSubmitting
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30 ring-2 ring-orange-300/60 hover:bg-orange-600'
                    : 'bg-orange-200 text-orange-800 hover:bg-orange-300 dark:bg-orange-500/25 dark:text-orange-200 dark:hover:bg-orange-500/35'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Signature en cours…
                  </>
                ) : (
                  <>
                    <PenLine size={16} />
                    Signer et valider
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                disabled={step === 'devis' && variantChoiceMissing}
                className={`inline-flex items-center justify-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/30 transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none dark:disabled:bg-slate-700 dark:disabled:text-slate-400 ${
                  pulseContinue ? 'animate-pulse ring-4 ring-orange-300/60' : ''
                }`}
              >
                {step === 'devis' ? "J'ai pris connaissance" : 'Continuer'}
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </footer>
      )}

      {/* ---- Modales ---- */}
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

      {/* ---- Écran de chargement plein écran pendant la signature ---- */}
      {isSigning && (
        <PdfGenerationLoader
          title="Signature en cours"
          messages={[
            'Sécurisation de votre signature…',
            'Génération du contrat officiel…',
            'Envoi de la copie par email…',
            'Encore quelques instants…',
          ]}
        />
      )}
    </main>
  );
}