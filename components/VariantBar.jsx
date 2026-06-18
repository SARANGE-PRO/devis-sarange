'use client';

import { useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { computeQuoteTotals } from '@/lib/quote-totals.mjs';

const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const variantLetter = (index) => String.fromCharCode(65 + index);

/**
 * Sélecteur de variantes de configuration (back-office).
 * - Mono-option : un simple bouton discret « Proposer des variantes ».
 * - Mode variantes : pills (lettre + nom + total TTC), renommer/supprimer/réordonner
 *   sur la variante active, et « + Ajouter une variante » (duplique l'active).
 */
export default function VariantBar({
  variantsMode,
  variants = [],
  activeVariantId,
  maxVariants = 4,
  onEnable,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onReorder,
}) {
  const [editingId, setEditingId] = useState(null);
  const [tempName, setTempName] = useState('');

  if (!variantsMode) {
    return (
      <div className="mb-4">
        <button
          type="button"
          onClick={onEnable}
          className="inline-flex items-center gap-2 rounded-full border border-dashed border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-500 transition hover:border-orange-300 hover:text-orange-600"
        >
          <Layers size={15} />
          Proposer des variantes
        </button>
      </div>
    );
  }

  const startRename = (variant) => {
    setEditingId(variant.id);
    setTempName(variant.name || '');
  };

  const commitRename = (id) => {
    onRename?.(id, tempName.trim());
    setEditingId(null);
  };

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2 px-1">
        <Layers size={14} className="text-orange-500" />
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
          Variantes de configuration
        </p>
      </div>

      <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
        {variants.map((variant, index) => {
          const totals = computeQuoteTotals(variant.cartItems, variant.tvaRate);
          const isActive = variant.id === activeVariantId;
          const isEditing = editingId === variant.id;
          const label = variant.name || `Variante ${variantLetter(index)}`;

          return (
            <div
              key={variant.id}
              className={`flex shrink-0 flex-col gap-1 rounded-xl border-2 p-2 transition ${
                isActive
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              {isEditing ? (
                <div className="flex items-center gap-1.5">
                  <input
                    value={tempName}
                    onChange={(event) => setTempName(event.target.value)}
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitRename(variant.id);
                      if (event.key === 'Escape') setEditingId(null);
                    }}
                    placeholder="Ex : Gris anthracite RAL 7016"
                    className="w-48 rounded-lg border border-orange-400 px-2 py-1 text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => commitRename(variant.id)}
                    className="rounded-md bg-orange-500 p-1 text-white hover:bg-orange-600"
                    aria-label="Valider le nom"
                  >
                    <Check size={13} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect?.(variant.id)}
                  className="flex min-w-[8rem] items-center justify-between gap-3 text-left"
                >
                  <span className="flex flex-col">
                    <span
                      className={`text-xs font-bold ${
                        isActive ? 'text-orange-700' : 'text-slate-700'
                      }`}
                    >
                      {variantLetter(index)} · {label}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">
                      {currencyFormatter.format(totals.totalTTC || 0)} TTC
                    </span>
                  </span>
                </button>
              )}

              {isActive && !isEditing && (
                <div className="flex items-center gap-1 border-t border-orange-100 pt-1">
                  <button
                    type="button"
                    onClick={() => onReorder?.(variant.id, -1)}
                    disabled={index === 0}
                    className="rounded p-1 text-slate-400 transition hover:bg-orange-100 hover:text-orange-600 disabled:opacity-30"
                    aria-label="Déplacer à gauche"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onReorder?.(variant.id, 1)}
                    disabled={index === variants.length - 1}
                    className="rounded p-1 text-slate-400 transition hover:bg-orange-100 hover:text-orange-600 disabled:opacity-30"
                    aria-label="Déplacer à droite"
                  >
                    <ChevronRight size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => startRename(variant)}
                    className="rounded p-1 text-slate-400 transition hover:bg-orange-100 hover:text-orange-600"
                    aria-label="Renommer"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete?.(variant.id)}
                    disabled={variants.length <= 1}
                    className="rounded p-1 text-slate-400 transition hover:bg-red-100 hover:text-red-600 disabled:opacity-30"
                    aria-label="Supprimer la variante"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {variants.length < maxVariants && (
          <button
            type="button"
            onClick={onAdd}
            className="flex shrink-0 items-center gap-1.5 self-stretch rounded-xl border-2 border-dashed border-slate-300 px-3 text-xs font-bold text-slate-500 transition hover:border-orange-300 hover:text-orange-600"
          >
            <Plus size={15} />
            Ajouter une variante
          </button>
        )}
      </div>

      <p className="mt-2 px-1 text-[11px] text-slate-400">
        « Ajouter » duplique la configuration courante : n&apos;ajustez ensuite que l&apos;option
        qui change (couleur, ouverture, vitrage, volet…).
      </p>
    </div>
  );
}
