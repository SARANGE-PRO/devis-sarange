'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import FirebaseAuthCard from '@/components/FirebaseAuthCard';
import { useFirebaseAuth } from '@/components/FirebaseProvider';
import { getClientDisplayName, getClientFullLocation } from '@/lib/client-cloud';
import { subscribeToUserClients } from '@/lib/firebase/clients';
import { deleteQuoteById, saveQuoteDraft, subscribeToUserQuotes } from '@/lib/firebase/quotes';
import { generateQuotePDF } from '@/lib/pdf-generator';
import { formatQuoteUpdatedAt } from '@/lib/quote-cloud';
import {
  Copy,
  FileDown,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from 'lucide-react';

const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

const STATUS_META = {
  draft: { label: 'Brouillon', className: 'bg-slate-100 text-slate-600' },
  sent: { label: 'Envoye', className: 'bg-blue-100 text-blue-700' },
  signed: { label: 'Signe', className: 'bg-green-100 text-green-700' },
  archived: { label: 'Archive', className: 'bg-amber-100 text-amber-700' },
};

const normalizeSearchValue = (value) =>
  (typeof value === 'string' ? value : '').trim().toLowerCase();

const getTimestampMs = (value) => {
  if (!value) return 0;
  const asDate =
    typeof value?.toDate === 'function'
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);
  return Number.isNaN(asDate.getTime()) ? 0 : asDate.getTime();
};

const matchesPeriodFilter = (quote, periodFilter) => {
  if (periodFilter === 'all') return true;
  const daysMap = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
  const days = daysMap[periodFilter];
  if (!days) return true;
  return getTimestampMs(quote.updatedAt) >= Date.now() - days * 24 * 60 * 60 * 1000;
};

const getQuoteClientId = (quote) => quote.clientId || quote.payload?.clientData?.savedClientId || '';

const getQuoteSearchText = (quote) =>
  normalizeSearchValue(
    quote.searchText ||
      [
        quote.title,
        quote.clientName,
        quote.clientEmail,
        quote.clientPhone,
        quote.clientCity,
        quote.referenceDevis,
      ]
        .filter(Boolean)
        .join(' ')
  );

const getQuoteProductPreview = (quote) => {
  const labels = (quote.payload?.cartItems || []).map((item) => item.productLabel).filter(Boolean);
  if (!labels.length) return 'Aucun article detaille pour ce devis.';
  return labels.length <= 3 ? labels.join(' / ') : `${labels.slice(0, 3).join(' / ')} / +${labels.length - 3} autre(s)`;
};

const sortQuotes = (quotes, sortBy) =>
  [...quotes].sort((left, right) => {
    if (sortBy === 'updated-asc') return getTimestampMs(left.updatedAt) - getTimestampMs(right.updatedAt);
    if (sortBy === 'total-desc') return (right.totalTTC || 0) - (left.totalTTC || 0);
    if (sortBy === 'total-asc') return (left.totalTTC || 0) - (right.totalTTC || 0);
    if (sortBy === 'client-asc') return (left.clientName || '').localeCompare(right.clientName || '', 'fr');
    return getTimestampMs(right.updatedAt) - getTimestampMs(left.updatedAt);
  });

export default function SavedQuotesPage() {
  const { user, initializing, isConfigured, signOut } = useFirebaseAuth();
  const [quotes, setQuotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [loadingClients, setLoadingClients] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [sortBy, setSortBy] = useState('updated-desc');

  const deferredSearchTerm = useDeferredValue(searchTerm);

  useEffect(() => {
    if (!isConfigured || initializing || !user) {
      setLoadingQuotes(false);
      return undefined;
    }

    setLoadingQuotes(true);
    return subscribeToUserQuotes({
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
  }, [initializing, isConfigured, user]);

  useEffect(() => {
    if (!isConfigured || initializing || !user) {
      setLoadingClients(false);
      return undefined;
    }

    setLoadingClients(true);
    return subscribeToUserClients({
      userId: user.uid,
      onNext: (nextClients) => {
        setClients(nextClients);
        setLoadingClients(false);
      },
      onError: (error) => {
        setActionError(error.message || 'Impossible de charger vos clients memorises.');
        setLoadingClients(false);
      },
    });
  }, [initializing, isConfigured, user]);

  const handleDelete = async (quoteId) => {
    if (!user) return;
    if (!window.confirm('Supprimer definitivement ce devis cloud ?')) return;
    setActionId(quoteId);
    setActionError('');
    setActionMessage('');
    try {
      await deleteQuoteById({ userId: user.uid, quoteId });
      setActionMessage('Devis supprime.');
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
      setActionMessage('Copie cloud creee.');
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
      setActionError(error.message || 'Impossible de generer le PDF.');
    } finally {
      setActionId(null);
    }
  };

  const normalizedSearchTerm = normalizeSearchValue(deferredSearchTerm);
  const hasActiveFilters =
    normalizedSearchTerm || statusFilter !== 'all' || clientFilter !== 'all' || periodFilter !== 'all' || sortBy !== 'updated-desc';

  const filteredQuotes = sortQuotes(
    quotes.filter((quote) => {
      if (normalizedSearchTerm && !getQuoteSearchText(quote).includes(normalizedSearchTerm)) return false;
      if (statusFilter !== 'all' && (quote.status || 'draft') !== statusFilter) return false;
      if (clientFilter !== 'all' && getQuoteClientId(quote) !== clientFilter) return false;
      return matchesPeriodFilter(quote, periodFilter);
    }),
    sortBy
  );

  const visibleTotalHT = filteredQuotes.reduce((sum, quote) => sum + (quote.totalHT || 0), 0);
  const visibleTotalTTC = filteredQuotes.reduce((sum, quote) => sum + (quote.totalTTC || 0), 0);
  const visibleClientCount = new Set(
    filteredQuotes.map((quote) => getQuoteClientId(quote) || quote.clientEmail || quote.clientName || null).filter(Boolean)
  ).size;
  const totalQuotesHT = quotes.reduce((sum, quote) => sum + (quote.totalHT || 0), 0);
  const recentClients = clients.slice(0, 5);

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setClientFilter('all');
    setPeriodFilter('all');
    setSortBy('updated-desc');
  };

  return (
    <AppShell
      title="Mes devis"
      subtitle="Retrouvez, filtrez et reprenez vos devis et vos clients depuis votre espace cloud."
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
          Firebase n&apos;est pas encore configure dans ce projet. Ajoutez d&apos;abord vos cles dans `.env.local`.
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
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-orange-500">
                  Firebase
                </p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  Connecte en tant que {user.email}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Vos devis et vos fiches clients sont stockes dans votre espace cloud personnel.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
              >
                Deconnexion
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Devis</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{quotes.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Clients memorises
                </p>
                <p className="mt-2 text-2xl font-black text-slate-900">{clients.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Portefeuille HT
                </p>
                <p className="mt-2 text-2xl font-black text-slate-900">
                  {currencyFormatter.format(totalQuotesHT)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Derniere activite
                </p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  {quotes[0]?.updatedAt ? formatQuoteUpdatedAt(quotes[0].updatedAt) : 'Aucune'}
                </p>
              </div>
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

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="rounded-xl bg-orange-100 p-2 text-orange-600">
                    <SlidersHorizontal size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-orange-500">
                      Recherche
                    </p>
                    <h3 className="text-lg font-bold text-slate-900">Filtres rapides</h3>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Recherchez par client, reference, email, ville ou contenu du devis.
                </p>
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                >
                  <X size={16} />
                  Reinitialiser
                </button>
              )}
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-5">
              <label className="block lg:col-span-2">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Barre de recherche
                </span>
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Ex : Dupont, PROJET-2026, Melun, porte entree..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Statut</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                >
                  <option value="all">Tous</option>
                  <option value="draft">Brouillons</option>
                  <option value="sent">Envoyes</option>
                  <option value="signed">Signes</option>
                  <option value="archived">Archives</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Client</span>
                <select
                  value={clientFilter}
                  onChange={(event) => setClientFilter(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                >
                  <option value="all">Tous les clients</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.displayName}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Periode
                  </span>
                  <select
                    value={periodFilter}
                    onChange={(event) => setPeriodFilter(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  >
                    <option value="all">Toutes dates</option>
                    <option value="7d">7 derniers jours</option>
                    <option value="30d">30 derniers jours</option>
                    <option value="90d">90 derniers jours</option>
                    <option value="365d">12 derniers mois</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">Tri</span>
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  >
                    <option value="updated-desc">Plus recents</option>
                    <option value="updated-asc">Plus anciens</option>
                    <option value="total-desc">Montant decroissant</option>
                    <option value="total-asc">Montant croissant</option>
                    <option value="client-asc">Client A a Z</option>
                  </select>
                </label>
              </div>
            </div>

            {clients.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                  <Users size={14} />
                  Raccourcis clients
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentClients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => setClientFilter(client.id)}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
                        clientFilter === client.id
                          ? 'border-orange-300 bg-orange-50 text-orange-700'
                          : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-orange-200 hover:text-orange-600'
                      }`}
                    >
                      {client.displayName}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {(loadingQuotes || loadingClients) && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
              <Loader2 size={16} className="animate-spin" />
              Chargement de votre espace cloud...
            </div>
          )}

          {!loadingQuotes && quotes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <FolderOpen size={28} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Aucun devis enregistre</h3>
              <p className="mt-2 text-sm text-slate-500">
                Enregistrez un devis depuis l&apos;ecran principal pour le retrouver ici.
              </p>
              <Link
                href="/"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600"
              >
                <Plus size={16} />
                Creer mon premier devis
              </Link>
            </div>
          ) : !loadingQuotes && filteredQuotes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Search size={28} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Aucun devis ne correspond</h3>
              <p className="mt-2 text-sm text-slate-500">
                Essayez une autre recherche ou reinitialisez les filtres.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <X size={16} />
                Effacer les filtres
              </button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">Resultats</p>
                  <p className="mt-2 text-2xl font-black text-slate-900">{filteredQuotes.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Clients visibles
                  </p>
                  <p className="mt-2 text-2xl font-black text-slate-900">{visibleClientCount}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Total HT visible
                  </p>
                  <p className="mt-2 text-2xl font-black text-slate-900">
                    {currencyFormatter.format(visibleTotalHT)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Total TTC visible
                  </p>
                  <p className="mt-2 text-2xl font-black text-slate-900">
                    {currencyFormatter.format(visibleTotalTTC)}
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                {filteredQuotes.map((quote) => {
                  const isWorking = actionId === quote.id;
                  const statusMeta = STATUS_META[quote.status || 'draft'] || STATUS_META.draft;
                  const quoteClient =
                    quote.clientName ||
                    getClientDisplayName(quote.payload?.clientData) ||
                    'Client a definir';
                  const quoteLocation =
                    quote.clientCity ||
                    getClientFullLocation(quote.payload?.clientData) ||
                    'Lieu a definir';
                  const quoteContact =
                    quote.clientEmail ||
                    quote.clientPhone ||
                    quote.payload?.clientData?.telephone ||
                    'Contact a completer';

                  return (
                    <div
                      key={quote.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-lg font-bold text-slate-900">
                              {quote.title || 'Devis sans titre'}
                            </h3>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusMeta.className}`}
                            >
                              {statusMeta.label}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                              {quote.productCount || 0} produit(s)
                            </span>
                            {quote.referenceDevis && (
                              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
                                Ref {quote.referenceDevis}
                              </span>
                            )}
                          </div>

                          <p className="mt-2 text-sm text-slate-500">{getQuoteProductPreview(quote)}</p>

                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                                Client
                              </p>
                              <p className="mt-1 text-sm font-bold text-slate-900">{quoteClient}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                                Contact
                              </p>
                              <p className="mt-1 text-sm font-bold text-slate-900">{quoteContact}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                                Ville / CP
                              </p>
                              <p className="mt-1 text-sm font-bold text-slate-900">{quoteLocation}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                                Mise a jour
                              </p>
                              <p className="mt-1 text-sm font-bold text-slate-900">
                                {formatQuoteUpdatedAt(quote.updatedAt)}
                              </p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                                Total TTC
                              </p>
                              <p className="mt-1 text-sm font-bold text-slate-900">
                                {currencyFormatter.format(quote.totalTTC || 0)}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                HT {currencyFormatter.format(quote.totalHT || 0)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 xl:max-w-[320px] xl:justify-end">
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
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
