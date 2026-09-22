'use client';

// Couleur du volet roulant monobloc intégré : une rangée de pastilles
// compacte sous le choix de la manœuvre, sur le modèle de l'app de métrage
// (« optionnel, si le volet diffère de la menuiserie »). « Ton menuiserie »
// par défaut : rien n'est ajouté à la désignation ni au dessin tant qu'une
// couleur propre n'est pas choisie.

import { getVoletMonoblocCouleurOptions } from '@/lib/volet-monobloc.mjs';

export default function VoletMonoblocCouleurPicker({ value = '', onChange, className = '' }) {
  const options = getVoletMonoblocCouleurOptions();
  const current = options.some((option) => option.id === value) ? value : '';

  return (
    <div className={`mt-3 flex flex-wrap items-center gap-2 ${className}`}>
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Couleur du volet
      </span>
      {options.map((option) => {
        const isActive = option.id === current;
        return (
          <button
            key={option.id || 'ton-menuiserie'}
            type="button"
            onClick={() => onChange?.(option.id)}
            title={option.id ? `Coffre et tablier ${option.label}` : 'Même couleur que la menuiserie'}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
              isActive
                ? 'border-orange-400 bg-orange-50 text-orange-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-full border border-slate-300"
              style={
                option.hex
                  ? { background: option.hex }
                  : {
                      background:
                        'linear-gradient(135deg, #ffffff 0 50%, #cbd5e1 50% 100%)',
                    }
              }
            />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
