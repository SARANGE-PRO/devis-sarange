'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import AppShell from '@/components/AppShell';
import {
  CATEGORIES,
} from '@/lib/products';
import {
  formatCoefficientDelta,
  getCatalogueCoefficientsServerSnapshot,
  getCatalogueCoefficientsSnapshot,
  resetAllProductCoefficients,
  setProductCoefficient,
  subscribeToCatalogueCoefficients,
} from '@/lib/catalogue-coefficients';
import { RotateCcw, Save, SlidersHorizontal } from 'lucide-react';

const CONFIGURABLE_CATEGORY_IDS = [
  'fenetres',
  'coulissants',
  'portes-fenetres',
  'portes',
  'volets',
];

const formatCoefficientInput = (value) =>
  String(value ?? 1).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');

export default function CataloguePage() {
  const configurableCategories = useMemo(
    () => CATEGORIES.filter((category) => CONFIGURABLE_CATEGORY_IDS.includes(category.id)),
    []
  );

  const currentCoefficients = useSyncExternalStore(
    subscribeToCatalogueCoefficients,
    getCatalogueCoefficientsSnapshot,
    getCatalogueCoefficientsServerSnapshot
  );
  const [draftInputs, setDraftInputs] = useState({});
  const [saveMessage, setSaveMessage] = useState('');

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
