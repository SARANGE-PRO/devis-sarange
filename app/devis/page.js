'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import FirebaseAuthCard from '@/components/FirebaseAuthCard';
import { useFirebaseAuth } from '@/components/FirebaseProvider';
import { deleteQuoteById, saveQuoteDraft, subscribeToUserQuotes } from '@/lib/firebase/quotes';
import { formatQuoteUpdatedAt } from '@/lib/quote-cloud';
import { generateQuotePDF } from '@/lib/pdf-generator';
import {
  Copy,
  FileDown,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

export default function SavedQuotesPage() {
  const { user, initializing, isConfigured, signOut } = useFirebaseAuth();
  const [quotes, setQuotes] = useState([]);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    if (!isConfigured || initializing || !user) {
      setLoadingQuotes(false);
      return undefined;
    }

    setLoadingQuotes(true);

    const unsubscribe = subscribeToUserQuotes({
      userId: user.uid,
      onNext: (nextQuotes) => {
        setQuotes(nextQuotes);
        setLoadingQuotes(false);
      },
      onError: (error) => {
        setActionError(error.message || 'Impossible de charger vos devis.');
        setLoadingQuotes(false);
      },
    });

    return unsubscribe;
  }, [initializing, isConfigured, user]);

  const handleDelete = async (quoteId) => {
    if (!user) return;
    if (!window.confirm('Supprimer définitivement ce devis cloud ?')) return;

    setActionId(quoteId);
    setActionError('');
    setActionMessage('');

    try {
      await deleteQuoteById({ userId: user.uid, quoteId });
      setActionMessage('Devis supprimé.');
    } catch (error) {
      setActionError(error.message || 'Suppression impossible.');
    } finally {
      setActionId(null);
    }
  };

  const handleDuplicate = async (quote) => {
    if (!user) return;

    setActionId(quote.id);
    setActionError('');
    setActionMessage('');

    try {
      await saveQuoteDraft({
        userId: user.uid,
        title: `${quote.title || 'Devis'} copie`,
        clientData: quote.payload?.clientData,
        cartItems: quote.payload?.cartItems,
        tvaRate: quote.payload?.tvaRate,
        currentStep: quote.payload?.currentStep,
      });
      setActionMessage('Copie cloud créée.');
    } catch (error) {
      setActionError(error.message || 'Duplication impossible.');
    } finally {
      setActionId(null);
    }
  };

  const handleDownloadPdf = async (quote) => {
    setActionId(quote.id);
    setActionError('');
    setActionMessage('');

    try {
      await generateQuotePDF(
        quote.payload?.clientData || null,
        quote.payload?.cartItems || [],
        quote.payload?.tvaRate || 10
      );
    } catch (error) {
      setActionError(error.message || 'Impossible de générer le PDF.');
    } finally {
      setActionId(null);
    }
  };

  return (
    <AppShell
      title="Mes devis"
      subtitle="Retrouvez, modifiez et dupliquez vos devis enregistrés dans le cloud."
      actions={
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-700"
        >
          <Plus size={14} />
          Nouveau devis
        </Link>
      }
    >
      {!isConfigured && (
        <div className="mx-auto max-w-4xl rounded-2xl border border-orange-200 bg-orange-50 p-6 text-sm text-orange-900 shadow-sm">
          Firebase n’est pas encore configuré dans ce projet. Ajoutez d’abord vos clés dans `.env.local`.
        </div>
      )}

      {isConfigured && !user && !initializing && (
        <div className="mx-auto max-w-xl">
          <FirebaseAuthCard />
        </div>
      )}

      {isConfigured && user && (
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-orange-500">
                  Firebase
                </p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  Connecté en tant que {user.email}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Vos devis sont stockés dans votre espace cloud personnel.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
              >
                Déconnexion
              </button>
            </div>
          </div>

          {actionMessage && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {actionMessage}
            </div>
          )}

          {actionError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {actionError}
            </div>
          )}

          {loadingQuotes ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
              <Loader2 size={16} className="animate-spin" />
              Chargement de vos devis…
            </div>
          ) : quotes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <FolderOpen size={28} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Aucun devis enregistré</h3>
              <p className="mt-2 text-sm text-slate-500">
                Enregistrez un devis depuis l’écran principal pour le retrouver ici.
              </p>
              <Link
                href="/"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600"
              >
                <Plus size={16} />
                Créer mon premier devis
              </Link>
            </div>
          ) : (
            <div className="grid gap-4">
              {quotes.map((quote) => {
                const isWorking = actionId === quote.id;

                return (
                  <div
                    key={quote.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-bold text-slate-900">
                            {quote.title || 'Devis sans titre'}
                          </h3>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                            {quote.productCount || 0} produit(s)
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                          <span>Client : {quote.clientName || 'À définir'}</span>
                          <span>Réf : {quote.referenceDevis || 'Sans référence'}</span>
                          <span>MAJ : {formatQuoteUpdatedAt(quote.updatedAt)}</span>
                          <span>HT : {(quote.totalHT || 0).toFixed(2)} EUR</span>
                          <span>TTC : {(quote.totalTTC || 0).toFixed(2)} EUR</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/?quote=${quote.id}`}
                          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600"
                        >
                          <Pencil size={16} />
                          Modifier
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDownloadPdf(quote)}
                          disabled={isWorking}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:border-orange-300 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isWorking ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDuplicate(quote)}
                          disabled={isWorking}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Copy size={16} />
                          Dupliquer
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(quote.id)}
                          disabled={isWorking}
                          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 size={16} />
                          Supprimer
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
