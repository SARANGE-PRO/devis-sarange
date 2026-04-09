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
          ? 'Nouvelle fiche client creee.'
          : 'Fiche client mise a jour.'
      );
      setEditingClientId('');
      setEditingClientData({ ...EMPTY_CLIENT_DATA });
      setWorkingClientId('');

      if (savedClient?.id) {
        setSearchTerm(savedClient.displayName || '');
      }
    } catch (error) {
      setActionError(error.message || 'Impossible d’enregistrer cette fiche client.');
      setWorkingClientId('');
    }
  };

  const handleDeleteClient = async (client) => {
    if (!user) return;

    const clientLabel = client.displayName || getClientDisplayName(client.payload);
    if (!window.confirm(`Supprimer definitivement la fiche client "${clientLabel}" ?`)) {
      return;
    }

    setWorkingClientId(client.id);
    setActionError('');
    setActionMessage('');

    try {
      await deleteClientById({ userId: user.uid, clientId: client.id });
      setActionMessage('Fiche client supprimee.');

      if (editingClientId === client.id) {
        cancelEdit();
      }
    } catch (error) {
      setActionError(error.message || 'Impossible de supprimer cette fiche client.');
    } finally {
      setWorkingClientId('');
    }
  };

  const inputClasses =
    'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-200';

  return (
    <AppShell
      title="Portefeuille client"
      subtitle="Retrouvez vos fiches clients, recherchez-les vite et gerez-les sans ressortir du portefeuille."
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startCreateClient}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-700"
          >
            <Plus size={14} />
            Nouvelle fiche
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-700"
          >
            <Plus size={14} />
            Nouveau devis
          </Link>
        </div>
      }
    >
      {!isConfigured && (
        <div className="mx-auto max-w-4xl rounded-2xl border border-orange-200 bg-orange-50 p-6 text-sm text-orange-900 shadow-sm">
          Firebase n&apos;est pas encore configure dans ce projet. Ajoutez d&apos;abord vos cles
          dans la configuration de l&apos;application.
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
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-orange-500">
                  Clients
                </p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  {clients.length} fiche(s) memorisee(s)
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Les clients sont alimentes automatiquement quand un devis est sauvegarde.
                </p>
              </div>

              <label className="block w-full max-w-md">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Recherche
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
                    placeholder="Nom, email, telephone, ville..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </div>
              </label>
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

          {isEditing && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-orange-500">
                    Edition
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">
                    {isCreating ? 'Nouvelle fiche client' : 'Modifier la fiche client'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Mettez a jour les coordonnees qui serviront ensuite a l&apos;autoremplissage.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={cancelEdit}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                >
                  <X size={16} />
                  Fermer
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">Nom</span>
                  <input
                    name="nom"
                    value={editingClientData.nom}
                    onChange={handleEditorChange}
                    className={inputClasses}
                    placeholder="Dupont"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Prenom
                  </span>
                  <input
                    name="prenom"
                    value={editingClientData.prenom}
                    onChange={handleEditorChange}
                    className={inputClasses}
                    placeholder="Jean"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Mail size={14} className="text-slate-400" />
                    Email
                  </span>
                  <input
                    name="email"
                    value={editingClientData.email}
                    onChange={handleEditorChange}
                    className={inputClasses}
                    placeholder="jean.dupont@email.com"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Phone size={14} className="text-slate-400" />
                    Telephone
                  </span>
                  <input
                    name="telephone"
                    value={editingClientData.telephone}
                    onChange={handleEditorChange}
                    className={inputClasses}
                    placeholder="06 12 34 56 78"
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Reference
                  </span>
                  <input
                    name="referenceDevis"
                    value={editingClientData.referenceDevis}
                    onChange={handleEditorChange}
                    className={inputClasses}
                    placeholder="PROJET-2026-A"
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <MapPin size={14} className="text-slate-400" />
                    Adresse
                  </span>
                  <input
                    name="adresse"
                    value={editingClientData.adresse}
                    onChange={handleEditorChange}
                    className={inputClasses}
                    placeholder="12 Rue de la Paix"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Code postal
                  </span>
                  <input
                    name="codePostal"
                    value={editingClientData.codePostal}
                    onChange={handleEditorChange}
                    className={inputClasses}
                    placeholder="77000"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">Ville</span>
                  <input
                    name="ville"
                    value={editingClientData.ville}
                    onChange={handleEditorChange}
                    className={inputClasses}
                    placeholder="Melun"
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <X size={16} />
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveClient()}
                  disabled={workingClientId === editingClientId || workingClientId === 'new'}
                  className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
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
          )}

          {loadingClients ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
              <Loader2 size={16} className="animate-spin" />
              Chargement du portefeuille client...
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Users size={28} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                {clients.length === 0 ? 'Aucune fiche client' : 'Aucun client ne correspond'}
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                {clients.length === 0
                  ? 'Generez ou sauvegardez un devis pour alimenter automatiquement votre portefeuille.'
                  : 'Essayez une autre recherche pour retrouver votre client.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredClients.map((client) => {
                const isWorking = workingClientId === client.id;
                const clientLabel = client.displayName || getClientDisplayName(client.payload);

                return (
                  <div
                    key={client.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-lg font-bold text-slate-900">
                              {clientLabel}
                            </h3>
                            {client.referenceHint && (
                              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
                                Ref {client.referenceHint}
                              </span>
                            )}
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                                Contact
                              </p>
                              <p className="mt-1 text-sm font-bold text-slate-900">
                                {client.email || client.telephone || 'A completer'}
                              </p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                                Ville / CP
                              </p>
                              <p className="mt-1 text-sm font-bold text-slate-900">
                                {getClientFullLocation(client.payload) || 'A completer'}
                              </p>
                            </div>
                          </div>

                          <p className="mt-3 text-xs text-slate-400">
                            Derniere utilisation :{' '}
                            {formatQuoteUpdatedAt(client.lastUsedAt || client.updatedAt)}
                          </p>
                        </div>

                        <Link
                          href={`/?client=${client.id}`}
                          className="inline-flex items-center justify-center rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600"
                        >
                          Utiliser sur un devis
                        </Link>
                      </div>

                      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                        <button
                          type="button"
                          onClick={() => startEditClient(client)}
                          disabled={isWorking}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:border-orange-300 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Pencil size={16} />
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteClient(client)}
                          disabled={isWorking}
                          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isWorking ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
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
