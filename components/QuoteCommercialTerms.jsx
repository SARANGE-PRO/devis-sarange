'use client';

import { useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  ChevronDown,
  CreditCard,
} from 'lucide-react';
import {
  buildPaymentTermsSentence,
  getDeliveryDelayLabel,
  getDeliveryDelayOptions,
  getPaymentMilestones,
  getPaymentScheduleValidation,
  getStandardDepositOptions,
  normalizeQuoteSettings,
} from '@/lib/quote-settings.mjs';

const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

export default function QuoteCommercialTerms({
  quoteSettings,
  onChange,
  totalTTC,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const settings = normalizeQuoteSettings(quoteSettings);
  const paymentValidation = getPaymentScheduleValidation(settings);
  const milestones = getPaymentMilestones(settings, totalTTC);
  const deliveryDelayOptions = getDeliveryDelayOptions();
  const standardDepositOptions = getStandardDepositOptions();
  const paymentSentence = buildPaymentTermsSentence(settings);
  const deliveryLabel = getDeliveryDelayLabel(settings);
  const paymentSummary =
    settings.paymentMode === 'schedule'
      ? `Échéancier ${settings.customSignaturePercent}% / ${settings.customOpeningPercent}% / ${settings.customBalancePercent}%`
      : `Acompte ${settings.standardDepositPercent}% · Solde ${100 - settings.standardDepositPercent}%`;

  const updateSettings = (patch) => {
    if (!onChange) return;
    onChange(normalizeQuoteSettings({ ...settings, ...patch }));
  };

  return (
    <div className="border-t border-slate-100">
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-slate-50 sm:p-8"
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-orange-50 p-2.5 text-orange-500">
            <CreditCard size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
              Conditions commerciales
            </h3>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700">
                {paymentSummary}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700">
                Délai {deliveryLabel}
              </span>
            </div>
          </div>
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-slate-400 transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isExpanded && (
        <div className="px-5 pb-5 sm:px-8 sm:pb-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div className="space-y-5">
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => updateSettings({ paymentMode: 'standard' })}
                    className={`rounded-2xl border-2 p-4 text-left transition-all ${
                      settings.paymentMode === 'standard'
                        ? 'border-orange-500 bg-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-bold text-slate-900">Acompte standard</p>
                    <p className="mt-1 text-xs text-slate-500">
                      2 étapes automatiques
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ paymentMode: 'schedule' })}
                    className={`rounded-2xl border-2 p-4 text-left transition-all ${
                      settings.paymentMode === 'schedule'
                        ? 'border-orange-500 bg-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-bold text-slate-900">
                      Échéancier personnalisé
                    </p>
                    <p className="mt-1 text-xs text-slate-500">3 étapes à 100%</p>
                  </button>
                </div>

                {settings.paymentMode === 'standard' ? (
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      Acompte à la commande
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {standardDepositOptions.map((percent) => {
                        const balancePercent = 100 - percent;
                        const isActive = settings.standardDepositPercent === percent;

                        return (
                          <button
                            key={percent}
                            type="button"
                            onClick={() =>
                              updateSettings({ standardDepositPercent: percent })
                            }
                            className={`rounded-xl border px-3 py-3 text-sm font-bold transition-all ${
                              isActive
                                ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300'
                            }`}
                          >
                            <span className="block">{percent}%</span>
                            <span
                              className={`mt-1 block text-[10px] ${
                                isActive ? 'text-orange-100' : 'text-slate-400'
                              }`}
                            >
                              Solde {balancePercent}%
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      {[
                        {
                          key: 'customSignaturePercent',
                          label: 'Acompte (signature)',
                        },
                        {
                          key: 'customOpeningPercent',
                          label: 'Ouverture de chantier',
                        },
                        {
                          key: 'customBalancePercent',
                          label: 'Solde (achèvement)',
                        },
                      ].map((field) => (
                        <label key={field.key} className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                            {field.label}
                          </span>
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={settings[field.key]}
                              onChange={(event) =>
                                updateSettings({
                                  [field.key]:
                                    Number.parseFloat(event.target.value) || 0,
                                })
                              }
                              className="w-full rounded-xl border border-slate-200 px-4 py-3 pr-10 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                              %
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>

                    <div
                      className={`rounded-xl border px-4 py-3 text-sm ${
                        paymentValidation.isValid
                          ? 'border-green-200 bg-green-50 text-green-700'
                          : 'border-red-200 bg-red-50 text-red-700'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <div>
                          <p className="font-bold">
                            Total saisi : {paymentValidation.totalPercent}%
                          </p>
                          <p className="mt-1 text-xs">
                            {paymentValidation.isValid
                              ? "L'échéancier est prêt pour le devis."
                              : `L'échéancier doit totaliser 100% (${Math.abs(
                                  paymentValidation.differencePercent
                                )}% à ajuster).`}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-white p-2 text-slate-500 shadow-sm">
                    <CalendarClock size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      Délai de livraison
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <select
                    value={settings.deliveryDelayPreset}
                    onChange={(event) =>
                      updateSettings({
                        deliveryDelayPreset: event.target.value,
                        deliveryDelayMode:
                          settings.deliveryDelayMode === 'custom'
                            ? 'custom'
                            : 'preset',
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  >
                    {deliveryDelayOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({
                        deliveryDelayMode:
                          settings.deliveryDelayMode === 'custom'
                            ? 'preset'
                            : 'custom',
                      })
                    }
                    className={`rounded-xl border px-4 py-3 text-sm font-bold transition-all ${
                      settings.deliveryDelayMode === 'custom'
                        ? 'border-orange-500 bg-orange-500 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300'
                    }`}
                  >
                    {settings.deliveryDelayMode === 'custom'
                      ? 'Standard'
                      : 'Personnaliser'}
                  </button>
                </div>

                {settings.deliveryDelayMode === 'custom' && (
                  <input
                    type="text"
                    value={settings.deliveryDelayCustom}
                    onChange={(event) =>
                      updateSettings({
                        deliveryDelayCustom: event.target.value,
                        deliveryDelayMode: 'custom',
                      })
                    }
                    placeholder="Ex : Livraison prévue mi-juillet"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                )}
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  Aperçu du devis
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700">
                  {paymentSentence}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Délai affiché :{' '}
                  <span className="font-bold text-slate-900">{deliveryLabel}</span>
                </p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="px-3 py-2 font-bold">Étape</th>
                      <th className="px-3 py-2 font-bold">%</th>
                      <th className="px-3 py-2 font-bold">Montant TTC</th>
                      <th className="px-3 py-2 font-bold">Échéance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {milestones.map((milestone) => (
                      <tr key={milestone.id}>
                        <td className="px-3 py-2 font-semibold text-slate-800">
                          {milestone.label}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {milestone.percent}%
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-900">
                          {currencyFormatter.format(milestone.amountTTC)}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {milestone.dueLabel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!paymentValidation.isValid && settings.paymentMode === 'schedule' && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
                  Le devis PDF reste bloqué tant que la somme de l&apos;échéancier
                  personnalisé n&apos;est pas égale à 100%.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
