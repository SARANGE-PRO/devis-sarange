'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import AppShell from '@/components/AppShell';
import {
  CATEGORIES,
} from '@/lib/products';
import { GLAZING_OPTIONS, PANEL_SANDWICH_GLAZING_ID } from '@/lib/glazing';
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
  resetCataloguePricing,
  setCataloguePricingValue,
  setGlazingPrice,
  setPosePrice,
  subscribeToCataloguePricing,
} from '@/lib/catalogue-pricing';
import { RotateCcw, Save, SlidersHorizontal, Wrench } from 'lucide-react';

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

export default function CataloguePage() {
  const configurableCategories = useMemo(
    () => CATEGORIES.filter((category) => CONFIGURABLE_CATEGORY_IDS.includes(category.id)),
    []
  );
  const glazingEntries = useMemo(
    () => GLAZING_OPTIONS.filter((glazing) => glazing.id !== PANEL_SANDWICH_GLAZING_ID),
    []
  );

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
  const [draftInputs, setDraftInputs] = useState({});
  const [saveMessage, setSaveMessage] = useState('');
  const [pricingDrafts, setPricingDrafts] = useState({});
  const [pricingMessage, setPricingMessage] = useState('');

  const handleCoefficientChange = (productId, nextValue) => {
    setDraftInputs((prev) => ({
      ...prev,
      [productId]: nextValue,
    }));
  };

  const handleCoefficientBlur = (productId) => {
    const currentInput =
      draftInputs[productId] ?? formatCoefficientInput(currentCoefficients[productId] || 1);
    setProductCoefficient(productId, currentInput);

    setDraftInputs((prev) => {
      const nextDrafts = { ...prev };
      delete nextDrafts[productId];
      return nextDrafts;
    });
    setSaveMessage('Catalogue mis a jour.');
  };

  const handleResetProduct = (productId) => {
    setProductCoefficient(productId, 1);
    setDraftInputs((prev) => {
      const nextDrafts = { ...prev };
      delete nextDrafts[productId];
      return nextDrafts;
    });
    setSaveMessage('Coefficient reinitialise.');
  };

  const handleResetAll = () => {
    resetAllProductCoefficients();
    setDraftInputs({});
    setSaveMessage('Tous les coefficients sont revenus a 1.');
  };

  const handlePricingChange = (key, nextValue) => {
    setPricingDrafts((prev) => ({
      ...prev,
      [key]: nextValue,
    }));
  };

  const handlePricingBlur = (key, currentValue, onSave, message) => {
    const inputValue = pricingDrafts[key] ?? formatPriceInput(currentValue);
    onSave(inputValue);
    setPricingDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (message) {
      setPricingMessage(message);
    }
  };

  const handleResetPricing = () => {
    resetCataloguePricing();
    setPricingDrafts({});
    setPricingMessage('Parametres de prix reinitialises.');
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
      subtitle="Ajustez vos coefficients matiere premiere par produit. Un coefficient a 1 laisse le prix de base inchangé."
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
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
      </div>

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
                { id: 'menuiserie', label: 'Menuiseries', value: currentPricing.posePrices?.menuiserie },
                { id: 'porte', label: 'Portes entree', value: currentPricing.posePrices?.porte },
                { id: 'volet', label: 'Volets roulants', value: currentPricing.posePrices?.volet },
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
                        handlePricingBlur(key, entry.value, (value) => setPosePrice(entry.id, value), 'Pose mise a jour.')
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
                  onSave: (value) => setCataloguePricingValue('panelSandwichColorMultiplier', value),
                },
                {
                  key: 'pricing:sousBassementTraversePricePerMl',
                  label: 'Traverse soubassement (EUR/ml)',
                  value: currentPricing.sousBassementTraversePricePerMl,
                  onSave: (value) => setCataloguePricingValue('sousBassementTraversePricePerMl', value),
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
                        handlePricingBlur(entry.key, entry.value, entry.onSave, 'Remplissages mis a jour.')
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
                  onSave: (value) => setCataloguePricingValue('panneauDecoratifMultiplier', value),
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
                        handlePricingBlur(entry.key, entry.value, entry.onSave, 'Options mises a jour.')
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
            <h4 className="text-sm font-bold text-slate-900">Vitrages (prix au m2)</h4>
            <p className="mt-1 text-xs text-slate-500">
              Ces valeurs impactent les plus-values vitrages. Le vitrage standard est gere
              separement.
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
                          handlePricingBlur(key, currentValue, (value) => setGlazingPrice(glazing.id, value), 'Tarifs vitrages mis a jour.')
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
                            onBlur={() => handleCoefficientBlur(product.id)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                          />
                        </label>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleCoefficientBlur(product.id)}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600"
                          >
                            <Save size={15} />
                            Appliquer
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResetProduct(product.id)}
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
