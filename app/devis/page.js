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
  ChevronDown,
  Copy,
  FileDown,
  FolderOpen,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from 'lucide-react';

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

const STATUS_META = {
  draft:    { label: 'Brouillon', className: 'bg-slate-100 text-slate-600' },
  sent:     { label: 'Envoyé',    className: 'bg-blue-100 text-blue-700' },
  signed:   { label: 'Signé',     className: 'bg-green-100 text-green-700' },
  archived: { label: 'Archivé',   className: 'bg-amber-100 text-amber-700' },
};

const normalizeSearchValue = (v) =>
  (typeof v === 'string' ? v : '').trim().toLowerCase();

const getTimestampMs = (value) => {
  if (!value) return 0;
  const d =
    typeof value?.toDate === 'function'
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

const matchesPeriodFilter = (quote, periodFilter) => {
  if (periodFilter === 'all') return true;
  const daysMap = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
  const days = daysMap[periodFilter];
  if (!days) return true;
  return getTimestampMs(quote.updatedAt) >= Date.now() - days * 86_400_000;
};

const getQuoteClientId = (quote) =>
  quote.clientId || quote.payload?.clientData?.savedClientId || '';

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
  const labels = (quote.payload?.cartItems || [])
    .map((item) => item.productLabel)
    .filter(Boolean);
  if (!labels.length) return 'Aucun article.';
  return labels.length <= 2
    ? labels.join(' / ')
    : `${labels.slice(0, 2).join(' / ')} +${labels.length - 2}`;
};

const sortQuotes = (quotes, sortBy) =>
  [...quotes].sort((l, r) => {
    if (sortBy === 'updated-asc')  return getTimestampMs(l.updatedAt) - getTimestampMs(r.updatedAt);
    if (sortBy === 'total-desc')   return (r.totalTTC || 0) - (l.totalTTC || 0);
    if (sortBy === 'total-asc')    return (l.totalTTC || 0) - (r.totalTTC || 0);
    if (sortBy === 'client-asc')   return (l.clientName || '').localeCompare(r.clientName || '', 'fr');
    return getTimestampMs(r.updatedAt) - getTimestampMs(l.updatedAt);
  });

/* ─── FiltersSheet — bottom sheet mobile ──────────────────────────────────── */
function FiltersSheet({
  isOpen, onClose,
  statusFilter, setStatusFilter,
  clientFilter, setClientFilter,
  periodFilter, setPeriodFilter,
  sortBy, setSortBy,
  clients,
  onReset, hasActive,
}) {
  const selectClass =
    'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-200 appearance-none';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filtres de recherche"
        className={`fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-3xl bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-orange-500" />
            <h3 className="font-bold text-slate-900">Filtres</h3>
          </div>
          <div className="flex items-center gap-2">
            {hasActive && (
              <button
                type="button"
                onClick={onReset}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-orange-600 hover:bg-orange-50"
              >
                Réinitialiser
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Options */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Statut</span>
            <div className="relative">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
                <option value="all">Tous</option>
                <option value="draft">Brouillons</option>
                <option value="sent">Envoyés</option>
                <option value="signed">Signés</option>
                <option value="archived">Archivés</option>
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Client</span>
            <div className="relative">
              <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className={selectClass}>
                <option value="all">Tous les clients</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.displayName}</option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Période</span>
            <div className="relative">
              <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} className={selectClass}>
                <option value="all">Toutes dates</option>
                <option value="7d">7 derniers jours</option>
                <option value="30d">30 derniers jours</option>
                <option value="90d">90 derniers jours</option>
                <option value="365d">12 derniers mois</option>
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Trier par</span>
            <div className="relative">
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={selectClass}>
                <option value="updated-desc">Plus récents</option>
                <option value="updated-asc">Plus anciens</option>
                <option value="total-desc">Montant décroissant</option>
                <option value="total-asc">Montant croissant</option>
                <option value="client-asc">Client A à Z</option>
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-5 py-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-orange-500 py-3.5 text-sm font-bold text-white transition-colors hover:bg-orange-600"
          >
            Appliquer
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── QuoteCard ──────────────────────────────────────────────────────────── */
function QuoteCard({ quote, isWorking, onDelete, onDuplicate, onDownloadPdf }) {
  const statusMeta = STATUS_META[quote.status || 'draft'] || STATUS_META.draft;
  const quoteClient =
    quote.clientName ||
    getClientDisplayName(quote.payload?.clientData) ||
    'Client à définir';
  const quoteLocation =
    quote.clientCity ||
    getClientFullLocation(quote.payload?.clientData) ||
    '—';
  const quoteContact =
    quote.clientEmail ||
    quote.clientPhone ||
    quote.payload?.clientData?.telephone ||
    '—';

  return (
    <div className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Accent bar */}
      <div className="h-1 w-full bg-gradient-to-r from-orange-400 to-amber-300" />

      <div className="p-4 sm:p-5">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="truncate text-base font-bold text-slate-900">
                {quote.title || 'Devis sans titre'}
              </h3>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.className}`}>
                {statusMeta.label}
              </span>
            </div>
            {quote.referenceDevis && (
              <span className="mt-0.5 inline-block text-[11px] font-semibold text-orange-600">
                Réf {quote.referenceDevis}
              </span>
            )}
            <p className="mt-1 line-clamp-1 text-xs text-slate-400">
              {getQuoteProductPreview(quote)}
            </p>
          </div>

          {/* Total TTC — prominent */}
          <div className="shrink-0 text-right">
            <p className="text-base font-black text-slate-900">
              {currencyFormatter.format(quote.totalTTC || 0)}
            </p>
            <p className="text-[11px] text-slate-400">
              HT {currencyFormatter.format(quote.totalHT || 0)}
            </p>
          </div>
        </div>

        {/* Info chips — 2×2 grid on mobile */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Client</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-700">{quoteClient}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ville</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-700">{quoteLocation}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contact</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-700">{quoteContact}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mis à jour</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-700">
              {formatQuoteUpdatedAt(quote.updatedAt)}
            </p>
          </div>
        </div>

        {/* Action row */}
        <div className="mt-3 flex items-center justify-between gap-2">
          {/* Modifier — primary action */}
          <Link
            href={`/?quote=${quote.id}`}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-600"
          >
            <Pencil size={15} />
            <span>Modifier</span>
          </Link>

          {/* Secondary icon actions */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Télécharger PDF"
              onClick={() => onDownloadPdf(quote)}
              disabled={isWorking}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-orange-300 hover:text-orange-600 disabled:opacity-50"
            >
              {isWorking ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
            </button>
            <button
              type="button"
              title="Dupliquer"
              onClick={() => onDuplicate(quote)}
              disabled={isWorking}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <Copy size={15} />
            </button>
            <button
              type="button"
              title="Supprimer"
              onClick={() => onDelete(quote.id)}
              disabled={isWorking}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-500 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function SavedQuotesPage() {
  const { user, initializing, isConfigured, signOut } = useFirebaseAuth();
  const [quotes, setQuotes]           = useState([]);
  const [clients, setClients]         = useState([]);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [loadingClients, setLoadingClients] = useState(true);
  const [actionId, setActionId]       = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [searchTerm, setSearchTerm]   = useState('');
  const [statusFilter, setStatusFilter]   = useState('all');
  const [clientFilter, setClientFilter]   = useState('all');
  const [periodFilter, setPeriodFilter]   = useState('all');
  const [sortBy, setSortBy]           = useState('updated-desc');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const deferredSearch = useDeferredValue(searchTerm);

  useEffect(() => {
    if (!isConfigured || initializing || !user) { setLoadingQuotes(false); return undefined; }
    setLoadingQuotes(true);
    return subscribeToUserQuotes({
      userId: user.uid,
      onNext: (q) => { setQuotes(q); setLoadingQuotes(false); },
      onError: (e) => { setActionError(e.message || 'Impossible de charger vos devis.'); setLoadingQuotes(false); },
    });
  }, [initializing, isConfigured, user]);

  useEffect(() => {
    if (!isConfigured || initializing || !user) { setLoadingClients(false); return undefined; }
    setLoadingClients(true);
    return subscribeToUserClients({
      userId: user.uid,
      onNext: (c) => { setClients(c); setLoadingClients(false); },
      onError: (e) => { setActionError(e.message || 'Impossible de charger vos clients.'); setLoadingClients(false); },
    });
  }, [initializing, isConfigured, user]);

  const handleDelete = async (quoteId) => {
    if (!user) return;
    if (!window.confirm('Supprimer définitivement ce devis cloud ?')) return;
    setActionId(quoteId); setActionError(''); setActionMessage('');
    try {
      await deleteQuoteById({ userId: user.uid, quoteId });
      setActionMessage('Devis supprimé.');
    } catch (e) {
      setActionError(e.message || 'Suppression impossible.');
    } finally { setActionId(null); }
  };

  const handleDuplicate = async (quote) => {
    if (!user) return;
    setActionId(quote.id); setActionError(''); setActionMessage('');
    try {
      await saveQuoteDraft({
        userId: user.uid,
        title: `${quote.title || 'Devis'} copie`,
        clientData: quote.payload?.clientData,
        cartItems: quote.payload?.cartItems,
        tvaRate: quote.payload?.tvaRate,
        quoteSettings: quote.payload?.quoteSettings,
        currentStep: quote.payload?.currentStep,
      });
      setActionMessage('Copie créée.');
    } catch (e) {
      setActionError(e.message || 'Duplication impossible.');
    } finally { setActionId(null); }
  };

  const handleDownloadPdf = async (quote) => {
    setActionId(quote.id); setActionError(''); setActionMessage('');
    try {
      await generateQuotePDF(
        quote.payload?.clientData || null,
        quote.payload?.cartItems || [],
        quote.payload?.tvaRate || 10,
        quote.payload?.quoteSettings || null
      );
    } catch (e) {
      setActionError(e.message || 'Impossible de générer le PDF.');
    } finally { setActionId(null); }
  };

  const normalizedSearch = normalizeSearchValue(deferredSearch);
  const hasActiveFilters =
    normalizedSearch || statusFilter !== 'all' || clientFilter !== 'all' ||
    periodFilter !== 'all' || sortBy !== 'updated-desc';

  const activeFilterCount = [
    normalizedSearch ? 1 : 0,
    statusFilter !== 'all' ? 1 : 0,
    clientFilter !== 'all' ? 1 : 0,
    periodFilter !== 'all' ? 1 : 0,
    sortBy !== 'updated-desc' ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const filteredQuotes = sortQuotes(
    quotes.filter((q) => {
      if (normalizedSearch && !getQuoteSearchText(q).includes(normalizedSearch)) return false;
      if (statusFilter !== 'all' && (q.status || 'draft') !== statusFilter) return false;
      if (clientFilter !== 'all' && getQuoteClientId(q) !== clientFilter) return false;
      return matchesPeriodFilter(q, periodFilter);
    }),
    sortBy
  );

  const visibleTotalTTC = filteredQuotes.reduce((s, q) => s + (q.totalTTC || 0), 0);
  const totalQuotesHT   = quotes.reduce((s, q) => s + (q.totalHT || 0), 0);

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
      subtitle="Retrouvez, filtrez et reprenez vos devis depuis votre espace cloud."
      actions={
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition-all hover:bg-slate-50 sm:px-4 sm:py-2 sm:text-sm"
        >
          <Plus size={13} />
          <span className="hidden sm:inline">Nouveau devis</span>
          <span className="sm:hidden">Nouveau</span>
        </Link>
      }
    >
      {/* ── Firebase non configuré ─────────────────────────────────────── */}
      {!isConfigured && (
        <div className="mx-auto max-w-4xl rounded-2xl border border-orange-200 bg-orange-50 p-5 text-sm text-orange-900 shadow-sm">
          Firebase n&apos;est pas encore configuré. Vérifiez la configuration de l&apos;application.
        </div>
      )}

      {/* ── Non connecté ───────────────────────────────────────────────── */}
      {isConfigured && !user && !initializing && (
        <div className="mx-auto max-w-xl">
          <FirebaseAuthCard />
        </div>
      )}

      {/* ── Connecté ───────────────────────────────────────────────────── */}
      {isConfigured && user && (
        <div className="mx-auto max-w-5xl space-y-5">

          {/* Compte + stats */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Header compte */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">
                  Cloud
                </p>
                <p className="truncate text-sm font-semibold text-slate-700">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="shrink-0 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-red-50 hover:text-red-500"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </div>

            {/* KPI stats — 2 col mobile, 4 col desktop */}
            <div className="grid grid-cols-2 gap-px bg-slate-100 lg:grid-cols-4">
              {[
                { label: 'Devis',         value: quotes.length,                              big: true },
                { label: 'Clients',        value: clients.length,                             big: true },
                { label: 'Portefeuille HT', value: currencyFormatter.format(totalQuotesHT),  big: false },
                { label: 'Dernière activité', value: quotes[0]?.updatedAt
                    ? formatQuoteUpdatedAt(quotes[0].updatedAt)
                    : '—',                                                                    big: false },
              ].map(({ label, value, big }) => (
                <div key={label} className="bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                  <p className={`mt-1 font-black text-slate-900 ${big ? 'text-2xl' : 'text-sm'}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Alerts */}
          {actionMessage && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              {actionMessage}
            </div>
          )}
          {actionError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {actionError}
            </div>
          )}

          {/* ── Barre de recherche + filtres ───────────────────────────── */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Recherche + bouton Filtres */}
            <div className="flex items-center gap-2 px-4 py-3 sm:px-5">
              <div className="relative flex-1">
                <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Nom, email, référence, ville..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-200"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-500"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Filtres button — mobile only */}
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className={`lg:hidden shrink-0 flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                  activeFilterCount > 0
                    ? 'border-orange-300 bg-orange-50 text-orange-700'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                <SlidersHorizontal size={15} />
                {activeFilterCount > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-black text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Réinitialiser — desktop */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="hidden lg:flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                >
                  <X size={14} />
                  Réinitialiser
                </button>
              )}
            </div>

            {/* Filtres desktop inline */}
            <div className="hidden lg:grid gap-3 grid-cols-4 border-t border-slate-100 px-5 py-4">
              {[
                {
                  label: 'Statut', value: statusFilter, onChange: setStatusFilter,
                  options: [
                    ['all', 'Tous'], ['draft', 'Brouillons'], ['sent', 'Envoyés'],
                    ['signed', 'Signés'], ['archived', 'Archivés'],
                  ],
                },
                {
                  label: 'Client', value: clientFilter, onChange: setClientFilter,
                  options: [['all', 'Tous les clients'], ...clients.map((c) => [c.id, c.displayName])],
                },
                {
                  label: 'Période', value: periodFilter, onChange: setPeriodFilter,
                  options: [
                    ['all', 'Toutes dates'], ['7d', '7 derniers jours'], ['30d', '30 derniers jours'],
                    ['90d', '90 derniers jours'], ['365d', '12 derniers mois'],
                  ],
                },
                {
                  label: 'Tri', value: sortBy, onChange: setSortBy,
                  options: [
                    ['updated-desc', 'Plus récents'], ['updated-asc', 'Plus anciens'],
                    ['total-desc', 'Montant ↓'], ['total-asc', 'Montant ↑'],
                    ['client-asc', 'Client A→Z'],
                  ],
                },
              ].map(({ label, value, onChange, options }) => (
                <label key={label} className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
                  <div className="relative">
                    <select
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    >
                      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </label>
              ))}
            </div>

            {/* Raccourcis clients */}
            {clients.length > 0 && (
              <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <Users size={11} />
                  Clients rapides
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {clients.slice(0, 6).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setClientFilter(clientFilter === c.id ? 'all' : c.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        clientFilter === c.id
                          ? 'border-orange-300 bg-orange-50 text-orange-700'
                          : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-orange-200 hover:text-orange-600'
                      }`}
                    >
                      {c.displayName}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Résultats stats ────────────────────────────────────────── */}
          {filteredQuotes.length > 0 && !loadingQuotes && (
            <div className="flex flex-wrap items-center gap-3 px-1 text-sm text-slate-500">
              <span className="font-semibold text-slate-900">{filteredQuotes.length} devis</span>
              <span>·</span>
              <span>Total TTC : <strong className="text-slate-900">{currencyFormatter.format(visibleTotalTTC)}</strong></span>
              {hasActiveFilters && (
                <>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-orange-600 font-semibold hover:underline"
                  >
                    Effacer filtres
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Loading ────────────────────────────────────────────────── */}
          {(loadingQuotes || loadingClients) && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
              <Loader2 size={16} className="animate-spin" />
              Chargement de votre espace cloud...
            </div>
          )}

          {/* ── Vide ───────────────────────────────────────────────────── */}
          {!loadingQuotes && quotes.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <FolderOpen size={24} />
              </div>
              <h3 className="text-base font-bold text-slate-900">Aucun devis enregistré</h3>
              <p className="mt-2 text-sm text-slate-500">
                Enregistrez un devis depuis l&apos;écran principal pour le retrouver ici.
              </p>
              <Link
                href="/"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600"
              >
                <Plus size={16} />
                Créer mon premier devis
              </Link>
            </div>
          )}

          {/* ── Pas de résultats filtrés ───────────────────────────────── */}
          {!loadingQuotes && quotes.length > 0 && filteredQuotes.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Search size={24} />
              </div>
              <h3 className="text-base font-bold text-slate-900">Aucun devis ne correspond</h3>
              <p className="mt-2 text-sm text-slate-500">
                Essayez une autre recherche ou réinitialisez les filtres.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <X size={16} />
                Effacer les filtres
              </button>
            </div>
          )}

          {/* ── Liste des devis ────────────────────────────────────────── */}
          {!loadingQuotes && filteredQuotes.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredQuotes.map((quote) => (
                <QuoteCard
                  key={quote.id}
                  quote={quote}
                  isWorking={actionId === quote.id}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onDownloadPdf={handleDownloadPdf}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Filters bottom sheet (mobile) ──────────────────────────────── */}
      <FiltersSheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        clientFilter={clientFilter} setClientFilter={setClientFilter}
        periodFilter={periodFilter} setPeriodFilter={setPeriodFilter}
        sortBy={sortBy} setSortBy={setSortBy}
        clients={clients}
        onReset={resetFilters}
        hasActive={hasActiveFilters}
      />
    </AppShell>
  );
}
