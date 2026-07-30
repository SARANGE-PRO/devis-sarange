'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import {
  MANUAL_CONFIRMATION_WARNING,
  MANUAL_VAT_SOURCES,
} from '@/lib/vat-verification.mjs';

/**
 * Confirmation manuelle DOCUMENTÉE d'un n° de TVA : source et référence sont
 * obligatoires, un justificatif peut être joint. Cette confirmation ouvrant la
 * facturation en autoliquidation, elle doit rester traçable.
 */
export default function VatConfirmationDialog({ open, vatNumber = '', onConfirm, onCancel }) {
  const [source, setSource] = useState('');
  const [comment, setComment] = useState('');
  const [attachment, setAttachment] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const sourceRef = useRef(null);

  // Les champs repartent vierges à chaque ouverture : l'appelant remonte le
  // composant via une `key` (pas de réinitialisation d'état dans un effet).
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel?.();
    };

    window.addEventListener('keydown', handleKeyDown);
    sourceRef.current?.focus();

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const trimmedComment = comment.trim();
  const isComplete = Boolean(source && trimmedComment);

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!isComplete) {
      setShowErrors(true);
      return;
    }

    onConfirm?.({ source, comment: trimmedComment, attachment: attachment.trim() });
  };

  const fieldClasses =
    'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:border-slate-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel?.();
      }}
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vat-confirmation-title"
        className="animate-in fade-in zoom-in-95 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl duration-150"
      >
        <h2 id="vat-confirmation-title" className="text-lg font-black tracking-tight text-slate-900">
          Confirmer le numéro de TVA
        </h2>
        {vatNumber && (
          <p className="mt-1 font-mono text-sm font-bold text-slate-600">{vatNumber}</p>
        )}

        <div className="mt-4 flex items-start gap-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
          <p className="text-xs font-semibold leading-relaxed text-amber-800">
            {MANUAL_CONFIRMATION_WARNING}
          </p>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">
              Source de la confirmation
            </span>
            <select
              ref={sourceRef}
              value={source}
              onChange={(event) => setSource(event.target.value)}
              className={fieldClasses}
            >
              <option value="">Sélectionnez une source…</option>
              {MANUAL_VAT_SOURCES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {showErrors && !source && (
              <p className="mt-1 text-xs font-semibold text-red-500">
                Choisissez la source du numéro.
              </p>
            )}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">
              Référence ou commentaire
            </span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
              placeholder="Ex : facture 2026-0142 du 12/03/2026 transmise par le client"
              className={fieldClasses}
            />
            {showErrors && !trimmedComment && (
              <p className="mt-1 text-xs font-semibold text-red-500">
                Indiquez la référence du document ou de la consultation.
              </p>
            )}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">
              Justificatif (facultatif)
            </span>
            <input
              type="text"
              value={attachment}
              onChange={(event) => setAttachment(event.target.value)}
              placeholder="Lien ou référence du document conservé"
              className={fieldClasses}
            />
          </label>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="submit"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600"
          >
            <ShieldCheck size={16} />
            Confirmer ce numéro
          </button>
          <button
            type="button"
            onClick={() => onCancel?.()}
            className="rounded-xl px-5 py-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
