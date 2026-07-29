'use client';

import { useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  ChevronDown,
  CreditCard,
  Handshake,
  Hourglass,
} from 'lucide-react';
import {
  buildPaymentTermsSentence,
  getDeliveryDelayLabel,
  getDeliveryDelayOptions,
  getPaymentMilestones,
  getPaymentPlanValidation,
  getPaymentTriggerOptions,
  getStandardDepositOptions,
  getValidityLabel,
  getValidityMonthsOptions,
  normalizeQuoteSettings,
} from '@/lib/quote-settings.mjs';
import {
  CONTRACT_TYPES,
  getContractTypeLabel,
  detectContractType,
  resolveContractType,
  resolveLineNature,
} from '@/lib/line-nature.mjs';

const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

const SCHEDULE_STEPS = [
  { percentKey: 'customSignaturePercent', triggerIdKey: 'customStep1TriggerId', triggerTextKey: 'customStep1TriggerText', label: 'Échéance 1 (acompte)' },
  { percentKey: 'customOpeningPercent', triggerIdKey: 'customStep2TriggerId', triggerTextKey: 'customStep2TriggerText', label: 'Échéance 2' },
  { percentKey: 'customBalancePercent', triggerIdKey: 'customStep3TriggerId', triggerTextKey: 'customStep3TriggerText', label: 'Échéance 3 (solde)' },
];

// Corrections manuelles exceptionnelles de la nature d'une ligne pour la
// ventilation fabrication / chantier (et l'export Sage, même source de vérité).
const NATURE_OVERRIDE_OPTIONS = [
  { value: '', label: 'Auto' },
  { value: 'fourniture', label: 'Fourniture (fabrication)' },
  { value: 'metrage', label: 'Métrage (fabrication)' },
  { value: 'pose', label: 'Pose (chantier)' },
  { value: 'livraison', label: 'Livraison (chantier)' },
  { value: 'recyclage', label: 'Recyclage (chantier)' },
];

export default function QuoteCommercialTerms({
  quoteSettings,
  onChange,
  totals = null,
  totalTTC = 0,
  cartItems = [],
  onUpdateItem,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showNatureOverrides, setShowNatureOverrides] = useState(false);
  const settings = normalizeQuoteSettings(quoteSettings);
  const effectiveTotalTTC = totals?.totalTTC ?? totalTTC;
  const planValidation = getPaymentPlanValidation(settings, totals);
  const milestones = getPaymentMilestones(settings, effectiveTotalTTC, totals?.breakdown);
  const deliveryDelayOptions = getDeliveryDelayOptions();
  const standardDepositOptions = getStandardDepositOptions();
  const validityMonthsOptions = getValidityMonthsOptions();
  const triggerOptions = getPaymentTriggerOptions();
  const paymentSentence = buildPaymentTermsSentence(settings);
  const deliveryLabel = getDeliveryDelayLabel(settings);
  const validityLabel = getValidityLabel(settings);

  const detectedContractType = detectContractType(cartItems);
  const contractType = resolveContractType(cartItems, settings.contractTypeOverride);
  const hasChantier = Boolean(totals?.breakdown?.hasChantier);
  const fabricationPoseAvailable =
    contractType === CONTRACT_TYPES.AVEC_POSE && hasChantier;

  const paymentSummary =
    settings.paymentMode === 'schedule'
      ? `Échéancier ${settings.customSignaturePercent}% / ${settings.customOpeningPercent}% / ${settings.customBalancePercent}%`
      : settings.paymentMode === 'fabricationPose'
        ? 'Échéancier fabrication / pose'
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
                {getContractTypeLabel(contractType)}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700">
                Délai {deliveryLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700">
                Validité {validityLabel}
              </span>
              {settings.commissionPercent > 0 && (
                <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 font-semibold text-orange-700">
                  Commission {settings.commissionPercent}%
                </span>
              )}
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
                <div className="grid gap-3 md:grid-cols-3">
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
                  <button
                    type="button"
                    disabled={!fabricationPoseAvailable}
                    onClick={() => updateSettings({ paymentMode: 'fabricationPose' })}
                    title={
                      fabricationPoseAvailable
                        ? undefined
                        : 'Disponible uniquement lorsque le devis contient une pose'
                    }
                    className={`rounded-2xl border-2 p-4 text-left transition-all ${
                      settings.paymentMode === 'fabricationPose'
                        ? 'border-orange-500 bg-white shadow-sm'
                        : !fabricationPoseAvailable
                          ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-bold text-slate-900">
                      Fabrication / pose
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {fabricationPoseAvailable
                        ? '50% · solde fabrication · pose'
                        : 'Nécessite une pose au devis'}
                    </p>
                  </button>
                </div>

                {settings.paymentMode === 'standard' && (
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
                )}

                {settings.paymentMode === 'schedule' && (
                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="space-y-3">
                      {SCHEDULE_STEPS.map((step) => (
                        <div
                          key={step.percentKey}
                          className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 md:grid-cols-[110px_minmax(0,1fr)]"
                        >
                          <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                              {step.label}
                            </span>
                            <div className="relative">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={settings[step.percentKey]}
                                onChange={(event) =>
                                  updateSettings({
                                    [step.percentKey]:
                                      Number.parseFloat(event.target.value) || 0,
                                  })
                                }
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                                %
                              </span>
                            </div>
                          </label>
                          <div className="min-w-0">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                              Déclencheur d&apos;exigibilité
                            </span>
                            <select
                              value={settings[step.triggerIdKey]}
                              onChange={(event) =>
                                updateSettings({ [step.triggerIdKey]: event.target.value })
                              }
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            >
                              {triggerOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            {settings[step.triggerIdKey] === 'autre' && (
                              <input
                                type="text"
                                value={settings[step.triggerTextKey]}
                                onChange={(event) =>
                                  updateSettings({
                                    [step.triggerTextKey]: event.target.value,
                                  })
                                }
                                placeholder="Ex : À la fin du lot menuiseries du bâtiment A"
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {settings.paymentMode === 'fabricationPose' && (
                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                    {totals?.breakdown && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Fabrication &amp; fournitures TTC
                          </p>
                          <p className="mt-1 text-sm font-black text-slate-900">
                            {currencyFormatter.format(totals.breakdown.fabrication.totalTTC)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Prestations chantier TTC
                          </p>
                          <p className="mt-1 text-sm font-black text-slate-900">
                            {currencyFormatter.format(totals.breakdown.chantier.totalTTC)}
                          </p>
                        </div>
                      </div>
                    )}

                    {Array.isArray(cartItems) && cartItems.length > 0 && onUpdateItem && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowNatureOverrides((current) => !current)}
                          className="text-xs font-bold text-slate-500 underline decoration-dotted underline-offset-2 hover:text-orange-600"
                        >
                          {showNatureOverrides
                            ? 'Masquer la correction de ventilation'
                            : 'Corriger la ventilation d’une ligne (exceptionnel)'}
                        </button>

                        {showNatureOverrides && (
                          <div className="mt-3 space-y-2">
                            {cartItems.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2"
                              >
                                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-600">
                                  {item.productLabel || item.productId}
                                </span>
                                <select
                                  value={item.natureOverride || ''}
                                  onChange={(event) =>
                                    onUpdateItem({
                                      ...item,
                                      natureOverride: event.target.value || undefined,
                                    })
                                  }
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-orange-500"
                                >
                                  {NATURE_OVERRIDE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.value === ''
                                        ? `Auto (${resolveLineNature({ ...item, natureOverride: undefined })})`
                                        : option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!planValidation.isValid && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        {planValidation.errors.map((error) => (
                          <p key={error} className="text-xs font-semibold">
                            {error}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Correction manuelle exceptionnelle du type de contrat détecté. */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold">Type de contrat :</span>
                  <select
                    value={settings.contractTypeOverride}
                    onChange={(event) =>
                      updateSettings({ contractTypeOverride: event.target.value })
                    }
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-orange-500"
                  >
                    <option value="auto">
                      Auto — {getContractTypeLabel(detectedContractType)}
                    </option>
                    <option value={CONTRACT_TYPES.FOURNITURE_SEULE}>
                      Forcer : Fourniture seule
                    </option>
                    <option value={CONTRACT_TYPES.AVEC_POSE}>
                      Forcer : Fourniture avec pose
                    </option>
                  </select>
                  {settings.contractTypeOverride !== 'auto' && (
                    <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 font-bold text-orange-600">
                      Correction manuelle active
                    </span>
                  )}
                </div>
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

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-white p-2 text-slate-500 shadow-sm">
                    <Hourglass size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      Validité de l&apos;offre
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Durée pendant laquelle les prix du devis restent fermes.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {validityMonthsOptions.map((months) => {
                    const isActive = settings.validityMonths === months;

                    return (
                      <button
                        key={months}
                        type="button"
                        onClick={() => updateSettings({ validityMonths: months })}
                        className={`rounded-xl border px-3 py-3 text-sm font-bold transition-all ${
                          isActive
                            ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300'
                        }`}
                      >
                        <span className="block">{months} mois</span>
                        {months === 1 && (
                          <span
                            className={`mt-1 block text-[10px] ${
                              isActive ? 'text-orange-100' : 'text-slate-400'
                            }`}
                          >
                            Par défaut
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-white p-2 text-slate-500 shadow-sm">
                    <Handshake size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      Commission / apporteur d&apos;affaires
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Répartie dans les menuiseries (hors pose). Invisible pour le client.
                    </p>
                  </div>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Pourcentage de commission
                  </span>
                  <div className="relative max-w-[180px]">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={settings.commissionPercent || 0}
                      onChange={(event) =>
                        updateSettings({
                          commissionPercent: Number.parseFloat(event.target.value) || 0,
                        })
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-10 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                      %
                    </span>
                  </div>
                </label>

                {settings.commissionPercent > 0 && (
                  <p className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700">
                    Commission de {settings.commissionPercent}% répartie au prorata dans le
                    prix des menuiseries. Le total du devis augmente d&apos;autant ; la pose
                    reste inchangée.
                  </p>
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
                <p className="mt-1 text-sm text-slate-500">
                  Validité de l&apos;offre :{' '}
                  <span className="font-bold text-slate-900">{validityLabel}</span>
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
                        <td
                          className={`px-3 py-2 font-bold ${
                            milestone.amountTTC < 0 ? 'text-red-600' : 'text-slate-900'
                          }`}
                        >
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

              {!planValidation.isValid && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
                  Le devis PDF reste bloqué tant que l&apos;échéancier n&apos;est pas
                  valide (voir les points signalés à gauche).
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
