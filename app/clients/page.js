'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import FirebaseAuthCard from '@/components/FirebaseAuthCard';
import { useFirebaseAuth } from '@/components/FirebaseProvider';
import {
  EMPTY_CLIENT_DATA,
  getClientDisplayName,
  getClientFullLocation,
  hasMeaningfulClientData,
  sanitizeClientData,
} from '@/lib/client-cloud';
import {
  deleteClientById,
  saveClientProfile,
  subscribeToUserClients,
} from '@/lib/firebase/clients';
import { formatQuoteUpdatedAt } from '@/lib/quote-cloud';
import {
  ArrowRight,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Save,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';

const normalizeSearchValue = (value) =>
  (typeof value === 'string' ? value : '').trim().toLowerCase();

/* ─── Drawer ────────────────────────────────────────────────────────────── */
function EditDrawer({ isOpen, isCreating, editingClientData, workingClientId, editingClientId, onChange, onSave, onCancel }) {
  const inputClasses =
    'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-200';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Sheet — slides up on mobile, slides in from right on desktop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isCreating ? 'Nouvelle fiche client' : 'Modifier la fiche client'}
        className={`fixed z-50 flex flex-col bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          /* mobile: bottom sheet */
          bottom-0 left-0 right-0 max-h-[92dvh] rounded-t-3xl
          /* desktop: right panel */
          md:bottom-auto md:top-0 md:left-auto md:right-0 md:h-full md:w-[480px] md:max-h-none md:rounded-none md:rounded-l-3xl
          ${isOpen
            ? 'translate-y-0 md:translate-y-0 md:translate-x-0'
            : 'translate-y-full md:translate-y-0 md:translate-x-full'
          }`}
      >
        {/* Handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="h-1 w-10 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">
              {isCreating ? 'Nouveau' : 'Édition'}
            </p>
            <h3 className="mt-0.5 text-lg font-bold text-slate-900">
              {isCreating ? 'Nouvelle fiche client' : 'Modifier la fiche'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Nom</span>
              <input name="nom" value={editingClientData.nom} onChange={onChange} className={inputClasses} placeholder="Dupont" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Prénom</span>
              <input name="prenom" value={editingClientData.prenom} onChange={onChange} className={inputClasses} placeholder="Jean" />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Mail size={14} className="text-slate-400" /> Email
              </span>
              <input name="email" value={editingClientData.email} onChange={onChange} className={inputClasses} placeholder="jean.dupont@email.com" type="email" inputMode="email" />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Phone size={14} className="text-slate-400" /> Téléphone
              </span>
              <input name="telephone" value={editingClientData.telephone} onChange={onChange} className={inputClasses} placeholder="06 12 34 56 78" type="tel" inputMode="tel" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Référence</span>
              <input name="referenceDevis" value={editingClientData.referenceDevis} onChange={onChange} className={inputClasses} placeholder="PROJET-2026-A" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <MapPin size={14} className="text-slate-400" /> Adresse
              </span>
              <input name="adresse" value={editingClientData.adresse} onChange={onChange} className={inputClasses} placeholder="12 Rue de la Paix" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Code postal</span>
              <input name="codePostal" value={editingClientData.codePostal} onChange={onChange} className={inputClasses} placeholder="77000" inputMode="numeric" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Ville</span>
              <input name="ville" value={editingClientData.ville} onChange={onChange} className={inputClasses} placeholder="Melun" />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-slate-200 bg-white py-3.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={workingClientId === editingClientId || workingClientId === 'new'}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 py-3.5 text-sm font-bold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {workingClientId === editingClientId || workingClientId === 'new' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Client Card ────────────────────────────────────────────────────────── */
function ClientCard({ client, isWorking, onEdit, onDelete }) {
  const clientLabel = client.displayName || getClientDisplayName(client.payload);

  return (
    <div className="group flex flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Top accent line */}
      <div className="h-1 w-full bg-gradient-to-r from-orange-400 to-orange-300" />

      <div className="flex flex-col gap-4 p-4 sm:p-5">
        {/* Name + badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold text-slate-900 sm:text-lg">{clientLabel}</h3>
            {client.referenceHint && (
              <span className="mt-1 inline-block rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700">
                Ref {client.referenceHint}
              </span>
            )}
          </div>
          {/* Use button — icon on mobile, full on sm+ */}
          <Link
            href={`/?client=${client.id}`}
            className="shrink-0 flex items-center gap-2 rounded-xl bg-orange-500 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-orange-600 sm:px-4 sm:py-2.5"
          >
            <span className="hidden xs:inline">Utiliser</span>
            <ArrowRight size={16} />
          </Link>
        </div>

        {/* Info chips */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contact</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-700">
              {client.telephone || client.email || '—'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ville</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-700">
              {getClientFullLocation(client.payload) || '—'}
            </p>
          </div>
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px] text-slate-400">
            {formatQuoteUpdatedAt(client.lastUsedAt || client.updatedAt)}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(client)}
              disabled={isWorking}
              title="Modifier"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-orange-300 hover:text-orange-600 disabled:opacity-50"
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(client)}
              disabled={isWorking}
              title="Supprimer"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-500 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              {isWorking ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function ClientsPage() {
  const { user, initializing, isConfigured } = useFirebaseAuth();
  const [clients, setClients] = useState([]);
  const [clientsOwnerId, setClientsOwnerId] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingClientId, setEditingClientId] = useState('');
  const [editingClientData, setEditingClientData] = useState({ ...EMPTY_CLIENT_DATA });
  const [workingClientId, setWorkingClientId] = useState('');

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const normalizedSearchTerm = normalizeSearchValue(deferredSearchTerm);

  useEffect(() => {
    if (!isConfigured || initializing || !user) return undefined;

    return subscribeToUserClients({
      userId: user.uid,
      onNext: (nextClients) => {
        setClients(nextClients);
        setClientsOwnerId(user.uid);
      },
      onError: (error) => {
        setActionError(error.message || 'Impossible de charger votre portefeuille client.');
        setClientsOwnerId(user.uid);
      },
    });
  }, [initializing, isConfigured, user]);

  const filteredClients = clients.filter((client) => {
    if (!normalizedSearchTerm) return true;
    const haystack = (client.searchText || '').toLowerCase();
    return haystack.includes(normalizedSearchTerm);
  });

  const loadingClients = isConfigured && !initializing && !!user && clientsOwnerId !== user.uid;
  const isEditing = Boolean(editingClientId);
  const isCreating = editingClientId === 'new';

  const startCreateClient = () => {
    setEditingClientId('new');
    setEditingClientData({ ...EMPTY_CLIENT_DATA });
    setActionError('');
    setActionMessage('');
  };

  const startEditClient = (client) => {
    setEditingClientId(client.id);
    setEditingClientData(sanitizeClientData(client.payload));
    setActionError('');
    setActionMessage('');
  };

  const cancelEdit = () => {
    setEditingClientId('');
    setEditingClientData({ ...EMPTY_CLIENT_DATA });
  };

  const handleEditorChange = (event) => {
    const { name, value, type, checked } = event.target;
    setEditingClientData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSaveClient = async () => {
    if (!user) return;

    if (!hasMeaningfulClientData(editingClientData)) {
      setActionError(
        'Renseignez au moins un nom, un email, un telephone ou une adresse avant de sauvegarder.'
      );
      return;
    }

    const targetId = editingClientId || 'new';
    setWorkingClientId(targetId);
    setActionError('');
    setActionMessage('');

    try {
      const savedClient = await saveClientProfile({
        userId: user.uid,
        clientId: editingClientId === 'new' ? null : editingClientId,
        clientData: editingClientData,
      });

      setActionMessage(
        editingClientId === 'new'
          ? 'Nouvelle fiche client créée.'
          : 'Fiche client mise à jour.'
      );
      setEditingClientId('');
      setEditingClientData({ ...EMPTY_CLIENT_DATA });
      setWorkingClientId('');

      if (savedClient?.id) {
        setSearchTerm(savedClient.displayName || '');
      }
    } catch (error) {
      setActionError(error.message || 'Impossible d\'enregistrer cette fiche client.');
      setWorkingClientId('');
    }
  };

  const handleDeleteClient = async (client) => {
    if (!user) return;

    const clientLabel = client.displayName || getClientDisplayName(client.payload);
    if (!window.confirm(`Supprimer définitivement la fiche client "${clientLabel}" ?`)) {
      return;
    }

    setWorkingClientId(client.id);
    setActionError('');
    setActionMessage('');

    try {
      await deleteClientById({ userId: user.uid, clientId: client.id });
      setActionMessage('Fiche client supprimée.');

      if (editingClientId === client.id) {
        cancelEdit();
      }
    } catch (error) {
      setActionError(error.message || 'Impossible de supprimer cette fiche client.');
    } finally {
      setWorkingClientId('');
    }
  };

  return (
    <AppShell
      title="Portefeuille client"
      subtitle="Retrouvez et gérez vos fiches clients."
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startCreateClient}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-700"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Nouvelle fiche</span>
            <span className="sm:hidden">Client</span>
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-700"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Nouveau devis</span>
            <span className="sm:hidden">Devis</span>
          </Link>
        </div>
      }
    >
      {/* Firebase not configured */}
      {!isConfigured && (
        <div className="mx-auto max-w-4xl rounded-2xl border border-orange-200 bg-orange-50 p-6 text-sm text-orange-900 shadow-sm">
          Firebase n&apos;est pas encore configuré dans ce projet. Ajoutez d&apos;abord vos clés
          dans la configuration de l&apos;application.
        </div>
      )}

      {/* Not logged in */}
      {isConfigured && !user && !initializing && (
        <div className="mx-auto max-w-xl">
          <FirebaseAuthCard />
        </div>
      )}

      {/* Main content */}
      {isConfigured && user && (
        <div className="mx-auto max-w-5xl space-y-5">

          {/* Stats + Search bar */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Stats row */}
            <div className="flex items-center gap-4 border-b border-slate-100 px-4 py-4 sm:px-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
                <Users size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">
                  Clients
                </p>
                <p className="truncate text-sm font-bold text-slate-900">
                  {clients.length} fiche{clients.length !== 1 ? 's' : ''} mémorisée{clients.length !== 1 ? 's' : ''}
                </p>
              </div>
              {/* FAB — visible on all sizes inside stats bar */}
              <button
                type="button"
                onClick={startCreateClient}
                className="shrink-0 flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-orange-200 shadow-md transition-all hover:bg-orange-600 active:scale-95 sm:hidden"
              >
                <Plus size={16} />
                Nouveau
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-3 sm:px-5">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Nom, email, téléphone, ville..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition-all focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-200"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-slate-500 transition-colors hover:bg-slate-300"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
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

          {/* List */}
          {loadingClients ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
              <Loader2 size={16} className="animate-spin" />
              Chargement du portefeuille client...
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Users size={24} />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {clients.length === 0 ? 'Aucune fiche client' : 'Aucun client ne correspond'}
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                {clients.length === 0
                  ? 'Générez ou sauvegardez un devis pour alimenter automatiquement votre portefeuille.'
                  : 'Essayez une autre recherche pour retrouver votre client.'}
              </p>
              {clients.length === 0 && (
                <button
                  type="button"
                  onClick={startCreateClient}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600"
                >
                  <Plus size={16} />
                  Créer manuellement
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
              {filteredClients.map((client) => (
                <ClientCard
                  key={client.id}
                  client={client}
                  isWorking={workingClientId === client.id}
                  onEdit={startEditClient}
                  onDelete={handleDeleteClient}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit / Create drawer */}
      <EditDrawer
        isOpen={isEditing}
        isCreating={isCreating}
        editingClientData={editingClientData}
        workingClientId={workingClientId}
        editingClientId={editingClientId}
        onChange={handleEditorChange}
        onSave={() => void handleSaveClient()}
        onCancel={cancelEdit}
      />
    </AppShell>
  );
}
