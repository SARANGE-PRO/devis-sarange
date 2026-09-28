'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Download,
  Euro,
  Globe,
  Handshake,
  Loader2,
  Lock,
  Paperclip,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';

import AppShell from '@/components/AppShell';
import { useFirebaseAuth } from '@/components/FirebaseProvider';
import {
  COMMISSION_SOURCES,
  COMMISSION_STATUSES,
  MAX_COMMISSION_DOCUMENT_BYTES,
  computeBalance,
  computeCommission,
  computeCommissionTotals,
  formatMoney,
} from '@/lib/commission-dossiers.mjs';

/**
 * Page discrète de suivi des commissions de vente. Doublement gardée :
 *  - rôle administrateur (vérifié côté serveur par les routes /api/commissions),
 *  - code à 4 chiffres ci-dessous, simple mesure de DISCRÉTION à l'écran
 *    (curieux de passage, partage d'écran) : la vraie sécurité reste le rôle
 *    administrateur exigé par l'API.
 * Aucun lien visible dans le menu : accès par l'icône € du pied de sidebar
 * (administrateurs uniquement) ou par l'URL /commissions.
 *
 * Mobile d'abord : liste en cartes avec champs à libellés et cibles tactiles
 * larges (police 16px pour éviter le zoom automatique iOS) ; le tableau
 * compact n'apparaît que sur desktop (lg+).
 */
const ACCESS_CODE = '0809';
const UNLOCK_STORAGE_KEY = 'sarange.commissions.unlocked';

const readUnlocked = () => {
  try {
    return sessionStorage.getItem(UNLOCK_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const storeUnlocked = () => {
  try {
    sessionStorage.setItem(UNLOCK_STORAGE_KEY, '1');
  } catch {
    // Stockage indisponible (navigation privée) : le code sera redemandé.
  }
};

const STATUS_STYLES = {
  'attente-devis': 'bg-amber-50 text-amber-700 border-amber-200',
  'devis-envoye': 'bg-sky-50 text-sky-700 border-sky-200',
  vendu: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  perdu: 'bg-slate-100 text-slate-500 border-slate-200',
};

const balanceTone = (balance) => {
  if (balance === null) return 'text-slate-300';
  if (balance > 0) return 'text-orange-600';
  if (balance < 0) return 'text-slate-500';
  return 'text-emerald-600';
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
};

const moneyInputValue = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? String(value).replace('.', ',') : '';

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const index = result.indexOf('base64,');
      if (index === -1) reject(new Error('Lecture du fichier impossible.'));
      else resolve(result.slice(index + 'base64,'.length));
    };
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(file);
  });

/** Écran du code à 4 chiffres. Vérification locale, volontairement sobre. */
function PinGate({ onUnlock }) {
  const [code, setCode] = useState('');
  const [failed, setFailed] = useState(false);
  const inputRef = useRef(null);

  const handleChange = (event) => {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
    setCode(digits);
    setFailed(false);
    if (digits.length === 4) {
      if (digits === ACCESS_CODE) {
        storeUnlocked();
        onUnlock();
      } else {
        setCode('');
        setFailed(true);
      }
    }
  };

  return (
    <div className="mx-auto mt-16 flex max-w-xs flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="rounded-xl bg-slate-100 p-3 text-slate-500">
        <Lock size={20} />
      </div>
      <p className="text-sm font-semibold text-slate-700">Code d&apos;accès</p>
      <input
        ref={inputRef}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        value={code}
        onChange={handleChange}
        maxLength={4}
        aria-label="Code d'accès à 4 chiffres"
        className={`w-36 rounded-xl border px-3 py-3 text-center text-2xl tracking-[0.5em] outline-none transition-colors ${
          failed ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50 focus:border-slate-400'
        }`}
      />
      <p className={`text-xs ${failed ? 'text-red-500' : 'text-slate-400'}`}>
        {failed ? 'Code incorrect.' : '4 chiffres'}
      </p>
    </div>
  );
}

/** Liste des documents d'un dossier : téléversement, téléchargement, suppression. */
function DocumentsPanel({ dossier, authorizedFetch, onDossiers, onError }) {
  const [busy, setBusy] = useState('');
  const inputId = `doc-upload-${dossier.id}`;

  const upload = async (file) => {
    if (!file) return;
    if (file.size > MAX_COMMISSION_DOCUMENT_BYTES) {
      onError('Fichier trop lourd : 3 Mo maximum par document.');
      return;
    }
    setBusy('upload');
    onError('');
    try {
      const dataBase64 = await fileToBase64(file);
      const response = await authorizedFetch('/api/commissions/documents', {
        method: 'POST',
        body: {
          action: 'add',
          dossierId: dossier.id,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          dataBase64,
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Envoi du document impossible.');
      onDossiers(payload.dossiers || []);
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy('');
    }
  };

  const download = async (entry) => {
    setBusy(`download:${entry.id}`);
    onError('');
    try {
      const response = await authorizedFetch(
        `/api/commissions/documents?dossierId=${encodeURIComponent(dossier.id)}&documentId=${encodeURIComponent(entry.id)}`
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Téléchargement impossible.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = entry.name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy('');
    }
  };

  const remove = async (entry) => {
    if (!window.confirm(`Supprimer le document « ${entry.name} » ?`)) return;
    setBusy(`remove:${entry.id}`);
    onError('');
    try {
      const response = await authorizedFetch('/api/commissions/documents', {
        method: 'POST',
        body: { action: 'remove', dossierId: dossier.id, documentId: entry.id },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Suppression impossible.');
      onDossiers(payload.dossiers || []);
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">
          Documents ({dossier.documents.length})
        </p>
        <label
          htmlFor={inputId}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-800 ${
            busy === 'upload' ? 'pointer-events-none opacity-60' : ''
          }`}
        >
          {busy === 'upload' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          Ajouter (3 Mo max)
        </label>
        <input
          id={inputId}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void upload(file);
          }}
        />
      </div>
      {dossier.documents.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">
          Aucun document pour l&apos;instant (devis, facture, justificatif de paiement...).
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {dossier.documents.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 px-3 py-2">
              <Paperclip size={13} className="shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-700" title={entry.name}>
                  {entry.name}
                </p>
                <p className="text-[11px] text-slate-400">
                  {[formatFileSize(entry.size), formatDate(entry.uploadedAt)].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void download(entry)}
                disabled={busy === `download:${entry.id}`}
                title="Télécharger"
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
              >
                {busy === `download:${entry.id}` ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Download size={15} />
                )}
              </button>
              <button
                type="button"
                onClick={() => void remove(entry)}
                disabled={busy === `remove:${entry.id}`}
                title="Supprimer"
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-60"
              >
                {busy === `remove:${entry.id}` ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Champ montant à libellé, pour les cartes mobiles. Police 16px : pas de zoom iOS. */
function MoneyField({ label, value, onSave, tone = 'text-slate-800' }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <div className="mt-1 flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus-within:border-orange-300 focus-within:bg-white">
        <input
          key={`money:${value}`}
          type="text"
          inputMode="decimal"
          defaultValue={moneyInputValue(value)}
          placeholder="0,00"
          onBlur={(event) => {
            const raw = event.target.value.trim();
            if (raw !== moneyInputValue(value)) onSave(raw);
          }}
          className={`w-full bg-transparent text-right text-base font-semibold outline-none placeholder:text-slate-300 ${tone}`}
        />
        <span className="shrink-0 text-sm text-slate-400">€</span>
      </div>
    </label>
  );
}

/** Carte mobile d'un dossier : tout se fait au pouce, sans défilement latéral. */
function DossierCard({ dossier, pending, saveField, onDelete, expanded, onToggleExpand, documentsPanel }) {
  const commission = computeCommission(dossier);
  const balance = computeBalance(dossier);
  const rowPending = pending.startsWith(`update:${dossier.id}`) || pending === `delete:${dossier.id}`;

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${rowPending ? 'opacity-60' : ''}`}>
      {/* Intitulé + badge site + suppression */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <input
            key={`${dossier.id}:label:${dossier.label}`}
            type="text"
            defaultValue={dossier.label}
            placeholder="Client / Dossier"
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value !== dossier.label) saveField(dossier, 'label', value);
            }}
            className="w-full rounded-lg border border-transparent bg-transparent px-1 py-1 text-base font-bold text-slate-900 outline-none transition-colors focus:border-orange-300 focus:bg-white"
          />
          <div className="mt-0.5 flex items-center gap-2 px-1">
            {dossier.createdAt && <span className="text-[11px] text-slate-300">{formatDate(dossier.createdAt)}</span>}
            {dossier.source === COMMISSION_SOURCES.WEBSITE && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-600">
                <Globe size={10} />
                Site
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDelete(dossier)}
          title="Supprimer le dossier"
          className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Statut : pleine largeur, facile au pouce */}
      <select
        value={dossier.status}
        onChange={(event) => saveField(dossier, 'status', event.target.value)}
        className={`mt-3 w-full rounded-xl border px-3 py-2.5 text-base font-bold outline-none ${
          STATUS_STYLES[dossier.status] || STATUS_STYLES['attente-devis']
        }`}
      >
        {COMMISSION_STATUSES.map((status) => (
          <option key={status.value} value={status.value}>
            {status.label}
          </option>
        ))}
      </select>

      {/* Montants */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <MoneyField
          label="Prix Sarange"
          value={dossier.purchasePrice}
          onSave={(raw) => saveField(dossier, 'purchasePrice', raw)}
        />
        <MoneyField
          label="Prix de vente"
          value={dossier.salePrice}
          onSave={(raw) => saveField(dossier, 'salePrice', raw)}
        />
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Commission</span>
          <p className="mt-1 rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-right text-base font-bold text-slate-800">
            {commission === null ? <span className="font-normal text-slate-300">-</span> : formatMoney(commission)}
          </p>
        </div>
        <MoneyField
          label="Payé par Sarange"
          value={dossier.paidAmount || null}
          onSave={(raw) => saveField(dossier, 'paidAmount', raw)}
          tone="text-emerald-700"
        />
      </div>

      {/* Solde dû */}
      <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Solde dû par Sarange</span>
        <span className={`text-lg font-bold ${balanceTone(balance)}`}>
          {balance === null ? '-' : formatMoney(balance)}
        </span>
      </div>

      {/* Documents */}
      <button
        type="button"
        onClick={onToggleExpand}
        className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
          expanded
            ? 'border-slate-300 bg-slate-100 text-slate-700'
            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
        }`}
      >
        <Paperclip size={15} />
        Documents{dossier.documents.length > 0 ? ` (${dossier.documents.length})` : ''}
      </button>
      {expanded && <div className="mt-2">{documentsPanel}</div>}
    </div>
  );
}

export default function CommissionsPage() {
  const { user, access } = useFirebaseAuth();
  const isAdmin = Boolean(user) && access?.isAdmin === true;

  const [unlocked, setUnlocked] = useState(false);
  const [dossiers, setDossiers] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [expandedId, setExpandedId] = useState('');

  useEffect(() => {
    setUnlocked(readUnlocked());
  }, []);

  const authorizedFetch = useCallback(
    async (path, { method = 'GET', body } = {}) => {
      if (!user) throw new Error('Non connecté.');
      const idToken = await user.getIdToken();
      return fetch(path, {
        method,
        headers: {
          Authorization: `Bearer ${idToken}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    },
    [user]
  );

  const loadDossiers = useCallback(async () => {
    setError('');
    try {
      const response = await authorizedFetch('/api/commissions');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Chargement impossible.');
      setDossiers(payload.dossiers || []);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    if (!isAdmin || !unlocked) return;
    void loadDossiers();
  }, [isAdmin, unlocked, loadDossiers]);

  const act = useCallback(
    async (key, body) => {
      setPending(key);
      setError('');
      setNotice('');
      try {
        const response = await authorizedFetch('/api/commissions', { method: 'POST', body });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || 'Enregistrement impossible.');
        setDossiers(payload.dossiers || []);
        if (body.action === 'import-leads' && payload.imported) {
          const { created, scanned } = payload.imported;
          setNotice(
            created > 0
              ? `${created} demande${created > 1 ? 's' : ''} du site importée${created > 1 ? 's' : ''} (${scanned} fiche${scanned > 1 ? 's' : ''} examinée${scanned > 1 ? 's' : ''}).`
              : `Rien à importer : les demandes du site sont déjà toutes ici (${scanned} fiche${scanned > 1 ? 's' : ''} examinée${scanned > 1 ? 's' : ''}).`
          );
        }
        return true;
      } catch (actionError) {
        setError(actionError.message);
        return false;
      } finally {
        setPending('');
      }
    },
    [authorizedFetch]
  );

  const saveField = useCallback(
    (dossier, field, value) => {
      void act(`update:${dossier.id}:${field}`, { action: 'update', id: dossier.id, data: { [field]: value } });
    },
    [act]
  );

  const handleCreate = async (event) => {
    event.preventDefault();
    const done = await act('create', { action: 'create', data: { label: newLabel } });
    if (done) setNewLabel('');
  };

  const handleDelete = useCallback(
    (dossier) => {
      if (!window.confirm(`Supprimer le dossier « ${dossier.label || 'sans nom'} » et ses documents ?`)) return;
      void act(`delete:${dossier.id}`, { action: 'delete', id: dossier.id });
    },
    [act]
  );

  const totals = useMemo(() => computeCommissionTotals(dossiers || []), [dossiers]);

  let content;
  if (!user || (access?.checked && !isAdmin)) {
    // Discrétion : un compte non administrateur ne voit qu'un message neutre.
    content = (
      <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
        Cette page n&apos;est pas disponible.
      </div>
    );
  } else if (!access?.checked) {
    content = (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
        <Loader2 size={16} className="animate-spin" />
        Vérification en cours...
      </div>
    );
  } else if (!unlocked) {
    content = <PinGate onUnlock={() => setUnlocked(true)} />;
  } else {
    const list = dossiers || [];
    content = (
      <div className="space-y-4 sm:space-y-5">
        {/* Totaux : le total dû d'abord, bien visible sur mobile */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
            <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-orange-500">
              <Euro size={13} />
              Total dû par SARANGE
            </p>
            <p className="mt-1 text-3xl font-bold text-orange-600 sm:text-2xl">
              {formatMoney(totals.dueTotal) || '0,00 €'}
            </p>
            <p className="mt-0.5 text-xs text-orange-400">Se met à jour à chaque paiement saisi.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-slate-400">
                <Handshake size={13} />
                Commissions
              </p>
              <p className="mt-1 text-xl font-bold text-slate-800 sm:text-2xl">
                {formatMoney(totals.commissionTotal) || '0,00 €'}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {totals.soldCount} vendu{totals.soldCount > 1 ? 's' : ''} / {totals.count} dossier{totals.count > 1 ? 's' : ''}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-slate-400">
                <Banknote size={13} />
                Déjà payé
              </p>
              <p className="mt-1 text-xl font-bold text-emerald-600 sm:text-2xl">
                {formatMoney(totals.paidTotal) || '0,00 €'}
              </p>
            </div>
          </div>
        </div>

        {/* Barre d'actions : boutons pleine largeur sur mobile */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={handleCreate} className="flex flex-1 gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="Client / Dossier"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-800 outline-none placeholder:text-slate-400 focus:border-orange-300 sm:text-sm lg:max-w-sm"
            />
            <button
              type="submit"
              disabled={pending === 'create'}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
            >
              {pending === 'create' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              <span className="hidden sm:inline">Nouveau dossier</span>
              <span className="sm:hidden">Nouveau</span>
            </button>
          </form>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void act('import-leads', { action: 'import-leads' })}
              disabled={pending === 'import-leads'}
              title="Crée les dossiers manquants pour toutes les demandes de prix déjà reçues du site internet"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 lg:flex-none"
            >
              {pending === 'import-leads' ? <Loader2 size={15} className="animate-spin" /> : <Globe size={15} />}
              Importer les demandes du site
            </button>
            <button
              type="button"
              onClick={() => void loadDossiers()}
              title="Actualiser"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-500 transition-colors hover:bg-slate-50"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {notice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {dossiers === null && !error ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin" />
            Chargement des dossiers...
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
            Aucun dossier pour l&apos;instant. Les demandes de prix reçues du site internet arrivent ici
            automatiquement, au statut « En attente de devis ».
          </div>
        ) : (
          <>
            {/* Mobile et tablette : cartes empilées */}
            <div className="space-y-3 lg:hidden">
              {list.map((dossier) => (
                <DossierCard
                  key={dossier.id}
                  dossier={dossier}
                  pending={pending}
                  saveField={saveField}
                  onDelete={handleDelete}
                  expanded={expandedId === dossier.id}
                  onToggleExpand={() => setExpandedId(expandedId === dossier.id ? '' : dossier.id)}
                  documentsPanel={
                    <DocumentsPanel
                      dossier={dossier}
                      authorizedFetch={authorizedFetch}
                      onDossiers={setDossiers}
                      onError={setError}
                    />
                  }
                />
              ))}
            </div>

            {/* Desktop : tableau compact */}
            <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-black uppercase tracking-widest text-slate-400">
                    <th className="px-4 py-3">Client / Dossier</th>
                    <th className="px-3 py-3">Statut</th>
                    <th className="px-3 py-3 text-right">Prix Sarange</th>
                    <th className="px-3 py-3 text-right">Prix de vente</th>
                    <th className="px-3 py-3 text-right">Commission</th>
                    <th className="px-3 py-3 text-right">Payé par Sarange</th>
                    <th className="px-3 py-3 text-right">Solde dû</th>
                    <th className="px-3 py-3" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {list.map((dossier) => {
                    const commission = computeCommission(dossier);
                    const balance = computeBalance(dossier);
                    const expanded = expandedId === dossier.id;
                    const rowPending =
                      pending.startsWith(`update:${dossier.id}`) || pending === `delete:${dossier.id}`;
                    return (
                      <Fragment key={dossier.id}>
                        <tr className={rowPending ? 'opacity-60' : ''}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <input
                                key={`${dossier.id}:label:${dossier.label}`}
                                type="text"
                                defaultValue={dossier.label}
                                onBlur={(event) => {
                                  const value = event.target.value.trim();
                                  if (value !== dossier.label) saveField(dossier, 'label', value);
                                }}
                                className="w-full min-w-[180px] rounded-lg border border-transparent bg-transparent px-2 py-1.5 font-semibold text-slate-800 outline-none transition-colors hover:border-slate-200 focus:border-orange-300 focus:bg-white"
                              />
                              {dossier.source === COMMISSION_SOURCES.WEBSITE && (
                                <span
                                  title="Demande reçue depuis le site internet"
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-600"
                                >
                                  <Globe size={10} />
                                  Site
                                </span>
                              )}
                            </div>
                            {dossier.createdAt && (
                              <p className="px-2 text-[11px] text-slate-300">{formatDate(dossier.createdAt)}</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <select
                              value={dossier.status}
                              onChange={(event) => saveField(dossier, 'status', event.target.value)}
                              className={`rounded-lg border px-2 py-1.5 text-xs font-bold outline-none ${
                                STATUS_STYLES[dossier.status] || STATUS_STYLES['attente-devis']
                              }`}
                            >
                              {COMMISSION_STATUSES.map((status) => (
                                <option key={status.value} value={status.value}>
                                  {status.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          {['purchasePrice', 'salePrice'].map((field) => (
                            <td key={field} className="px-3 py-2.5 text-right">
                              <input
                                key={`${dossier.id}:${field}:${dossier[field]}`}
                                type="text"
                                inputMode="decimal"
                                defaultValue={moneyInputValue(dossier[field])}
                                placeholder="0,00"
                                onBlur={(event) => {
                                  const raw = event.target.value.trim();
                                  if (raw !== moneyInputValue(dossier[field])) saveField(dossier, field, raw);
                                }}
                                className="w-24 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-right text-slate-700 outline-none transition-colors hover:border-slate-200 focus:border-orange-300 focus:bg-white"
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2.5 text-right font-semibold text-slate-800">
                            {commission === null ? <span className="text-slate-300">-</span> : formatMoney(commission)}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <input
                              key={`${dossier.id}:paidAmount:${dossier.paidAmount}`}
                              type="text"
                              inputMode="decimal"
                              defaultValue={moneyInputValue(dossier.paidAmount) || ''}
                              placeholder="0,00"
                              onBlur={(event) => {
                                const raw = event.target.value.trim();
                                if (raw !== (moneyInputValue(dossier.paidAmount) || '')) {
                                  saveField(dossier, 'paidAmount', raw);
                                }
                              }}
                              className="w-24 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-right text-emerald-700 outline-none transition-colors hover:border-slate-200 focus:border-orange-300 focus:bg-white"
                            />
                          </td>
                          <td className={`px-3 py-2.5 text-right font-bold ${balanceTone(balance)}`}>
                            {balance === null ? '-' : formatMoney(balance)}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setExpandedId(expanded ? '' : dossier.id)}
                                title="Documents du dossier"
                                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                                  expanded || dossier.documents.length > 0
                                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                    : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                                }`}
                              >
                                <Paperclip size={13} />
                                {dossier.documents.length || ''}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(dossier)}
                                title="Supprimer le dossier"
                                className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={8} className="bg-slate-50/60 px-4 py-3">
                              <DocumentsPanel
                                dossier={dossier}
                                authorizedFetch={authorizedFetch}
                                onDossiers={setDossiers}
                                onError={setError}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="text-xs text-slate-400">
          Chaque demande de prix reçue depuis le site internet crée automatiquement son dossier ici, au statut
          « En attente de devis ». La commission = prix de vente - prix Sarange, uniquement quand le dossier est
          vendu. Saisissez les paiements reçus dans « Payé par Sarange » : le total dû se met à jour aussitôt.
        </p>
      </div>
    );
  }

  return (
    <AppShell title="Suivi" subtitle="">
      {content}
    </AppShell>
  );
}
