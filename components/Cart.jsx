'use client';

import { useMemo } from 'react';
import {
  Trash2,
  ShoppingCart,
  ArrowRight,
  Minus,
  Plus,
  Package,
  Copy,
  Pencil,
} from 'lucide-react';
import {
  calculateItemPrice,
  formatCompositeModules,
  getCompositeModuleCount,
} from '@/lib/products';
import MenuiserieVisual from '@/components/MenuiserieVisual';
import WasteRecycleIcon from '@/components/icons/WasteRecycleIcon';

const getPetitsBoisConfig = (item = {}) => {
  const legacyValue = Math.max(0, Number.parseInt(item.petitsBois, 10) || 0);
  const petitsBoisH = Math.max(0, Number.parseInt(item.petitsBoisH, 10) || 0);
  const petitsBoisV = Math.max(
    0,
    Number.parseInt(item.petitsBoisV ?? (item.petitsBoisH == null ? legacyValue : 0), 10) || 0
  );

  return { petitsBoisH, petitsBoisV };
};

const formatPetitsBoisLabel = ({ petitsBoisH, petitsBoisV }) => {
  if (!petitsBoisH && !petitsBoisV) return '';
  if (petitsBoisH && petitsBoisV) return `${petitsBoisH}H / ${petitsBoisV}V petits bois`;
  if (petitsBoisH) return `${petitsBoisH} barre(s) horizontale(s)`;
  return `${petitsBoisV} barre(s) verticale(s)`;
};

export default function Cart({
  items,
  tvaRate,
  setTvaRate,
  onRemove,
  onDuplicate,
  onEdit,
  onUpdateQuantity,
  onNext,
  editingItemId,
}) {
  const totals = useMemo(() => {
    let totalHT = 0;
    items.forEach((item) => {
      const calc = calculateItemPrice(item);
      totalHT += calc.totalLine;
      if (item.includePose) {
        totalHT += calc.posePrice * item.quantity;
      }
    });
    const tva = Math.round(totalHT * (tvaRate / 100) * 100) / 100;
    const totalTTC = Math.round((totalHT + tva) * 100) / 100;
    return { totalHT: Math.round(totalHT * 100) / 100, tva, totalTTC };
  }, [items, tvaRate]);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
          <ShoppingCart size={28} className="text-slate-300" />
        </div>
        <h3 className="mb-1 text-lg font-bold text-slate-900">Panier vide</h3>
        <p className="text-sm text-slate-400">
          Ajoutez des produits depuis le catalogue a gauche
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShoppingCart size={18} className="text-orange-500" />
        <h3 className="text-sm font-bold text-slate-900">Panier</h3>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
          {items.length}
        </span>
      </div>

      <div className="max-h-[40vh] space-y-3 overflow-y-auto pr-1">
        {items.map((item) => {
          const calc = calculateItemPrice(item);
          const compositeCount = getCompositeModuleCount(item.composition, item.modules);
          const petitsBoisConfig = getPetitsBoisConfig(item);
          const petitsBoisLabel = formatPetitsBoisLabel(petitsBoisConfig);

          return (
            <div
              key={item.id}
              className={`rounded-xl border p-4 shadow-sm transition-all hover:shadow-md ${
                editingItemId === item.id
                  ? 'border-orange-400 bg-orange-50/50 ring-4 ring-orange-500/10'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start gap-4">
                {item.productId === 'gestion-dechets' ? (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-green-100 bg-green-50">
                    <WasteRecycleIcon size={28} className="text-green-600" />
                  </div>
                ) : item.productId === 'custom-product' ? (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                    {item.customImage ? (
                      <img src={item.customImage} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Package size={28} className="text-slate-300" />
                    )}
                  </div>
                ) : (
                  <MenuiserieVisual
                    sheetName={item.sheetName}
                    width={item.widthMm}
                    height={item.heightMm}
                    options={{
                      isComposite: item.isComposite,
                      composition: item.composition,
                      colorOption: item.colorOption,
                      glazingId: item.glazingOption?.id,
                      petitsBoisH: petitsBoisConfig.petitsBoisH,
                      petitsBoisV: petitsBoisConfig.petitsBoisV,
                      panneauDecoratif: item.panneauDecoratif,
                      hasSousBassement: item.hasSousBassement,
                      sousBassementHeight: item.sousBassementHeight,
                      sashOptions: item.sashOptions,
                      productId: item.productId,
                      openingDirection: item.openingDirection,
                      svgColor: item.svgColor,
                    }}
                    className="h-16 w-16 shrink-0 border-slate-100 bg-white p-1"
                  />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      {item.productId === 'gestion-dechets' ? (
                        <WasteRecycleIcon size={14} className="shrink-0 text-green-500" />
                      ) : (
                        <Package size={14} className="shrink-0 text-slate-400" />
                      )}
                      <p className="flex items-center gap-1.5 truncate text-sm font-bold text-slate-900">
                        {item.productLabel}
                        {item.repere && (
                          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] italic text-slate-500">
                            {item.repere}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-0.5">
                      {editingItemId !== item.id && (
                        <button
                          onClick={() => onEdit && onEdit(item.id)}
                          className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-blue-50 hover:text-blue-600"
                          title="Modifier cet article"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => onDuplicate && onDuplicate(item.id)}
                        className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-green-50 hover:text-green-600"
                        title="Dupliquer cet article"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => onRemove(item.id)}
                        className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-red-50 hover:text-red-500"
                        title="Supprimer du panier"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <p className="ml-[22px] mt-0.5 text-xs text-slate-400">
                    {item.productId === 'gestion-dechets' ? (
                      <>
                        Surface : {item.totalSurface?.toFixed(2)} m2 · {calc.weight?.toFixed(0)} kg estime
                      </>
                    ) : item.productId === 'custom-product' ? (
                      <>
                        {item.customDescription && (
                          <span className="mb-0.5 block italic text-slate-500">
                            {item.customDescription}
                          </span>
                        )}
                        Prix sur mesure
                      </>
                    ) : (
                      <>
                        L {item.widthMm} x H {item.heightMm} mm
                        {item.isComposite && compositeCount > 0 && (
                          <span className="ml-1">
                            · {formatCompositeModules(item.composition || item.modules)}
                          </span>
                        )}
                        {item.colorOption?.id && item.colorOption.id !== 'blanc' && (
                          <span className="ml-1">· {item.colorOption.label}</span>
                        )}
                        {petitsBoisLabel && (
                          <span className="ml-1">· {petitsBoisLabel}</span>
                        )}
                        {item.includePose && <span className="ml-1">· Pose incluse</span>}
                        {item.glazingOption && !item.glazingOption.isBaseIncluded && (
                          <span className="ml-1 font-bold text-blue-600">
                            · {item.glazingOption.shortLabel}
                          </span>
                        )}
                        {item.thermalUw !== null && item.thermalUw !== undefined && (
                          <span className="ml-1 text-blue-500">
                            · Uw={item.thermalUw} · Sw={item.thermalSw}
                          </span>
                        )}
                      </>
                    )}
                    {item.remise > 0 && (
                      <span className="ml-1 font-bold text-orange-600">· -{item.remise}%</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 sm:h-8 sm:w-8"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center text-base font-bold text-slate-700 sm:text-sm">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 sm:h-8 sm:w-8"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div className="text-right">
                  <p className="text-sm font-black text-slate-900">
                    {(calc.totalLine + (item.includePose ? calc.posePrice * item.quantity : 0)).toFixed(2)} EUR
                  </p>
                  {item.includePose && (
                    <p className="mt-0.5 text-[10px] font-bold uppercase text-slate-400">
                      Dont pose {(calc.posePrice * item.quantity).toFixed(2)} EUR
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Taux de TVA
        </label>
        <div className="grid grid-cols-4 gap-1.5">
          {[0, 5.5, 10, 20].map((rate) => (
            <button
              key={rate}
              onClick={() => setTvaRate(rate)}
              className={`rounded-xl border py-3 text-base font-bold transition-all sm:rounded-lg sm:py-2 sm:text-xs ${
                tvaRate === rate
                  ? 'border-orange-500 bg-orange-500 text-white shadow-md'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-orange-200'
              }`}
            >
              {rate}%
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-slate-500">Total HT</span>
            <span className="font-bold text-slate-700">{totals.totalHT.toFixed(2)} EUR</span>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2 text-sm">
            <span className="font-medium text-slate-500">TVA ({tvaRate}%)</span>
            <span className="font-bold text-slate-700">{totals.tva.toFixed(2)} EUR</span>
          </div>
          <div className="flex items-end justify-between pt-2">
            <div>
              <span className="block text-xs font-bold uppercase leading-none text-slate-900">
                Total TTC
              </span>
              <span className="text-[9px] uppercase tracking-tighter text-slate-400">
                Net a payer
              </span>
            </div>
            <span className="text-xl font-black text-orange-500">
              {totals.totalTTC.toFixed(2)} EUR
            </span>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <button
          onClick={() => onNext && onNext()}
          className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-orange-500 px-6 py-4 text-base font-bold text-white shadow-xl shadow-orange-500/30 transition-all duration-200 hover:-translate-y-1 hover:bg-orange-600 active:translate-y-0 sm:rounded-full"
        >
          Suivant : Recapitulatif
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
