'use client';

import Link from 'next/link';
import { Cloud, FolderOpen, Loader2, RefreshCw, Save } from 'lucide-react';
import {
  FIREBASE_REQUIRED_ENV_KEYS,
  isFirebaseConfigured,
} from '@/lib/firebase/client';
import { formatQuoteUpdatedAt } from '@/lib/quote-cloud';

export default function QuoteCloudPanel({
  user,
  authInitializing,
  quoteTitle,
  onQuoteTitleChange,
  onSave,
  onStartNew,
  activeQuoteId,
  isSaving,
  canSave,
  saveMessage,
  saveError,
  lastSavedAt,
  quoteLoadError,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-orange-100 p-2 text-orange-600">
              <Cloud size={18} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-orange-500">
                Mes devis
              </p>
              <h3 className="text-lg font-bold text-slate-900">Sauvegarde cloud</h3>
            </div>
          </div>
          <p className="hidden text-sm text-slate-500 sm:mt-2 sm:block">
            Le PDF enregistre aussi automatiquement votre devis dans Firebase pour le reprendre depuis n&apos;importe ou.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/devis"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:border-orange-300 hover:text-orange-600"
          >
            <FolderOpen size={16} />
            <span className="hidden sm:inline">Mes devis</span>
          </Link>
          <button
            type="button"
            onClick={onStartNew}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
          >
            <RefreshCw size={16} />
            <span className="hidden sm:inline">Nouveau</span>
          </button>
        </div>
      </div>

      {!isFirebaseConfigured && (
        <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
          <p className="font-semibold">Firebase n’est pas encore configuré dans ce projet.</p>
          <p className="mt-1 text-orange-800">
            Ajoutez les variables Firebase dans la configuration de l&apos;application :
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {FIREBASE_REQUIRED_ENV_KEYS.map((key) => (
              <span
                key={key}
                className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-700"
              >
                {key}
              </span>
            ))}
          </div>
        </div>
      )}

      {quoteLoadError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {quoteLoadError}
        </div>
      )}

      {isFirebaseConfigured && authInitializing && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" />
          Vérification de la session Firebase…
        </div>
      )}

      {isFirebaseConfigured && !authInitializing && !user && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Connectez-vous depuis{' '}
          <Link href="/devis" className="font-semibold text-orange-600 hover:text-orange-700">
            Mes devis
          </Link>{' '}
          pour activer la sauvegarde cloud.
        </div>
      )}

      {isFirebaseConfigured && user && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">
              Titre du devis
            </span>
            <input
              type="text"
              value={quoteTitle}
              onChange={(event) => onQuoteTitleChange(event.target.value)}
              placeholder="Ex : Rénovation maison Dupont"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
            />
            <p className="mt-2 text-xs text-slate-400">
              Connecté en tant que {user.email}
              {activeQuoteId ? ` · devis cloud ${activeQuoteId.slice(0, 8)}` : ' · nouveau devis'}
            </p>
          </label>

          <div className="flex flex-col justify-end gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave || isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {activeQuoteId ? 'Mettre à jour' : 'Enregistrer'}
            </button>
            <p className="text-xs text-slate-400">
              {lastSavedAt
                ? `Dernière sauvegarde : ${formatQuoteUpdatedAt(lastSavedAt)}`
                : 'Pas encore sauvegardé'}
            </p>
          </div>
        </div>
      )}

      {saveMessage && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {saveMessage}
        </div>
      )}

      {saveError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}

      {!canSave && isFirebaseConfigured && user && (
        <p className="mt-4 text-xs font-medium text-slate-400">
          Renseignez le client et ajoutez au moins un article avant d’enregistrer ce devis.
        </p>
      )}
    </div>
  );
}
