'use client';

// Tarif de pose modifiable EN PLACE, sans champ supplémentaire dans le
// formulaire : le montant affiché à côté de « Inclure la pose » est une pastille
// cliquable. Un clic ouvre une saisie compacte ; Entrée ou la perte de focus
// valide, Échap annule. Vider le champ (ou saisir le tarif catalogue) revient au
// tarif catalogue. Quand un tarif spécifique est appliqué, la pastille passe en
// orange et un bouton discret permet de revenir au tarif catalogue.

import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';

import { normalizePosePriceOverride } from '@/lib/products';

const formatAmount = (value) =>
  new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);

export default function PosePriceEditor({
  value = null,
  defaultValue = 0,
  onChange,
  disabled = false,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  const override = normalizePosePriceOverride(value);
  const catalogue = Number.isFinite(Number(defaultValue)) ? Number(defaultValue) : 0;
  const effective = override ?? catalogue;
  const isCustom = override !== null && override !== catalogue;

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startEditing = () => {
    if (disabled) return;
    setDraft(String(effective));
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const next = normalizePosePriceOverride(draft);
    // Champ vidé, valeur invalide ou tarif catalogue ressaisi : plus de tarif
    // spécifique.
    onChange?.(next === null || next === catalogue ? null : next);
  };

  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          min={0}
          step={0.01}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              cancel();
            }
          }}
          aria-label="Tarif de pose HT par unité"
          className="w-24 rounded-lg border border-orange-300 bg-white px-2 py-1 text-right text-sm font-bold text-slate-800 outline-none ring-2 ring-orange-200"
        />
        <span className="text-sm font-bold text-slate-500">€</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={startEditing}
        disabled={disabled}
        title={
          isCustom
            ? `Tarif de pose spécifique à ce devis (catalogue : ${formatAmount(catalogue)} €). Cliquer pour modifier.`
            : 'Cliquer pour modifier le tarif de pose de cette ligne'
        }
        className={`rounded-lg border px-2 py-0.5 text-sm font-bold tabular-nums transition-colors disabled:cursor-default disabled:opacity-60 ${
          isCustom
            ? 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-orange-300 hover:text-orange-700'
        }`}
      >
        {formatAmount(effective)} €
      </button>
      {isCustom && !disabled && (
        <button
          type="button"
          onClick={() => onChange?.(null)}
          title={`Revenir au tarif catalogue (${formatAmount(catalogue)} €)`}
          aria-label="Revenir au tarif de pose catalogue"
          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-orange-600"
        >
          <RotateCcw size={12} />
        </button>
      )}
    </span>
  );
}
