'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  Cloud,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  UsersRound,
  Wrench,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useFirebaseAuth } from '@/components/FirebaseProvider';
import { getCurrentCataloguePayload } from '@/lib/catalogue-cloud';
import {
  CATEGORIES,
} from '@/lib/products';
import {
  PANEL_SANDWICH_GLAZING_ID,
  createCustomGlazingId,
  getCustomGlazingOptionsSnapshot,
  getGlazingOptionsServerSnapshot,
  getGlazingOptionsSnapshot,
  setCustomGlazingOptions,
  subscribeToGlazingOptions,
} from '@/lib/glazing';
import {
  formatCoefficientDelta,
  getCatalogueCoefficientsServerSnapshot,
  getCatalogueCoefficientsSnapshot,
  resetAllProductCoefficients,
  setProductCoefficient,
  subscribeToCatalogueCoefficients,
} from '@/lib/catalogue-coefficients';
import {
  getCataloguePricingServerSnapshot,
  getCataloguePricingSnapshot,
  removeGlazingPrice,
  resetCataloguePricing,
  setCataloguePricingValue,
  setGlazingPrice,
  setPosePrice,
  subscribeToCataloguePricing,
} from '@/lib/catalogue-pricing';
import { saveUserCatalogueConfig } from '@/lib/firebase/catalogue';

const CONFIGURABLE_CATEGORY_IDS = [
  'fenetres',
  'coulissants',
  'portes-fenetres',
  'portes',
  'volets',
];

const formatCoefficientInput = (value) =>
  String(value ?? 1).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');

const formatPriceInput = (value) =>
  String(value ?? '').replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');

const formatOptionalNumberInput = (value) =>
  value === null || value === undefined ? '' : formatPriceInput(value);

const createEmptyCustomGlazingDraft = () => ({
  label: '',
  shortLabel: '',
  purchasePricePerM2: '',
  ug: '',
  g: '',
  thicknessMm: '28',
  category: 'personnalise',
  isBaseIncluded: false,
  isOpaqueFilling: false,
  isThermalDataAvailable: true,
});

const CUSTOM_GLAZING_FIELDS = [
  { key: 'label', label: 'Libelle complet', type: 'text' },
  { key: 'shortLabel', label: 'Libelle court', type: 'text' },
  { key: 'purchasePricePerM2', label: 'Prix achat EUR/m2', type: 'number', step: '0.01' },
  { key: 'ug', label: 'Ug', type: 'number', step: '0.01' },
  { key: 'g', label: 'Facteur g', type: 'number', step: '0.01' },
  { key: 'thicknessMm', label: 'Epaisseur mm', type: 'number', step: '1' },
  { key: 'category', label: 'Categorie', type: 'text' },
];

export default function CataloguePage() {
  const configurableCategories = useMemo(
    () => CATEGORIES.filter((category) => CONFIGURABLE_CATEGORY_IDS.includes(category.id)),
    []
  );
  const { user, initializing, isConfigured } = useFirebaseAuth();

  const currentCoefficients = useSyncExternalStore(
    subscribeToCatalogueCoefficients,
    getCatalogueCoefficientsSnapshot,
    getCatalogueCoefficientsServerSnapshot
  );
  const currentPricing = useSyncExternalStore(
    subscribeToCataloguePricing,
    getCataloguePricingSnapshot,
    getCataloguePricingServerSnapshot
  );
  const availableGlazingOptions = useSyncExternalStore(
    subscribeToGlazingOptions,
    getGlazingOptionsSnapshot,
    getGlazingOptionsServerSnapshot
  );
  const customGlazingOptions = useSyncExternalStore(
    subscribeToGlazingOptions,
    getCustomGlazingOptionsSnapshot,
    getGlazingOptionsServerSnapshot
  );

  const glazingEntries = useMemo(
    () =>
      availableGlazingOptions.filter(
        (glazing) =>
          glazing.id !== PANEL_SANDWICH_GLAZING_ID &&
          !customGlazingOptions.some((custom) => custom.id === glazing.id)
      ),
    [availableGlazingOptions, customGlazingOptions]
  );

  const [draftInputs, setDraftInputs] = useState({});
  const [saveMessage, setSaveMessage] = useState('');
  const [pricingDrafts, setPricingDrafts] = useState({});
  const [pricingMessage, setPricingMessage] = useState('');
  const [customGlazingDrafts, setCustomGlazingDrafts] = useState({});
  const [glazingMessage, setGlazingMessage] = useState('');
  const [syncError, setSyncError] = useState('');
  const [newCustomGlazing, setNewCustomGlazing] = useState(createEmptyCustomGlazingDraft());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [pushMessage, setPushMessage] = useState('');

  // Le bouton « Pousser vers l'équipe » n'est visible que pour le compte
  // administrateur (UID exposé via NEXT_PUBLIC_CATALOGUE_SYNC_OWNER_UID).
  // La route serveur revérifie de toute façon ce droit.
  const syncOwnerUid = (process.env.NEXT_PUBLIC_CATALOGUE_SYNC_OWNER_UID || '').trim();
  const canPushToTeam = Boolean(syncOwnerUid && user?.uid === syncOwnerUid);

  const handlePushToTeam = async () => {
    if (!user?.uid) return;
    setPushMessage('');
    setSyncError('');
    setIsPushing(true);

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/catalogue/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || 'La synchronisation vers l’équipe a échoué.');
      }

      setPushMessage(
        data.failed > 0
          ? `Catalogue poussé vers ${data.synced}/${data.total} compte(s). ${data.failed} échec(s).`
          : `Catalogue poussé vers ${data.synced} compte(s) de l’équipe.`
      );
    } catch (error) {
      setSyncError(error?.message || 'La synchronisation vers l’équipe a échoué.');
    } finally {
      setIsPushing(false);
    }
  };

  const buildPersistenceMessage = (baseMessage) => {
    if (!isConfigured) {
      return `${baseMessage} Sauvegarde locale uniquement.`;
    }

    if (!user?.uid) {
      return `${baseMessage} Sauvegarde locale effectuee. Connectez-vous pour synchroniser.`;
    }

    return `${baseMessage} Synchronise dans le cloud.`;
  };

  const persistCatalogueToCloud = async (setMessage, baseMessage) => {
    setSyncError('');
    setMessage(buildPersistenceMessage(baseMessage));

    if (!isConfigured || !user?.uid) {
      return;
    }

    setIsSyncing(true);

    try {
      const payload = getCurrentCataloguePayload();
      await saveUserCatalogueConfig({
        userId: user.uid,
        ...payload,
      });
      setMessage(buildPersistenceMessage(baseMessage));
    } catch (error) {
      setSyncError(
        error?.message ||
          "Le catalogue a bien ete mis a jour localement, mais la synchronisation cloud a echoue."
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCoefficientChange = (productId, nextValue) => {
    setDraftInputs((prev) => ({
      ...prev,
      [productId]: nextValue,
    }));
  };

  const handleCoefficientBlur = async (productId) => {
    const currentInput =
      draftInputs[productId] ?? formatCoefficientInput(currentCoefficients[productId] || 1);
    setProductCoefficient(productId, currentInput);

    setDraftInputs((prev) => {
      const nextDrafts = { ...prev };
      delete nextDrafts[productId];
      return nextDrafts;
    });

    await persistCatalogueToCloud(setSaveMessage, 'Catalogue mis a jour.');
  };

  const handleResetProduct = async (productId) => {
    setProductCoefficient(productId, 1);
    setDraftInputs((prev) => {
      const nextDrafts = { ...prev };
      delete nextDrafts[productId];
      return nextDrafts;
    });

    await persistCatalogueToCloud(setSaveMessage, 'Coefficient reinitialise.');
  };

  const handleResetAll = async () => {
    resetAllProductCoefficients();
    setDraftInputs({});
    await persistCatalogueToCloud(
      setSaveMessage,
      'Tous les coefficients sont revenus a 1.'
    );
  };

  const handlePricingChange = (key, nextValue) => {
    setPricingDrafts((prev) => ({
      ...prev,
      [key]: nextValue,
    }));
  };

  const handlePricingBlur = async (key, currentValue, onSave, message) => {
    const inputValue = pricingDrafts[key] ?? formatPriceInput(currentValue);
    onSave(inputValue);

    setPricingDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    await persistCatalogueToCloud(setPricingMessage, message);
  };

  const handleResetPricing = async () => {
    resetCataloguePricing();
    setPricingDrafts({});
    await persistCatalogueToCloud(
      setPricingMessage,
      'Parametres de prix reinitialises.'
    );
  };

  const handleCustomGlazingDraftChange = (glazingId, field, value) => {
    setCustomGlazingDrafts((prev) => ({
      ...prev,
      [`${glazingId}:${field}`]: value,
    }));
  };

  const handleCustomGlazingBlur = async (glazingId, field, currentValue) => {
    const draftKey = `${glazingId}:${field}`;
    const nextValue =
      customGlazingDrafts[draftKey] ??
      (field === 'ug' || field === 'g' || field === 'purchasePricePerM2' || field === 'thicknessMm'
        ? formatOptionalNumberInput(currentValue)
        : String(currentValue ?? ''));

    setCustomGlazingOptions(
      customGlazingOptions.map((glazing) =>
        glazing.id === glazingId ? { ...glazing, [field]: nextValue } : glazing
      )
    );

    setCustomGlazingDrafts((prev) => {
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });

    await persistCatalogueToCloud(
      setGlazingMessage,
      'Vitrage personnalise mis a jour.'
    );
  };

  const handleCustomGlazingToggle = async (glazingId, field, checked) => {
    setCustomGlazingOptions(
      customGlazingOptions.map((glazing) => {
        if (glazing.id !== glazingId) return glazing;

        if (field === 'isOpaqueFilling' && checked) {
          return {
            ...glazing,
            isOpaqueFilling: true,
            isThermalDataAvailable: false,
          };
        }

        return {
          ...glazing,
          [field]: checked,
        };
      })
    );

    await persistCatalogueToCloud(
      setGlazingMessage,
      'Vitrage personnalise mis a jour.'
    );
  };

  const handleRemoveCustomGlazing = async (glazingId) => {
    setCustomGlazingOptions(
      customGlazingOptions.filter((glazing) => glazing.id !== glazingId)
    );
    removeGlazingPrice(glazingId);
    setCustomGlazingDrafts((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([key]) => !key.startsWith(`${glazingId}:`))
      )
    );

    await persistCatalogueToCloud(
      setGlazingMessage,
      'Vitrage personnalise supprime.'
    );
  };

  const handleAddCustomGlazing = async () => {
    if (!newCustomGlazing.label.trim() || !newCustomGlazing.shortLabel.trim()) {
      setSyncError('Renseignez au minimum un libelle complet et un libelle court.');
      return;
    }

    setCustomGlazingOptions([
      ...customGlazingOptions,
      {
        ...newCustomGlazing,
        id: createCustomGlazingId(newCustomGlazing.shortLabel || newCustomGlazing.label),
      },
    ]);
    setNewCustomGlazing(createEmptyCustomGlazingDraft());

    await persistCatalogueToCloud(
      setGlazingMessage,
      'Vitrage personnalise ajoute.'
    );
  };

  const activeCoefficientCount = configurableCategories.reduce((count, category) => {
    return (
      count +
      category.products.filter((product) => (currentCoefficients[product.id] || 1) !== 1).length
    );
  }, 0);

  return (
    <AppShell
      title="Catalogue"
      subtitle="Le catalogue est maintenant pense pour etre synchronise dans Firebase afin de partager les coefficients, les prix et les vitrages personnalises."
      actions={
        <button
          type="button"
          onClick={handleResetAll}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-700"
        >
          <RotateCcw size={14} />
          Tout remettre a 1
        </button>
      }
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-sky-100 p-2 text-sky-600">
                  <Cloud size={18} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-sky-500">
                    Synchronisation
                  </p>
                  <h3 className="text-lg font-bold text-slate-900">Catalogue cloud</h3>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Les ajustements de catalogue peuvent maintenant vivre dans Firestore et se
                repercuter sur tous les postes connectes.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {initializing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={15} className="animate-spin" />
                  Verification de la session Firebase...
                </span>
              ) : !isConfigured ? (
                'Firebase n est pas configure : le catalogue reste local.'
              ) : user?.email ? (
                `Synchronisation active pour ${user.email}`
              ) : (
                'Connectez-vous pour partager le catalogue entre plusieurs postes.'
              )}
            </div>
          </div>

          {canPushToTeam && (
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-400">
                Vos coefficients, prix et vitrages sont déjà enregistrés sur votre compte.
                Utilisez ce bouton pour les répercuter sur les comptes de l’équipe.
              </p>
              <button
                type="button"
                onClick={() => void handlePushToTeam()}
                disabled={isPushing || isSyncing}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition-all hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPushing ? <Loader2 size={14} className="animate-spin" /> : <UsersRound size={14} />}
                Pousser vers l’équipe
              </button>
            </div>
          )}

          {pushMessage && (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
              {pushMessage}
            </div>
          )}

          {syncError && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {syncError}
            </div>
          )}

          {isSyncing && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              Synchronisation du catalogue en cours...
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-orange-100 p-2 text-orange-600">
                  <SlidersHorizontal size={18} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-orange-500">
                    Coefficients
                  </p>
                  <h3 className="text-lg font-bold text-slate-900">Hausse matiere premiere</h3>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Exemple : `1.1` ajoute 10% sur le prix de base avant options et remise.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Produits ajustes
                </p>
                <p className="mt-2 text-2xl font-black text-slate-900">
                  {activeCoefficientCount}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Portee
                </p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  Menuiseries et volets
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Services et hors catalogue non concernes
                </p>
              </div>
            </div>
          </div>

          {saveMessage && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {saveMessage}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                  <Wrench size={18} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Parametres de prix
                  </p>
                  <h3 className="text-lg font-bold text-slate-900">
                    Valeurs metier configurees
                  </h3>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Ces valeurs alimentent automatiquement les options, vitrages, panneaux et poses.
              </p>
            </div>

            <button
              type="button"
              onClick={handleResetPricing}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-700"
            >
              <RotateCcw size={14} />
              Reinitialiser les valeurs
            </button>
          </div>

          {pricingMessage && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {pricingMessage}
            </div>
          )}

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-sm font-bold text-slate-900">Pose</h4>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  {
                    id: 'menuiserie',
                    label: 'Menuiseries',
                    value: currentPricing.posePrices?.menuiserie,
                  },
                  {
                    id: 'porte',
                    label: 'Portes entree',
                    value: currentPricing.posePrices?.porte,
                  },
                  {
                    id: 'volet',
                    label: 'Volets roulants',
                    value: currentPricing.posePrices?.volet,
                  },
                ].map((entry) => {
                  const key = `pose:${entry.id}`;
                  const inputValue = pricingDrafts[key] ?? formatPriceInput(entry.value);

                  return (
                    <label key={entry.id} className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                        {entry.label}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={inputValue}
                        onChange={(event) => handlePricingChange(key, event.target.value)}
                        onBlur={() =>
                          handlePricingBlur(
                            key,
                            entry.value,
                            (value) => setPosePrice(entry.id, value),
                            'Pose mise a jour.'
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-sm font-bold text-slate-900">Remplissages & soubassement</h4>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  {
                    key: 'pricing:baseGlassPricePerM2',
                    label: 'Vitrage standard (EUR/m2)',
                    value: currentPricing.baseGlassPricePerM2,
                    onSave: (value) => setCataloguePricingValue('baseGlassPricePerM2', value),
                  },
                  {
                    key: 'pricing:panelSandwichPricePerM2',
                    label: 'Panneau sandwich (EUR/m2)',
                    value: currentPricing.panelSandwichPricePerM2,
                    onSave: (value) => setCataloguePricingValue('panelSandwichPricePerM2', value),
                  },
                  {
                    key: 'pricing:panelSandwichColorMultiplier',
                    label: 'Majoration panneau couleur',
                    value: currentPricing.panelSandwichColorMultiplier,
                    onSave: (value) =>
                      setCataloguePricingValue('panelSandwichColorMultiplier', value),
                  },
                  {
                    key: 'pricing:sousBassementTraversePricePerMl',
                    label: 'Traverse soubassement (EUR/ml)',
                    value: currentPricing.sousBassementTraversePricePerMl,
                    onSave: (value) =>
                      setCataloguePricingValue('sousBassementTraversePricePerMl', value),
                  },
                ].map((entry) => {
                  const inputValue = pricingDrafts[entry.key] ?? formatPriceInput(entry.value);

                  return (
                    <label key={entry.key} className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                        {entry.label}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={inputValue}
                        onChange={(event) => handlePricingChange(entry.key, event.target.value)}
                        onBlur={() =>
                          handlePricingBlur(
                            entry.key,
                            entry.value,
                            entry.onSave,
                            'Remplissages mis a jour.'
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-sm font-bold text-slate-900">Options</h4>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  {
                    key: 'pricing:petitsBoisPricePerMl',
                    label: 'Petits bois (EUR/ml)',
                    value: currentPricing.petitsBoisPricePerMl,
                    onSave: (value) => setCataloguePricingValue('petitsBoisPricePerMl', value),
                  },
                  {
                    key: 'pricing:obPrice',
                    label: 'Oscillo-battant (EUR)',
                    value: currentPricing.obPrice,
                    onSave: (value) => setCataloguePricingValue('obPrice', value),
                  },
                  {
                    key: 'pricing:grillePrice',
                    label: 'Grille ventilation (EUR)',
                    value: currentPricing.grillePrice,
                    onSave: (value) => setCataloguePricingValue('grillePrice', value),
                  },
                  {
                    key: 'pricing:lockingHandlePrice',
                    label: 'Poignee a cle (EUR)',
                    value: currentPricing.lockingHandlePrice,
                    onSave: (value) => setCataloguePricingValue('lockingHandlePrice', value),
                  },
                  {
                    key: 'pricing:panneauDecoratifPrice',
                    label: 'Panneau decoratif (EUR)',
                    value: currentPricing.panneauDecoratifPrice,
                    onSave: (value) => setCataloguePricingValue('panneauDecoratifPrice', value),
                  },
                  {
                    key: 'pricing:panneauDecoratifMultiplier',
                    label: 'Majoration panneau decoratif',
                    value: currentPricing.panneauDecoratifMultiplier,
                    onSave: (value) =>
                      setCataloguePricingValue('panneauDecoratifMultiplier', value),
                  },
                ].map((entry) => {
                  const inputValue = pricingDrafts[entry.key] ?? formatPriceInput(entry.value);

                  return (
                    <label key={entry.key} className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                        {entry.label}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={inputValue}
                        onChange={(event) => handlePricingChange(entry.key, event.target.value)}
                        onBlur={() =>
                          handlePricingBlur(
                            entry.key,
                            entry.value,
                            entry.onSave,
                            'Options mises a jour.'
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
              <h4 className="text-sm font-bold text-slate-900">Vitrages standards (prix au m2)</h4>
              <p className="mt-1 text-xs text-slate-500">
                Les vitrages personnalises se gerent dans la section dediee plus bas.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {glazingEntries.map((glazing) => {
                  const currentValue =
                    currentPricing.glazingPrices?.[glazing.id] ?? glazing.purchasePricePerM2;
                  const key = `glazing:${glazing.id}`;
                  const inputValue = pricingDrafts[key] ?? formatPriceInput(currentValue);

                  return (
                    <div
                      key={glazing.id}
                      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">{glazing.shortLabel}</p>
                        <p className="mt-1 text-xs text-slate-500">{glazing.label}</p>
                      </div>
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                          Prix EUR/m2
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={inputValue}
                          onChange={(event) => handlePricingChange(key, event.target.value)}
                          onBlur={() =>
                            handlePricingBlur(
                              key,
                              currentValue,
                              (value) => setGlazingPrice(glazing.id, value),
                              'Tarifs vitrages mis a jour.'
                            )
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-emerald-100 p-2 text-emerald-600">
                  <Plus size={18} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-500">
                    Vitrages personnalises
                  </p>
                  <h3 className="text-lg font-bold text-slate-900">
                    Catalogue vitrage extensible
                  </h3>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Cette section permet d&apos;ajouter de nouveaux vitrages qui deviennent ensuite
                disponibles dans le configurateur produit.
              </p>
            </div>
          </div>

          {glazingMessage && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {glazingMessage}
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {CUSTOM_GLAZING_FIELDS.map((field) => (
                <label key={field.key} className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                    {field.label}
                  </span>
                  <input
                    type={field.type}
                    min={field.type === 'number' ? '0' : undefined}
                    step={field.step}
                    inputMode={field.type === 'number' ? 'decimal' : undefined}
                    value={newCustomGlazing[field.key]}
                    onChange={(event) =>
                      setNewCustomGlazing((prev) => ({
                        ...prev,
                        [field.key]: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </label>
              ))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={newCustomGlazing.isBaseIncluded}
                  onChange={(event) =>
                    setNewCustomGlazing((prev) => ({
                      ...prev,
                      isBaseIncluded: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-orange-500"
                />
                Inclus dans le vitrage standard
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={newCustomGlazing.isOpaqueFilling}
                  onChange={(event) =>
                    setNewCustomGlazing((prev) => ({
                      ...prev,
                      isOpaqueFilling: event.target.checked,
                      isThermalDataAvailable: event.target.checked
                        ? false
                        : prev.isThermalDataAvailable,
                    }))
                  }
                  className="h-4 w-4 accent-orange-500"
                />
                Remplissage opaque
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={newCustomGlazing.isThermalDataAvailable}
                  onChange={(event) =>
                    setNewCustomGlazing((prev) => ({
                      ...prev,
                      isThermalDataAvailable: event.target.checked,
                    }))
                  }
                  disabled={newCustomGlazing.isOpaqueFilling}
                  className="h-4 w-4 accent-orange-500"
                />
                Donnees thermiques disponibles
              </label>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={handleAddCustomGlazing}
                className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600"
              >
                <Plus size={15} />
                Ajouter ce vitrage
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {customGlazingOptions.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                Aucun vitrage personnalise pour le moment.
              </div>
            ) : (
              customGlazingOptions.map((glazing) => (
                <div
                  key={glazing.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-base font-bold text-slate-900">{glazing.shortLabel}</p>
                      <p className="mt-1 text-sm text-slate-500">{glazing.label}</p>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                        {glazing.category}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveCustomGlazing(glazing.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                    >
                      <Trash2 size={15} />
                      Supprimer
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {CUSTOM_GLAZING_FIELDS.map((field) => {
                      const draftKey = `${glazing.id}:${field.key}`;
                      const currentValue =
                        field.type === 'number'
                          ? formatOptionalNumberInput(glazing[field.key])
                          : String(glazing[field.key] ?? '');
                      const inputValue = customGlazingDrafts[draftKey] ?? currentValue;

                      return (
                        <label key={field.key} className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                            {field.label}
                          </span>
                          <input
                            type={field.type}
                            min={field.type === 'number' ? '0' : undefined}
                            step={field.step}
                            inputMode={field.type === 'number' ? 'decimal' : undefined}
                            value={inputValue}
                            onChange={(event) =>
                              handleCustomGlazingDraftChange(
                                glazing.id,
                                field.key,
                                event.target.value
                              )
                            }
                            onBlur={() =>
                              handleCustomGlazingBlur(
                                glazing.id,
                                field.key,
                                glazing[field.key]
                              )
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                          />
                        </label>
                      );
                    })}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={glazing.isBaseIncluded === true}
                        onChange={(event) =>
                          handleCustomGlazingToggle(
                            glazing.id,
                            'isBaseIncluded',
                            event.target.checked
                          )
                        }
                        className="h-4 w-4 accent-orange-500"
                      />
                      Inclus dans le vitrage standard
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={glazing.isOpaqueFilling === true}
                        onChange={(event) =>
                          handleCustomGlazingToggle(
                            glazing.id,
                            'isOpaqueFilling',
                            event.target.checked
                          )
                        }
                        className="h-4 w-4 accent-orange-500"
                      />
                      Remplissage opaque
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={glazing.isThermalDataAvailable !== false}
                        onChange={(event) =>
                          handleCustomGlazingToggle(
                            glazing.id,
                            'isThermalDataAvailable',
                            event.target.checked
                          )
                        }
                        disabled={glazing.isOpaqueFilling === true}
                        className="h-4 w-4 accent-orange-500"
                      />
                      Donnees thermiques disponibles
                    </label>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {configurableCategories.map((category) => (
          <section
            key={category.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Famille
                </p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">{category.label}</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                {category.products.length} produit(s)
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {category.products.map((product) => {
                const coefficient = currentCoefficients[product.id] || 1;
                const inputValue =
                  draftInputs[product.id] ?? formatCoefficientInput(coefficient);

                return (
                  <div
                    key={product.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-base font-bold text-slate-900">{product.label}</h4>
                        <p className="mt-1 text-sm text-slate-500">
                          Ref interne : {product.shortLabel || product.id}
                        </p>
                        <p
                          className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            coefficient === 1
                              ? 'bg-slate-200 text-slate-600'
                              : 'bg-orange-100 text-orange-700'
                          }`}
                        >
                          {formatCoefficientDelta(coefficient)}
                        </p>
                      </div>

                      <div className="w-full max-w-[220px] space-y-2">
                        <label className="block">
                          <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                            Coefficient
                          </span>
                          <input
                            type="number"
                            min="0.1"
                            step="0.01"
                            inputMode="decimal"
                            value={inputValue}
                            onChange={(event) =>
                              handleCoefficientChange(product.id, event.target.value)
                            }
                            onBlur={() => void handleCoefficientBlur(product.id)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                          />
                        </label>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void handleCoefficientBlur(product.id)}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600"
                          >
                            <Save size={15} />
                            Appliquer
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleResetProduct(product.id)}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                          >
                            1
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
