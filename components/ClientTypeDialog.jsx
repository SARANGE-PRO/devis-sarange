'use client';

import { useEffect, useRef } from 'react';
import { Building2, User } from 'lucide-react';
import { CLIENT_TYPES } from '@/lib/client-type.mjs';

/**
 * Choix du type de client (PARTICULIER / PROFESSIONNEL) au moment où il
 * devient obligatoire — génération, envoi ou signature du devis. Évite de
 * renvoyer l'utilisateur à l'étape « Client » : il choisit ici, et l'action
 * interrompue reprend automatiquement.
 */
export default function ClientTypeDialog({ open, actionLabel = '', onChoose, onCancel }) {
  const firstOptionRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel?.();
    };

    window.addEventListener('keydown', handleKeyDown);
    firstOptionRef.current?.focus();

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const options = [
    {
      value: CLIENT_TYPES.PARTICULIER,
      label: 'Particulier',
      icon: User,
      ref: firstOptionRef,
    },
    {
      value: CLIENT_TYPES.PROFESSIONNEL,
      label: 'Professionnel',
      icon: Building2,
      ref: null,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-type-dialog-title"
        className="animate-in fade-in zoom-in-95 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl duration-150"
      >
        <h2
          id="client-type-dialog-title"
          className="text-lg font-black tracking-tight text-slate-900"
        >
          Type de client
        </h2>
        {actionLabel && (
          <p className="mt-1 text-sm text-slate-500">Puis : {actionLabel}</p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          {options.map((option) => {
            const Icon = option.icon;

            return (
              <button
                key={option.value}
                ref={option.ref}
                type="button"
                onClick={() => onChoose?.(option.value)}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-4 py-6 text-sm font-bold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-orange-500 hover:bg-orange-50 hover:text-orange-600 focus:outline-none focus-visible:border-orange-500 focus-visible:ring-4 focus-visible:ring-orange-500/20"
              >
                <Icon size={22} />
                {option.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onCancel?.()}
          className="mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
