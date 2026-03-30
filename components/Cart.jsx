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
import { calculateItemPrice } from '@/lib/products';
import MenuiserieVisual from '@/components/MenuiserieVisual';
import WasteRecycleIcon from '@/components/icons/WasteRecycleIcon';

export default function Cart({ items, tvaRate, setTvaRate, onRemove, onDuplicate, onEdit, onUpdateQuantity, onNext, editingItemId }) {
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShoppingCart size={28} className="text-slate-300" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-1">
          Panier vide
        </h3>
        <p className="text-sm text-slate-400">
          Ajoutez des produits depuis le catalogue à gauche
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart size={18} className="text-orange-500" />
          <h3 className="text-sm font-bold text-slate-900">
            Panier
          </h3>
          <span className="bg-orange-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
            {items.length}
          </span>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
        {items.map((item) => {
          const calc = calculateItemPrice(item);
          return (
            <div
              key={item.id}
              className={`rounded-xl border p-4 shadow-sm hover:shadow-md transition-all ${
                editingItemId === item.id 
                  ? 'bg-orange-50/50 border-orange-400 ring-4 ring-orange-500/10' 
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Visual Thumbnail */}
                {item.productId === 'gestion-dechets' ? (
                  <div className="w-16 h-16 shrink-0 bg-green-50 border border-green-100 rounded-xl flex items-center justify-center">
                    <WasteRecycleIcon size={28} className="text-green-600" />
                  </div>
                ) : item.productId === 'custom-product' ? (
                  <div className="w-16 h-16 shrink-0 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center overflow-hidden">
                    {item.customImage ? (
                      <img src={item.customImage} alt="" className="w-full h-full object-cover" />
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
                      colorOption: item.colorOption,
                      panneauDecoratif: item.panneauDecoratif,
                      hasSousBassement: item.hasSousBassement,
                      sousBassementHeight: item.sousBassementHeight,
                      sashOptions: item.sashOptions,
                      productId: item.productId
                    }}
                    className="w-16 h-16 shrink-0 bg-white border-slate-100 p-1"
                  />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      {item.productId === 'gestion-dechets' ? (
                        <WasteRecycleIcon size={14} className="text-green-500 shrink-0" />
                      ) : (
                        <Package size={14} className="text-slate-400 shrink-0" />
                      )}
                      <p className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                        {item.productLabel}
                        {item.repere && (
                          <span className="shrink-0 italic text-slate-500 text-[10px] bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                            {item.repere}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {editingItemId !== item.id && (
                        <button
                          onClick={() => onEdit && onEdit(item.id)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all shrink-0"
                          title="Modifier cet article"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => onDuplicate && onDuplicate(item.id)}
                        className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all shrink-0"
                        title="Dupliquer cet article"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => onRemove(item.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all shrink-0"
                        title="Supprimer du panier"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 ml-[22px]">
                    {item.productId === 'gestion-dechets' ? (
                      <>
                        Surface : {item.totalSurface?.toFixed(2)} m² • {calc.weight?.toFixed(0)} kg estimé
                      </>
                    ) : item.productId === 'custom-product' ? (
                      <>
                        {item.customDescription && (
                          <span className="block italic text-slate-500 mb-0.5">{item.customDescription}</span>
                        )}
                        Prix sur mesure
                      </>
                    ) : (
                      <>
                        L {item.widthMm} × H {item.heightMm} mm
                        {item.colorOption?.id && item.colorOption.id !== 'blanc' && (
                          <span className="ml-1">
                            • {item.colorOption.label}
                          </span>
                        )}
                        {item.petitsBois > 0 && (
                          <span className="ml-1">
                            • {item.petitsBois} petit(s) bois
                          </span>
                        )}
                        {item.includePose && (
                          <span className="ml-1">• Pose incluse</span>
                        )}
                        {item.glazingOption && !item.glazingOption.isBaseIncluded && (
                          <span className="ml-1 text-blue-600 font-bold">• {item.glazingOption.shortLabel}</span>
                        )}
                        {item.thermalUw !== null && item.thermalUw !== undefined && (
                          <span className="ml-1 text-blue-500">• Uw={item.thermalUw} • Sw={item.thermalSw}</span>
                        )}
                      </>
                    )}
                    {item.panneauDecoratif && (
                      <span className="ml-1 text-orange-600 font-bold">
                        • Panneau décoratif (+850€)
                      </span>
                    )}
                    {item.hasSousBassement && (
                      <span className="ml-1 text-slate-600 font-bold">
                        • Sous-bassement ({item.sousBassementHeight}mm)
                      </span>
                    )}
                    {item.sashOptions && Object.values(item.sashOptions).some(s => s.ob || s.vent) && (
                      <span className="ml-1 text-slate-600 font-bold">
                        • {Object.values(item.sashOptions).filter(s => s.ob).length} OB / {Object.values(item.sashOptions).filter(s => s.vent).length} Grille
                      </span>
                    )}
                    {item.remise > 0 && (
                      <span className="ml-1 font-bold text-orange-600">• -{item.remise}%</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                {/* Quantity Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))
                    }
                    className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors text-lg sm:text-base font-bold"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-base sm:text-sm font-bold text-slate-700 w-8 text-center">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                    className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors text-lg sm:text-base font-bold"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* Line Total */}
                <div className="text-right">
                  <p className="text-sm font-black text-slate-900">
                    {(calc.totalLine + (item.includePose ? calc.posePrice * item.quantity : 0)).toFixed(2)} €
                  </p>
                  {item.includePose && (
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                      Dont pose {(calc.posePrice * item.quantity).toFixed(2)} €
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* TVA Selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Taux de TVA
        </label>
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { value: 0, label: '0%' },
            { value: 5.5, label: '5.5%' },
            { value: 10, label: '10%' },
            { value: 20, label: '20%' }
          ].map((rate) => (
            <button
              key={rate.value}
              onClick={() => setTvaRate(rate.value)}
              className={`py-3 sm:py-2 rounded-xl sm:rounded-lg border text-base sm:text-xs font-bold transition-all ${
                tvaRate === rate.value
                  ? 'bg-orange-500 border-orange-500 text-white shadow-md'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-orange-200'
              }`}
            >
              {rate.label}
            </button>
          ))}
        </div>
        {tvaRate === 0 && (
          <div className="p-2.5 bg-orange-50 border border-orange-100 rounded-lg">
            <p className="text-[10px] text-orange-700 font-bold leading-tight italic">
              &quot;Autoliquidation de la TVA – Article 283-2 du CGI. TVA due par le preneur.&quot;
            </p>
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 font-medium">Total HT</span>
            <span className="font-bold text-slate-700">
              {totals.totalHT.toFixed(2)} €
            </span>
          </div>
          <div className="flex justify-between text-sm pb-2 border-b border-slate-100">
            <span className="text-slate-500 font-medium">TVA ({tvaRate}%)</span>
            <span className="font-bold text-slate-700">
              {totals.tva.toFixed(2)} €
            </span>
          </div>
          <div className="pt-2 flex justify-between items-end">
            <div>
              <span className="block text-xs font-bold text-slate-900 uppercase tracking-tight leading-none">Total TTC</span>
              <span className="text-[9px] text-slate-400 uppercase tracking-tighter">Nét à payer</span>
            </div>
            <span className="text-xl font-black text-orange-500">
              {totals.totalTTC.toFixed(2)} €
            </span>
          </div>
        </div>
      </div>

      {/* Next Step */}
      <div className="pt-2">
        <button
          onClick={() => onNext && onNext()}
          className="w-full inline-flex justify-center items-center gap-3 px-6 py-4 bg-orange-500 hover:bg-orange-600 text-white text-base font-bold rounded-2xl sm:rounded-full transition-all duration-200 shadow-xl shadow-orange-500/30 transform hover:-translate-y-1 active:translate-y-0"
        >
          Suivant : Récapitulatif
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
