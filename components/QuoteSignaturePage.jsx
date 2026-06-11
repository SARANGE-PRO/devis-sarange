'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ImagePlus,
  Loader2,
  PenLine,
  RefreshCcw,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';

import {
  getQuoteNumberDisplay,
  getQuoteSignatureStatusMeta,
} from '@/lib/quote-signature';

const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

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

export default function QuoteSignaturePage({ token }) {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const successCardRef = useRef(null);
  const drawingRef = useRef(false);
  const activePointerIdRef = useRef(null);
  const activeStrokeRef = useRef([]);
  const strokesRef = useRef([]);
  const stampImageRef = useRef(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitMessage, setSubmitMessage] = useState('');
  const [signerName, setSignerName] = useState('');
  const [acceptReducedVat, setAcceptReducedVat] = useState(false);
  const [refusalReason, setRefusalReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [stampFileName, setStampFileName] = useState('');
  const [justSigned, setJustSigned] = useState(false);

  const redrawCanvas = () => {
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
    const projectPoint = (point) => ({
      x: point.x * width,
      y: point.y * height,
    });

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
  };

  const syncSignatureAvailability = () => {
    setHasSignature(Boolean(stampImageRef.current || strokesRef.current.length > 0));
  };

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

    resizeCanvas();
    const scheduleResize = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(resizeCanvas);
    };

    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleResize) : null;
    observer?.observe(canvas);
    window.addEventListener('resize', scheduleResize);

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      observer?.disconnect();
      window.removeEventListener('resize', scheduleResize);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      setLoading(true);
      setError('');
      setSubmitError('');
      setSubmitMessage('');
      setJustSigned(false);
      setAcceptReducedVat(false);
      setRefusalReason('');
      setStampFileName('');
      stampImageRef.current = null;
      strokesRef.current = [];
      activeStrokeRef.current = [];
      drawingRef.current = false;
      activePointerIdRef.current = null;

      try {
        const response = await fetch(`/api/quote-signatures/${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || 'Impossible de charger ce devis.');
        }

        if (cancelled) return;

        setSession(data);
        setSignerName(data?.recipient?.fullName || '');
        setHasSignature(false);
        redrawCanvas();
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError.message || 'Impossible de charger ce devis.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!justSigned || !successCardRef.current) return;
    successCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [justSigned]);

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
    if (isReadOnly) return;
    const point = getCanvasPoint(event);
    if (!point) return;

    event.preventDefault();
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    activeStrokeRef.current = [point];
    setSubmitError('');
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
    syncSignatureAvailability();
  };

  const handlePointerUp = (event) => {
    if (event?.pointerId != null && activePointerIdRef.current !== event.pointerId) return;
    if (!drawingRef.current) return;

    if (event?.pointerId != null) {
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {
        // Ignore capture release errors if the pointer is already released.
      }
    }

    activePointerIdRef.current = null;
    drawingRef.current = false;
    if (activeStrokeRef.current.length > 0) {
      strokesRef.current = [...strokesRef.current, activeStrokeRef.current];
    }
    activeStrokeRef.current = [];
    redrawCanvas();
    syncSignatureAvailability();
  };

  const clearDrawing = () => {
    strokesRef.current = [];
    activeStrokeRef.current = [];
    drawingRef.current = false;
    activePointerIdRef.current = null;
    redrawCanvas();
    syncSignatureAvailability();
    setSubmitError('');
  };

  const removeImportedStamp = () => {
    stampImageRef.current = null;
    setStampFileName('');
    redrawCanvas();
    syncSignatureAvailability();
    setSubmitError('');
  };

  const handleImportStamp = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setSubmitError("Le cachet importé doit être une image.");
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
      setSubmitError('');
      redrawCanvas();
      syncSignatureAvailability();
    } catch (nextError) {
      setSubmitError(nextError.message || "Impossible d'importer l'image.");
    }
  };

  const buildSignatureDataUrl = () => {
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

    const projectPoint = (point) => ({
      x: point.x * width,
      y: point.y * height,
    });

    strokesRef.current.forEach((stroke) => {
      drawStroke(context, stroke.map(projectPoint));
    });

    if (drawingRef.current && activeStrokeRef.current.length > 0) {
      drawStroke(context, activeStrokeRef.current.map(projectPoint));
    }

    return exportTrimmedTransparentPng(exportCanvas, Math.max(8, Math.round(12 * ratio)));
  };

  const handleSign = async () => {
    if (!session) return;
    if (!hasSignature) {
      setSubmitError('Ajoutez une signature ou importez un cachet avant de valider.');
      return;
    }
    if (session.requiresReducedVatAck && !acceptReducedVat) {
      setSubmitError('Confirmez la mention de TVA réduite avant de signer.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    setSubmitMessage('');

    try {
      const response = await fetch(`/api/quote-signatures/${encodeURIComponent(token)}/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signerName,
          acceptReducedVat,
          signatureDataUrl: buildSignatureDataUrl(),
        }),
      });
      const data = await response.json();

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
    }
  };

  const handleRefuse = async () => {
    if (!window.confirm('Confirmer le refus de ce devis ?')) return;

    setIsSubmitting(true);
    setSubmitError('');
    setSubmitMessage('');
    setJustSigned(false);

    try {
      const response = await fetch(`/api/quote-signatures/${encodeURIComponent(token)}/refuse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: refusalReason,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Impossible de refuser ce devis.');
      }

      setSession(data);
      setSubmitMessage('Le refus du devis a bien été enregistré.');
    } catch (nextError) {
      setSubmitError(nextError.message || 'Impossible de refuser ce devis.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const sessionMessage = getStatusMessage(session);
  const displayQuoteNumber = getQuoteNumberDisplay(session?.quote?.number);
  const statusMeta = getQuoteSignatureStatusMeta(session?.status);
  const isSigned = session?.status === 'signed';
  const isRefused = session?.status === 'refused';
  const isReadOnly =
    !session ||
    session.active === false ||
    ['signed', 'refused', 'expired'].includes(session.status || '');

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
            Signature de devis
          </p>
          <h1 className="mt-3 text-3xl font-black text-white">
            {displayQuoteNumber ? `Devis n°${displayQuoteNumber}` : 'Chargement du devis'}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">
            {isSigned
              ? 'Votre signature a bien été enregistrée. Vous pouvez retrouver votre devis signé juste ici.'
              : isRefused
                ? 'Votre refus a bien été enregistré. Nous reviendrons vers vous si nécessaire.'
                : 'Consultez votre devis, signez-le en ligne ou refusez-le si nécessaire.'}
          </p>
        </div>

        {loading && (
          <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            <Loader2 size={16} className="animate-spin" />
            Chargement du devis...
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100">
            {error}
          </div>
        )}

        {!loading && !error && session && (
          <div className="grid gap-5 xl:grid-cols-[1.4fr,0.9fr]">
            <section className="overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl shadow-black/20">
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                <p className="text-sm font-bold text-slate-900">Aperçu du devis</p>
                <p className="mt-1 text-xs text-slate-500">
                  Le document joint est celui qui sera signé.
                </p>
              </div>
              <iframe
                title="Aperçu du devis"
                src={session.originalDocumentUrl}
                className="h-[72vh] w-full bg-white"
              />
            </section>

            <aside className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">Récapitulatif</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Vérifiez les informations principales avant validation.
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
                      {session.quote.issueDate
                        ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(
                            new Date(session.quote.issueDate)
                          )
                        : '-'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-3">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                      Statut
                    </p>
                    <p className="mt-1 font-semibold text-white">{statusMeta.label}</p>
                  </div>
                </div>

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

                {submitError && (
                  <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {submitError}
                  </div>
                )}

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

              {isSigned ? (
                <div
                  ref={successCardRef}
                  className="relative overflow-hidden rounded-3xl border border-emerald-300/20 bg-gradient-to-br from-emerald-500/15 via-emerald-400/10 to-cyan-400/10 p-6 shadow-2xl shadow-black/20 backdrop-blur"
                >
                  {justSigned && (
                    <div className="pointer-events-none absolute left-8 top-8 h-16 w-16 rounded-full bg-emerald-300/25 animate-ping" />
                  )}
                  <div className="relative flex items-start gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-500/25">
                      <CheckCircle2 size={30} strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">
                        Signature validée
                      </p>
                      <h2 className="mt-2 text-2xl font-black text-white">
                        {justSigned
                          ? 'Votre devis a bien été signé'
                          : 'Ce devis est déjà signé'}
                      </h2>
                      <p className="mt-3 text-sm leading-6 text-emerald-50/90">
                        {justSigned
                          ? "Votre signature a été prise en compte immédiatement et un email de confirmation vous a été envoyé."
                          : "La signature de ce devis a déjà été enregistrée. Vous pouvez rouvrir le document signé à tout moment."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {session.signedDocumentUrl && (
                      <a
                        href={session.signedDocumentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
                      >
                        <RefreshCcw size={16} />
                        Ouvrir le devis signé
                      </a>
                    )}
                    <a
                      href={session.originalDocumentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/8 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/12"
                    >
                      <ShieldCheck size={16} />
                      Revoir le devis original
                    </a>
                  </div>
                </div>
              ) : isRefused ? (
                <div className="rounded-3xl border border-red-300/20 bg-red-500/10 p-6 shadow-2xl shadow-black/20 backdrop-blur">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-red-300 text-red-950">
                      <XCircle size={28} strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.24em] text-red-200">
                        Refus enregistré
                      </p>
                      <h2 className="mt-2 text-2xl font-black text-white">
                        Votre refus a bien été pris en compte
                      </h2>
                      <p className="mt-3 text-sm leading-6 text-red-50/90">
                        Notre équipe sera notifiée automatiquement. Si besoin, nous reviendrons vers
                        vous pour ajuster la proposition.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
                  <div className="mb-4 flex items-center gap-2">
                    <PenLine size={16} className="text-orange-300" />
                    <h2 className="text-base font-bold text-white">Zone de signature</h2>
                  </div>

                  <label className="block text-sm font-semibold text-slate-200">
                    Nom du signataire
                    <input
                      value={signerName}
                      onChange={(event) => setSignerName(event.target.value)}
                      disabled={isReadOnly || isSubmitting}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-300"
                      placeholder="Nom et prénom"
                    />
                  </label>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImportStamp}
                    className="hidden"
                  />

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isReadOnly || isSubmitting}
                      className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Upload size={15} />
                      Importer un cachet / image
                    </button>
                    {stampFileName && (
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200">
                        <ImagePlus size={14} className="text-orange-300" />
                        {stampFileName}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 rounded-2xl border border-dashed border-white/15 bg-white p-3">
                    <canvas
                      ref={canvasRef}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      className={`h-56 w-full rounded-xl border border-slate-200 bg-white ${
                        isReadOnly
                          ? 'pointer-events-none opacity-60'
                          : 'cursor-crosshair touch-none select-none'
                      }`}
                    />
                  </div>

                  <p className="mt-3 text-xs leading-5 text-slate-300">
                    Importez votre cachet d&apos;entreprise si vous le souhaitez. Vous pouvez signer
                    directement avec cette image, ou dessiner votre signature par-dessus dans la
                    zone blanche avec un tracé fluide et précis.
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={clearDrawing}
                      disabled={isReadOnly || isSubmitting}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Effacer la signature
                    </button>
                    <button
                      type="button"
                      onClick={removeImportedStamp}
                      disabled={isReadOnly || isSubmitting || !stampFileName}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                      Retirer le cachet
                    </button>
                  </div>

                  {session.requiresReducedVatAck && (
                    <label className="mt-4 flex gap-3 rounded-2xl border border-emerald-300/15 bg-emerald-500/10 p-4 text-sm text-emerald-50">
                      <input
                        type="checkbox"
                        checked={acceptReducedVat}
                        onChange={(event) => setAcceptReducedVat(event.target.checked)}
                        disabled={isReadOnly || isSubmitting}
                        className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-900"
                      />
                      <span>
                        Je confirme la mention obligatoire relative à la TVA réduite visible sur le
                        devis.
                      </span>
                    </label>
                  )}

                  <label className="mt-4 block text-sm font-semibold text-slate-200">
                    Motif de refus facultatif
                    <textarea
                      value={refusalReason}
                      onChange={(event) => setRefusalReason(event.target.value)}
                      disabled={isReadOnly || isSubmitting}
                      rows={3}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-300"
                      placeholder="Expliquez brièvement votre refus si besoin"
                    />
                  </label>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSign}
                      disabled={isReadOnly || isSubmitting}
                      className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Send size={16} />
                      )}
                      Signer le devis
                    </button>
                    <button
                      type="button"
                      onClick={handleRefuse}
                      disabled={isReadOnly || isSubmitting}
                      className="inline-flex items-center gap-2 rounded-full border border-red-300/30 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <XCircle size={16} />
                      Refuser le devis
                    </button>
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
