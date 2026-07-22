'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import { useFirebaseAuth } from '@/components/FirebaseProvider';
import {
  buildComptaConfigJson,
  buildComptaExportRecord,
  createLocalComptaExport,
  loadLocalComptaExports,
  loadLocalComptaSettings,
  parseComptaConfigJson,
  saveLocalComptaSettings,
  updateLocalComptaExportStatus,
} from '@/lib/compta-local.mjs';
import {
  mirrorComptaExportRecord,
  mirrorComptaExportStatus,
  saveComptaSettings as mirrorComptaSettingsToCloud,
} from '@/lib/firebase/compta';
import { subscribeToUserQuotes } from '@/lib/firebase/quotes';
import { formatQuoteUpdatedAt } from '@/lib/quote-cloud';
import { buildSageExportModelForQuote } from '@/lib/sage-export-service';
import {
  DEFAULT_COMPTA_SETTINGS,
  SAGE_VAT_REGIMES,
  buildSageCsv,
  buildSageExportFilename,
  encodeSageCsv,
  findDuplicateSageExport,
  getSageExportStatusMeta,
  hashSageContent,
  isActiveSageExportStatus,
  normalizeComptaSettings,
} from '@/lib/sage-export.mjs';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Download,
  FileCheck2,
  FileDown,
  FileWarning,
  HardDrive,
  History,
  Loader2,
  RotateCcw,
  Search,
  Settings2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

const normalizeSearchValue = (value) =>
  (typeof value === 'string' ? value : '').trim().toLowerCase();

const getQuoteSearchText = (quote) =>
  normalizeSearchValue(
    quote.searchText ||
      [quote.title, quote.clientName, quote.referenceDevis, quote.quoteNumber]
        .filter(Boolean)
        .join(' ')
  );

// Statut Compta d'un devis, dérivé de son historique d'exports :
//  • aucun enregistrement → « Non préparé » ;
//  • export actif (généré/importé) → statut de l'export + alerte si le devis
//    a changé depuis (le numéro DV-… est régénéré à chaque modification) ;
//  • uniquement des exports annulés/remplacés → « Annulé ».
const getQuoteComptaState = (quote, records = []) => {
  const active = records.find((record) => isActiveSageExportStatus(record.status));
  if (active) {
    const isStale = Boolean(
      active.externalId && quote.quoteNumber && active.externalId !== quote.quoteNumber
    );
    return { key: active.status, record: active, isStale };
  }
  if (records.length > 0) {
    return { key: 'cancelled', record: records[0], isStale: false };
  }
  return { key: 'not-prepared', record: null, isStale: false };
};

const NOT_PREPARED_META = { label: 'Non préparé', className: 'bg-slate-100 text-slate-600' };

const getComptaStatusMeta = (stateKey) =>
  stateKey === 'not-prepared' ? NOT_PREPARED_META : getSageExportStatusMeta(stateKey);

// Téléchargement navigateur d'un Blob : purement local, ne dépend d'aucun
// service (fonctionne hors connexion et même si Firestore refuse tout).
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

// CSV encodé (Windows-1252 ou UTF-8 selon réglages).
const downloadCsvFile = (csvContent, filename, encoding) => {
  downloadBlob(new Blob([encodeSageCsv(csvContent, encoding)], { type: 'text/csv' }), filename);
};

const downloadJsonFile = (text, filename) => {
  downloadBlob(new Blob([text], { type: 'application/json' }), filename);
};

const formatIsoDate = (iso) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    date
  );
};

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-200';
const selectClass = `${inputClass} appearance-none`;

/* ─── Panneau Paramètres Sage ────────────────────────────────────────────── */
function ComptaSettingsPanel({ settings, onSave, isSaving }) {
  const [draft, setDraft] = useState(() => normalizeComptaSettings(settings));
  const [isDirty, setIsDirty] = useState(false);
  const [syncedSettings, setSyncedSettings] = useState(settings);
  const [panelMessage, setPanelMessage] = useState('');
  const [panelError, setPanelError] = useState('');
  const importInputRef = useRef(null);

  // Resynchronise le brouillon quand les paramètres cloud changent (autre poste),
  // sauf si une édition locale est en cours — ajustement pendant le rendu, sans effet.
  if (settings !== syncedSettings) {
    setSyncedSettings(settings);
    if (!isDirty) setDraft(normalizeComptaSettings(settings));
  }

  const update = (patch) => {
    setDraft((previous) => ({ ...previous, ...patch }));
    setIsDirty(true);
  };

  const updateVatArticle = (regimeId, value) => {
    setDraft((previous) => ({
      ...previous,
      vatArticles: { ...previous.vatArticles, [regimeId]: value },
    }));
    setIsDirty(true);
  };

  const updatePoseArticle = (regimeId, value) => {
    setDraft((previous) => ({
      ...previous,
      natureArticles: {
        ...previous.natureArticles,
        pose: { ...(previous.natureArticles?.pose || {}), [regimeId]: value },
      },
    }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    setPanelMessage('');
    setPanelError('');
    await onSave(draft);
    setIsDirty(false);
  };

  const handleReset = () => {
    setDraft(normalizeComptaSettings(DEFAULT_COMPTA_SETTINGS));
    setIsDirty(true);
    setPanelMessage('');
    setPanelError('');
  };

  // Sauvegarde / restauration des paramètres Sage sur fichier JSON.
  const handleExportConfig = () => {
    setPanelMessage('');
    setPanelError('');
    downloadJsonFile(buildComptaConfigJson(draft), 'sarange-compta-config.json');
    setPanelMessage('Configuration exportée (sarange-compta-config.json).');
  };

  const handleImportConfig = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPanelMessage('');
    setPanelError('');
    try {
      const imported = parseComptaConfigJson(await file.text());
      setDraft(imported);
      setIsDirty(true);
      setPanelMessage(
        'Configuration chargée — vérifiez puis cliquez sur « Enregistrer les paramètres » pour l’appliquer.'
      );
    } catch (error) {
      setPanelError(error.message || 'Impossible de lire ce fichier de configuration.');
    }
  };

  const field = (label, control) => (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {control}
    </label>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {field(
          'Code client provisoire',
          <input
            type="text"
            value={draft.placeholderClientCode}
            onChange={(e) => update({ placeholderClientCode: e.target.value })}
            className={inputClass}
          />
        )}
        {field(
          'Libellé du client provisoire',
          <input
            type="text"
            value={draft.placeholderClientLabel}
            onChange={(e) => update({ placeholderClientLabel: e.target.value })}
            className={inputClass}
          />
        )}
        {field(
          'Type de pièce Sage',
          <input
            type="text"
            value={draft.pieceType}
            onChange={(e) => update({ pieceType: e.target.value })}
            className={inputClass}
          />
        )}
        {field(
          'Date exportée',
          <select
            value={draft.dateSource}
            onChange={(e) => update({ dateSource: e.target.value })}
            className={selectClass}
          >
            <option value="quote">Date du devis</option>
            <option value="export">Date de génération</option>
          </select>
        )}
        {field(
          'Format de date',
          <input
            type="text"
            value={draft.dateFormat}
            onChange={(e) => update({ dateFormat: e.target.value })}
            className={inputClass}
            placeholder="DD/MM/YYYY"
          />
        )}
        {field(
          'Délai de livraison (jours calendaires)',
          <input
            type="number"
            min={0}
            max={365}
            value={draft.deliveryDelayDays}
            onChange={(e) => update({ deliveryDelayDays: Number(e.target.value) })}
            className={inputClass}
          />
        )}
        {field(
          'Séparateur de colonnes',
          <select
            value={draft.columnSeparator}
            onChange={(e) => update({ columnSeparator: e.target.value })}
            className={selectClass}
          >
            <option value=";">Point-virgule (;)</option>
            <option value=",">Virgule (,)</option>
            <option value={'\t'}>Tabulation</option>
          </select>
        )}
        {field(
          'Séparateur décimal',
          <select
            value={draft.decimalSeparator}
            onChange={(e) => update({ decimalSeparator: e.target.value })}
            className={selectClass}
          >
            <option value=",">Virgule (728,11)</option>
            <option value=".">Point (728.11)</option>
          </select>
        )}
        {field(
          'Encodage du fichier',
          <select
            value={draft.encoding}
            onChange={(e) => update({ encoding: e.target.value })}
            className={selectClass}
          >
            <option value="windows-1252">Windows-1252 (ANSI, recommandé Sage)</option>
            <option value="utf8">UTF-8</option>
            <option value="utf8-bom">UTF-8 avec BOM</option>
          </select>
        )}
        {field(
          'Taux 0 % interprété comme',
          <select
            value={draft.zeroRateRegime}
            onChange={(e) => update({ zeroRateRegime: e.target.value })}
            className={selectClass}
          >
            <option value="autoliquidation">Autoliquidation (art. 283-2 CGI)</option>
            <option value="exoneration">Exonération / vrai taux 0 %</option>
          </select>
        )}
        {field(
          'Préfixe des fichiers',
          <input
            type="text"
            value={draft.filePrefix}
            onChange={(e) => update({ filePrefix: e.target.value })}
            className={inputClass}
          />
        )}
        {field(
          'Règle de nommage',
          <input
            type="text"
            value={draft.fileNamePattern}
            onChange={(e) => update({ fileNamePattern: e.target.value })}
            className={inputClass}
            placeholder="{prefix}{numero}_v{version}"
          />
        )}
        {field(
          'Longueur max. des désignations (limite Sage : 250, 0 = illimitée)',
          <input
            type="number"
            min={0}
            max={1000}
            value={draft.maxDesignationLength}
            onChange={(e) => update({ maxDesignationLength: Number(e.target.value) })}
            className={inputClass}
            placeholder="250 (limite Sage 50)"
          />
        )}
        {field(
          'En cas de doublon',
          <select
            value={draft.duplicateBehavior}
            onChange={(e) => update({ duplicateBehavior: e.target.value })}
            className={selectClass}
          >
            <option value="block">Bloquer (régénération explicite)</option>
            <option value="version">Nouvelle version sans blocage</option>
          </select>
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={draft.includeHeaderRow}
            onChange={(e) => update({ includeHeaderRow: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
          />
          Ligne d&apos;en-tête dans le CSV
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={draft.includeTextOnlyLines}
            onChange={(e) => update({ includeTextOnlyLines: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
          />
          Exporter les lignes de texte (montant 0)
        </label>
      </div>

      {/* Stockage : local par défaut, synchronisation cloud facultative */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2">
          <HardDrive size={15} className="text-orange-500" />
          <p className="text-xs font-bold text-slate-700">
            Mode local uniquement (par défaut)
          </p>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Les paramètres Sage et l&apos;historique des exports sont stockés sur ce poste
          (navigateur). La génération et le téléchargement des CSV ne dépendent jamais du cloud.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={draft.firestoreSync}
            onChange={(e) => update({ firestoreSync: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
          />
          Synchronisation Firestore (facultative) — copie de sauvegarde dans le cloud
        </label>
        {draft.firestoreSync && (
          <p className="mt-1.5 text-[11px] text-amber-600">
            Nécessite le déploiement des règles Firestore de Compta. En cas d&apos;échec, un simple
            avertissement s&apos;affiche : le CSV est toujours généré et téléchargé.
          </p>
        )}
      </div>

      {/* Correspondance TVA → articles Sage */}
      <div>
        <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
          Articles Sage par régime de TVA
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SAGE_VAT_REGIMES.map((regime) => (
            <label key={regime.id} className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                {regime.label}
              </span>
              <input
                type="text"
                value={draft.vatArticles[regime.id] || ''}
                onChange={(e) => updateVatArticle(regime.id, e.target.value)}
                className={inputClass}
                placeholder="Code article Sage"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Surcharges pose (préparation FOUR/POSE) */}
      <div>
        <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
          Articles spécifiques pour la pose (optionnel)
        </p>
        <p className="mb-2 text-xs text-slate-500">
          Laissez vide pour utiliser l&apos;article du régime (IMP…). Renseignez par exemple
          POSE055 / POSE100 pour distinguer fournitures et pose dans Sage.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SAGE_VAT_REGIMES.filter((regime) => regime.id !== 'exoneration').map((regime) => (
            <label key={regime.id} className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Pose — {regime.label}
              </span>
              <input
                type="text"
                value={draft.natureArticles?.pose?.[regime.id] || ''}
                onChange={(e) => updatePoseArticle(regime.id, e.target.value)}
                className={inputClass}
                placeholder="(hérite du régime)"
              />
            </label>
          ))}
        </div>
      </div>

      {panelMessage && (
        <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-xs font-medium text-green-700">
          {panelMessage}
        </p>
      )}
      {panelError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">
          {panelError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
          Enregistrer les paramètres
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw size={14} />
          Valeurs par défaut
        </button>
        <button
          type="button"
          onClick={handleExportConfig}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          title="Sauvegarder les paramètres Sage dans un fichier JSON"
        >
          <Download size={14} />
          Exporter la config
        </button>
        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          title="Restaurer les paramètres Sage depuis un fichier JSON"
        >
          <Upload size={14} />
          Importer la config
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImportConfig}
        />
        {isDirty && (
          <span className="text-xs font-semibold text-amber-600">Modifications non enregistrées</span>
        )}
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function ComptaPage() {
  const { user, initializing, isConfigured } = useFirebaseAuth();
  const [quotes, setQuotes] = useState([]);
  const [exportRecords, setExportRecords] = useState([]);
  const [settings, setSettings] = useState(() => normalizeComptaSettings({}));
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [selectedQuoteId, setSelectedQuoteId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionWarning, setActionWarning] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [workingExportId, setWorkingExportId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const deferredSearch = useDeferredValue(searchTerm);

  /* Abonnements cloud */
  useEffect(() => {
    if (!isConfigured || initializing || !user) {
      setLoadingQuotes(false);
      return undefined;
    }
    setLoadingQuotes(true);
    return subscribeToUserQuotes({
      userId: user.uid,
      onNext: (next) => {
        setQuotes(next);
        setLoadingQuotes(false);
      },
      onError: (error) => {
        setActionError(error.message || 'Impossible de charger vos devis.');
        setLoadingQuotes(false);
      },
    });
  }, [initializing, isConfigured, user]);

  // Paramètres + historique : LOCAUX (localStorage de ce poste, clés liées à
  // l'utilisateur). Aucune lecture Firestore : l'onglet fonctionne hors
  // connexion et sans déploiement de règles supplémentaires.
  const uid = user?.uid || null;
  useEffect(() => {
    if (initializing) return;
    setSettings(loadLocalComptaSettings(uid));
    setExportRecords(loadLocalComptaExports(uid));
  }, [initializing, uid]);

  /* Historique groupé par devis */
  const exportsByQuote = useMemo(() => {
    const map = new Map();
    exportRecords.forEach((record) => {
      if (!record.quoteId) return;
      if (!map.has(record.quoteId)) map.set(record.quoteId, []);
      map.get(record.quoteId).push(record);
    });
    return map;
  }, [exportRecords]);

  const normalizedSearch = normalizeSearchValue(deferredSearch);

  const decoratedQuotes = useMemo(
    () =>
      quotes.map((quote) => ({
        quote,
        state: getQuoteComptaState(quote, exportsByQuote.get(quote.id) || []),
      })),
    [quotes, exportsByQuote]
  );

  const filteredQuotes = decoratedQuotes.filter(({ quote, state }) => {
    if (normalizedSearch && !getQuoteSearchText(quote).includes(normalizedSearch)) return false;
    if (statusFilter === 'all') return true;
    if (statusFilter === 'stale') return state.isStale;
    return state.key === statusFilter;
  });

  const stats = useMemo(() => {
    const counters = { total: decoratedQuotes.length, generated: 0, imported: 0, notPrepared: 0 };
    decoratedQuotes.forEach(({ state }) => {
      if (state.key === 'generated') counters.generated += 1;
      else if (state.key === 'imported') counters.imported += 1;
      else if (state.key === 'not-prepared') counters.notPrepared += 1;
    });
    return counters;
  }, [decoratedQuotes]);

  const selectedEntry =
    decoratedQuotes.find(({ quote }) => quote.id === selectedQuoteId) || null;
  const selectedQuote = selectedEntry?.quote || null;
  const selectedRecords = selectedQuote ? exportsByQuote.get(selectedQuote.id) || [] : [];
  const activeRecord = selectedEntry?.state?.record;

  // Modèle d'export du devis sélectionné : mêmes calculs que le devis/PDF.
  const model = useMemo(() => {
    if (!selectedQuote) return null;
    try {
      return buildSageExportModelForQuote(selectedQuote, settings);
    } catch (error) {
      return {
        isValid: false,
        lines: [],
        vatBreakdown: [],
        totals: { totalHT: 0, exportedTva: 0, exportedTTC: 0, exportedHT: 0 },
        document: {},
        errors: [
          {
            level: 'error',
            code: 'build-failed',
            message: error.message || 'Impossible de préparer ce devis pour Sage.',
          },
        ],
        warnings: [],
        issues: [],
        settings: normalizeComptaSettings(settings),
      };
    }
  }, [selectedQuote, settings]);

  /* ─── Actions ──────────────────────────────────────────────────────────── */
  const handleGenerate = async (forceRegenerate = false) => {
    if (!selectedQuote || !model || !model.isValid || isGenerating) return;

    setActionError('');
    setActionMessage('');
    setActionWarning('');
    setIsGenerating(true);

    try {
      const csvContent = buildSageCsv(model);
      const contentHash = hashSageContent(csvContent);
      const duplicate = findDuplicateSageExport(selectedRecords, contentHash);

      // Anti-doublon : un second clic (ou une regénération sans changement)
      // ne crée JAMAIS silencieusement un export identique.
      if (duplicate && model.settings.duplicateBehavior === 'block' && !forceRegenerate) {
        downloadCsvFile(duplicate.csvContent || csvContent, duplicate.filename, model.settings.encoding);
        setActionMessage(
          `Ce devis a déjà été exporté à l'identique le ${formatIsoDate(
            duplicate.generatedAtIso
          )} (${duplicate.filename}). Le fichier existant a été retéléchargé.`
        );
        return;
      }

      if (activeRecord && !forceRegenerate && !duplicate) {
        const confirmed = window.confirm(
          `Un export existe déjà pour ce devis (${activeRecord.filename}) et le contenu a changé.\n` +
            "Régénérer un nouveau fichier ? L'ancien export passera en « Remplacé »."
        );
        if (!confirmed) return;
      }

      const version =
        selectedRecords.reduce((max, record) => Math.max(max, Number(record.version) || 0), 0) + 1;
      const filename = buildSageExportFilename(model, version);
      const replacesExportId =
        activeRecord && activeRecord.contentHash !== contentHash ? activeRecord.id : null;

      // 1) Téléchargement IMMÉDIAT — jamais suspendu à une persistance.
      downloadCsvFile(csvContent, filename, model.settings.encoding);
      setActionMessage(
        `Fichier ${filename} généré et téléchargé. Importez-le dans Sage 50 puis remplacez le client provisoire ${model.document.clientCode}.`
      );

      // 2) Historique LOCAL (localStorage). Un échec n'annule pas le fichier.
      let record = null;
      try {
        record = buildComptaExportRecord({
          quote: selectedQuote,
          model,
          csvContent,
          filename,
          contentHash,
          version,
          generatedBy: user ? { uid: user.uid, email: user.email } : null,
        });
        const result = createLocalComptaExport({ uid, record, replacesExportId });
        setExportRecords(result.records);
      } catch (error) {
        record = null;
        setActionWarning(
          `Le CSV a été téléchargé, mais l'historique local n'a pas pu être enregistré (${
            error.message || 'stockage local indisponible'
          }).`
        );
      }

      // 3) Miroir Firestore FACULTATIF (désactivé par défaut) : best-effort.
      if (record && model.settings.firestoreSync && user) {
        try {
          await mirrorComptaExportRecord({ userId: user.uid, record, replacesExportId });
        } catch {
          setActionWarning(
            "Le CSV a été téléchargé, mais l'historique distant n'a pas pu être enregistré (synchronisation Firestore)."
          );
        }
      }
    } catch (error) {
      setActionError(error.message || "Impossible de générer l'export Sage.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (!activeRecord) {
      await handleGenerate(false);
      return;
    }
    const confirmed = window.confirm(
      'Régénérer volontairement un nouveau fichier pour ce devis ?\n' +
        `L'export actuel (${activeRecord.filename}) sera conservé dans l'historique en « Remplacé ».`
    );
    if (!confirmed) return;
    await handleGenerate(true);
  };

  const handleDownloadRecord = (record) => {
    if (!record?.csvContent) {
      setActionError('Le contenu de cet export ne peut pas être retéléchargé (fichier non archivé).');
      return;
    }
    downloadCsvFile(record.csvContent, record.filename, settings.encoding);
  };

  const handleUpdateRecordStatus = async (record, status) => {
    if (workingExportId) return;
    if (
      status === 'cancelled' &&
      !window.confirm(`Annuler l'export ${record.filename} ? Il restera visible dans l'historique.`)
    ) {
      return;
    }
    setWorkingExportId(record.id);
    setActionError('');
    setActionMessage('');
    setActionWarning('');
    try {
      // Statut LOCAL d'abord (source de vérité), miroir cloud ensuite.
      const result = updateLocalComptaExportStatus({ uid, exportId: record.id, status });
      setExportRecords(result.records);
      setActionMessage(
        status === 'imported'
          ? `${record.filename} marqué comme importé dans Sage.`
          : `${record.filename} annulé.`
      );

      if (settings.firestoreSync && user) {
        try {
          await mirrorComptaExportStatus({ userId: user.uid, record: result.record });
        } catch {
          setActionWarning(
            'Statut mis à jour localement, mais la synchronisation Firestore a échoué.'
          );
        }
      }
    } catch (error) {
      setActionError(error.message || "Impossible de mettre à jour l'export.");
    } finally {
      setWorkingExportId(null);
    }
  };

  const handleSaveSettings = async (draft) => {
    setIsSavingSettings(true);
    setActionError('');
    setActionMessage('');
    setActionWarning('');
    try {
      // Sauvegarde LOCALE (toujours) ; miroir cloud uniquement si demandé.
      const normalized = saveLocalComptaSettings(uid, draft);
      setSettings(normalized);
      setActionMessage('Paramètres Sage enregistrés sur ce poste.');

      if (normalized.firestoreSync && user) {
        try {
          await mirrorComptaSettingsToCloud({ userId: user.uid, settings: normalized });
        } catch {
          setActionWarning(
            'Paramètres enregistrés localement, mais la synchronisation Firestore a échoué.'
          );
        }
      }
    } catch (error) {
      setActionError(error.message || "Impossible d'enregistrer les paramètres.");
      throw error;
    } finally {
      setIsSavingSettings(false);
    }
  };

  /* ─── Rendu ────────────────────────────────────────────────────────────── */
  return (
    <AppShell
      title="Compta"
      subtitle="Préparez, contrôlez et exportez vos devis vers Sage 50 (fichiers CSV)."
      actions={
        <button
          type="button"
          onClick={() => setShowSettings((previous) => !previous)}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all sm:px-4 sm:py-2 sm:text-sm ${
            showSettings
              ? 'border-orange-300 bg-orange-50 text-orange-700'
              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Settings2 size={14} />
          <span className="hidden sm:inline">Paramètres Sage</span>
          <span className="sm:hidden">Sage</span>
        </button>
      }
    >
      {!isConfigured && (
        <div className="mx-auto max-w-4xl rounded-2xl border border-orange-200 bg-orange-50 p-5 text-sm text-orange-900 shadow-sm">
          Firebase n&apos;est pas encore configuré. Vérifiez la configuration de l&apos;application.
        </div>
      )}

      {isConfigured && user && (
        <div className="mx-auto max-w-6xl space-y-5">
          {/* Avertissement client provisoire — règle d'or de l'onglet */}
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
            <p>
              Les pièces sont importées dans Sage sur le client provisoire{' '}
              <strong>{settings.placeholderClientCode}</strong> ({settings.placeholderClientLabel}).
              Ne validez et ne facturez <strong>jamais</strong> une pièce sans avoir d&apos;abord
              remplacé ce client provisoire par le véritable client dans Sage.
            </p>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm lg:grid-cols-4">
            {[
              { label: 'Devis', value: stats.total },
              { label: 'Non préparés', value: stats.notPrepared },
              { label: 'À importer dans Sage', value: stats.generated },
              { label: 'Importés dans Sage', value: stats.imported },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {label}
                </p>
                <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          {/* Alerts */}
          {actionMessage && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              {actionMessage}
            </div>
          )}
          {actionWarning && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {actionWarning}
            </div>
          )}
          {actionError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {actionError}
            </div>
          )}

          {/* Paramètres */}
          {showSettings && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 size={16} className="text-orange-500" />
                  <h3 className="font-bold text-slate-900">Paramètres d&apos;export Sage 50</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500"
                >
                  <X size={16} />
                </button>
              </div>
              <ComptaSettingsPanel
                settings={settings}
                onSave={handleSaveSettings}
                isSaving={isSavingSettings}
              />
            </div>
          )}

          {/* Recherche + filtre statut */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
              <div className="relative flex-1">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Client, référence, numéro de devis..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-200"
                />
              </div>
              <div className="relative sm:w-64">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={selectClass}
                >
                  <option value="all">Tous les statuts</option>
                  <option value="not-prepared">Non préparés</option>
                  <option value="generated">À importer dans Sage</option>
                  <option value="imported">Importés dans Sage</option>
                  <option value="cancelled">Annulés</option>
                  <option value="stale">Modifiés depuis l&apos;export</option>
                </select>
                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
              </div>
            </div>
          </div>

          {loadingQuotes && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
              <Loader2 size={16} className="animate-spin" />
              Chargement de vos devis...
            </div>
          )}

          {!loadingQuotes && quotes.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Calculator size={24} />
              </div>
              <h3 className="text-base font-bold text-slate-900">Aucun devis à exporter</h3>
              <p className="mt-2 text-sm text-slate-500">
                Créez et enregistrez un devis pour pouvoir l&apos;exporter vers Sage.
              </p>
              <Link
                href="/"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600"
              >
                Créer un devis
              </Link>
            </div>
          )}

          {!loadingQuotes && quotes.length > 0 && (
            <div className="grid gap-5 lg:grid-cols-[2fr_3fr] lg:items-start">
              {/* ── Liste des devis ────────────────────────────────────── */}
              <div className="space-y-2">
                {filteredQuotes.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
                    Aucun devis ne correspond à cette recherche.
                  </div>
                )}
                {filteredQuotes.map(({ quote, state }) => {
                  const statusMeta = getComptaStatusMeta(state.key);
                  const isSelected = quote.id === selectedQuoteId;
                  return (
                    <button
                      key={quote.id}
                      type="button"
                      onClick={() => {
                        setSelectedQuoteId(quote.id);
                        setActionMessage('');
                        setActionError('');
                        setActionWarning('');
                      }}
                      className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition-all ${
                        isSelected
                          ? 'border-orange-400 ring-2 ring-orange-200'
                          : 'border-slate-200 hover:border-orange-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-900">
                            {quote.title || 'Devis sans titre'}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {quote.quoteNumber ? `${quote.quoteNumber} · ` : ''}
                            {quote.clientName || 'Client à définir'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-black text-slate-900">
                            {currencyFormatter.format(quote.totalTTC || 0)}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            HT {currencyFormatter.format(quote.totalHT || 0)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.className}`}
                        >
                          {statusMeta.label}
                        </span>
                        {state.isStale && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            Modifié depuis l&apos;export
                          </span>
                        )}
                        {quote.referenceDevis && (
                          <span className="text-[11px] font-semibold text-orange-600">
                            Réf {quote.referenceDevis}
                          </span>
                        )}
                        <span className="ml-auto text-[11px] text-slate-400">
                          {formatQuoteUpdatedAt(quote.updatedAt)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* ── Détail / prévisualisation ─────────────────────────── */}
              <div className="space-y-4">
                {!selectedQuote && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                      <FileCheck2 size={24} />
                    </div>
                    <h3 className="text-base font-bold text-slate-900">
                      Sélectionnez un devis à exporter
                    </h3>
                    <p className="mt-2 text-sm text-slate-500">
                      La prévisualisation des lignes Sage, les contrôles et la génération du CSV
                      s&apos;affichent ici.
                    </p>
                  </div>
                )}

                {selectedQuote && model && (
                  <>
                    {/* Contrôles avant export */}
                    {(model.errors.length > 0 || model.warnings.length > 0) && (
                      <div className="space-y-2">
                        {model.errors.map((issue, index) => (
                          <div
                            key={`error-${index}`}
                            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700"
                          >
                            <XCircle size={15} className="mt-0.5 shrink-0" />
                            {issue.message}
                          </div>
                        ))}
                        {model.warnings.map((issue, index) => (
                          <div
                            key={`warning-${index}`}
                            className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800"
                          >
                            <FileWarning size={15} className="mt-0.5 shrink-0" />
                            {issue.message}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Récapitulatif avant génération */}
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="border-b border-slate-100 px-5 py-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">
                          Pièce Sage
                        </p>
                        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <h3 className="text-base font-bold text-slate-900">
                            {model.document.pieceType} · {model.document.externalId || '—'}
                          </h3>
                          <span className="text-xs text-slate-500">
                            du {model.document.dateLabel} · livraison le{' '}
                            <strong>{model.document.deliveryDateLabel}</strong> (+
                            {model.document.deliveryDelayDays} j) · client provisoire{' '}
                            <strong>{model.document.clientCode}</strong>
                          </span>
                        </div>
                        {model.document.referenceDevis && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            Référence chantier : {model.document.referenceDevis}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
                        {[
                          { label: 'Lignes', value: model.lines.length },
                          {
                            label: 'Total HT',
                            value: currencyFormatter.format(model.totals.exportedHT),
                          },
                          {
                            label: 'TVA théorique',
                            value: currencyFormatter.format(model.totals.exportedTva),
                          },
                          {
                            label: 'Total TTC',
                            value: currencyFormatter.format(model.totals.exportedTTC),
                          },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-white p-3.5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                              {label}
                            </p>
                            <p className="mt-0.5 text-sm font-black text-slate-900">{value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Ventilation TVA */}
                      {model.vatBreakdown.length > 0 && (
                        <div className="border-t border-slate-100 px-5 py-3">
                          <div className="flex flex-wrap gap-2">
                            {model.vatBreakdown.map((bucket) => (
                              <span
                                key={bucket.regimeId}
                                className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200"
                              >
                                {bucket.regimeLabel} : {currencyFormatter.format(bucket.totalHT)} HT
                                {bucket.rate > 0 &&
                                  ` · TVA ${currencyFormatter.format(bucket.tva)}`}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-4">
                        <button
                          type="button"
                          onClick={() => (activeRecord ? handleRegenerate() : handleGenerate(false))}
                          disabled={!model.isValid || isGenerating}
                          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isGenerating ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <FileDown size={15} />
                          )}
                          {activeRecord ? 'Régénérer le CSV' : 'Générer et télécharger le CSV'}
                        </button>

                        {activeRecord && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDownloadRecord(activeRecord)}
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                            >
                              <Download size={14} />
                              Retélécharger
                            </button>
                            {activeRecord.status === 'generated' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateRecordStatus(activeRecord, 'imported')}
                                disabled={workingExportId === activeRecord.id}
                                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                              >
                                <CheckCircle2 size={14} />
                                Marquer importé dans Sage
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleUpdateRecordStatus(activeRecord, 'cancelled')}
                              disabled={workingExportId === activeRecord.id}
                              className="inline-flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-100 disabled:opacity-50"
                            >
                              <XCircle size={14} />
                              Annuler
                            </button>
                          </>
                        )}
                      </div>

                      {activeRecord && (
                        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                          Dernier export : <strong>{activeRecord.filename}</strong> (v
                          {activeRecord.version}) généré le {formatIsoDate(activeRecord.generatedAtIso)}
                          {activeRecord.generatedBy?.email
                            ? ` par ${activeRecord.generatedBy.email}`
                            : ''}
                          {activeRecord.status === 'imported' && activeRecord.importedAtIso
                            ? ` · importé dans Sage le ${formatIsoDate(activeRecord.importedAtIso)}`
                            : ''}
                        </p>
                      )}
                    </div>

                    {/* Prévisualisation des lignes */}
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="border-b border-slate-100 px-5 py-3">
                        <h4 className="text-sm font-bold text-slate-900">
                          Lignes envoyées à Sage ({model.lines.length})
                        </h4>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                              <th className="px-4 py-2.5">#</th>
                              <th className="px-4 py-2.5">Article</th>
                              <th className="px-4 py-2.5">Désignation</th>
                              <th className="px-4 py-2.5 text-right">Qté</th>
                              <th className="px-4 py-2.5 text-right">PU HT net</th>
                              <th className="px-4 py-2.5 text-right">Montant HT</th>
                              <th className="px-4 py-2.5">TVA</th>
                              <th className="px-4 py-2.5">Nature</th>
                            </tr>
                          </thead>
                          <tbody>
                            {model.lines.map((line) => (
                              <tr key={line.order} className="border-b border-slate-50">
                                <td className="px-4 py-2.5 text-slate-400">{line.order}</td>
                                <td className="px-4 py-2.5">
                                  {line.sageArticle ? (
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                                      {line.sageArticle}
                                    </span>
                                  ) : (
                                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-600">
                                      Manquant
                                    </span>
                                  )}
                                </td>
                                <td
                                  className="max-w-[260px] px-4 py-2.5 text-slate-700"
                                  title={
                                    line.designationFull !== line.designation
                                      ? line.designationFull
                                      : undefined
                                  }
                                >
                                  {line.designation || (
                                    <span className="italic text-red-500">Désignation absente</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right font-semibold text-slate-700">
                                  {line.quantity}
                                </td>
                                <td className="px-4 py-2.5 text-right font-semibold text-slate-700">
                                  {currencyFormatter.format(line.unitPriceHT)}
                                </td>
                                <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                                  {currencyFormatter.format(line.lineHT)}
                                </td>
                                <td className="px-4 py-2.5 text-slate-500">
                                  {line.regimeId === 'autoliquidation'
                                    ? 'Autoliq.'
                                    : line.regimeId === 'exoneration'
                                      ? 'Exo.'
                                      : `${line.tvaRate} %`.replace('.', ',')}
                                </td>
                                <td className="px-4 py-2.5 text-slate-500">{line.natureLabel}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Aperçu CSV brut */}
                      <details className="border-t border-slate-100 px-5 py-3">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-orange-600">
                          Voir le contenu CSV brut
                        </summary>
                        <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-slate-900 p-4 text-[11px] leading-relaxed text-slate-100">
                          {buildSageCsv(model)}
                        </pre>
                      </details>
                    </div>

                    {/* Historique du devis sélectionné */}
                    {selectedRecords.length > 0 && (
                      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-100 px-5 py-3">
                          <h4 className="text-sm font-bold text-slate-900">
                            Historique des exports de ce devis
                          </h4>
                        </div>
                        <ul className="divide-y divide-slate-50">
                          {selectedRecords.map((record) => {
                            const meta = getSageExportStatusMeta(record.status);
                            return (
                              <li
                                key={record.id}
                                className="flex flex-wrap items-center gap-2 px-5 py-3 text-xs"
                              >
                                <span
                                  className={`rounded-full px-2 py-0.5 font-semibold ${meta.className}`}
                                >
                                  {meta.label}
                                </span>
                                <span className="font-semibold text-slate-700">
                                  {record.filename}
                                </span>
                                <span className="text-slate-400">
                                  v{record.version} · {formatIsoDate(record.generatedAtIso)} ·{' '}
                                  {currencyFormatter.format(record.totalHT || 0)} HT
                                </span>
                                <span className="ml-auto flex items-center gap-1">
                                  <button
                                    type="button"
                                    title="Retélécharger ce fichier"
                                    onClick={() => handleDownloadRecord(record)}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-orange-300 hover:text-orange-600"
                                  >
                                    <Download size={13} />
                                  </button>
                                  {record.status === 'generated' && (
                                    <button
                                      type="button"
                                      title="Marquer importé dans Sage"
                                      onClick={() => handleUpdateRecordStatus(record, 'imported')}
                                      disabled={workingExportId === record.id}
                                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-50"
                                    >
                                      <CheckCircle2 size={13} />
                                    </button>
                                  )}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Historique global */}
          {exportRecords.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setShowHistory((previous) => !previous)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <div className="flex items-center gap-2">
                  <History size={16} className="text-orange-500" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Historique complet des exports ({exportRecords.length})
                  </h3>
                </div>
                <ChevronDown
                  size={16}
                  className={`text-slate-400 transition-transform ${showHistory ? 'rotate-180' : ''}`}
                />
              </button>
              {showHistory && (
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <th className="px-4 py-2.5">Fichier</th>
                        <th className="px-4 py-2.5">Devis</th>
                        <th className="px-4 py-2.5">Généré le</th>
                        <th className="px-4 py-2.5 text-right">Total HT</th>
                        <th className="px-4 py-2.5">Statut</th>
                        <th className="px-4 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exportRecords.map((record) => {
                        const meta = getSageExportStatusMeta(record.status);
                        return (
                          <tr key={record.id} className="border-b border-slate-50">
                            <td className="px-4 py-2.5 font-semibold text-slate-700">
                              {record.filename}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500">
                              {record.quoteTitle || record.externalId || '—'}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500">
                              {formatIsoDate(record.generatedAtIso)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-slate-700">
                              {currencyFormatter.format(record.totalHT || 0)}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`rounded-full px-2 py-0.5 font-semibold ${meta.className}`}
                              >
                                {meta.label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  title="Retélécharger"
                                  onClick={() => handleDownloadRecord(record)}
                                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-orange-300 hover:text-orange-600"
                                >
                                  <Download size={13} />
                                </button>
                                {record.status === 'generated' && (
                                  <button
                                    type="button"
                                    title="Marquer importé dans Sage"
                                    onClick={() => handleUpdateRecordStatus(record, 'imported')}
                                    disabled={workingExportId === record.id}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-50"
                                  >
                                    <CheckCircle2 size={13} />
                                  </button>
                                )}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
