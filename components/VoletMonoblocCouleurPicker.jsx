'use client';

// Couleur du volet roulant monobloc intégré : une rangée de pastilles
// compacte sous le choix de la manœuvre, sur le modèle de l'app de métrage
// (« optionnel, si le volet diffère de la menuiserie »). « Ton menuiserie »
// par défaut : rien n'est ajouté à la désignation ni au dessin tant qu'une
// couleur propre n'est pas choisie. « Autre » ouvre un champ libre (RAL,
// teinte spéciale…), repris tel quel dans la désignation.

import { useRef, useState } from 'react';

import {
  VOLET_MONOBLOC_COULEUR_MAX_LENGTH,
  getVoletMonoblocCouleurOptions,
  isPresetVoletMonoblocCouleur,
  normalizeVoletMonoblocCouleur,
} from '@/lib/volet-monobloc.mjs';

export default function VoletMonoblocCouleurPicker({ value = '', onChange, className = '' }) {
  const options = getVoletMonoblocCouleurOptions();
  const normalized = normalizeVoletMonoblocCouleur(value);
  const isCustomValue = Boolean(normalized) && !isPresetVoletMonoblocCouleur(normalized);
  // « Autre » reste ouvert tant qu'on n'a pas choisi une pastille, même si le
  // champ est encore vide (couleur en cours de saisie). Une valeur libre
  // déjà enregistrée (article en édition) l'ouvre d'elle-même.
  const [customModeRequested, setCustomMode] = useState(false);
  const customMode = customModeRequested || isCustomValue;
  const inputRef = useRef(null);

  const isPillActive = (optionId) => !customMode && optionId === normalized;

  const pillClass = (active) =>
    `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
      active
        ? 'border-orange-400 bg-orange-50 text-orange-700'
        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
    }`;

  return (
    <div className={`mt-3 flex flex-wrap items-center gap-2 ${className}`}>
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Couleur du volet
      </span>
      {options.map((option) => (
        <button
          key={option.id || 'ton-menuiserie'}
          type="button"
          onClick={() => {
            setCustomMode(false);
            onChange?.(option.id);
          }}
          title={option.id ? `Coffre et tablier ${option.label}` : 'Même couleur que la menuiserie'}
          className={pillClass(isPillActive(option.id))}
        >
          <span
            aria-hidden="true"
            className="h-3 w-3 shrink-0 rounded-full border border-slate-300"
            style={
              option.hex
                ? { background: option.hex }
                : { background: 'linear-gradient(135deg, #ffffff 0 50%, #cbd5e1 50% 100%)' }
            }
          />
          {option.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          setCustomMode(true);
          // Une couleur de la liste n'est pas une saisie libre : on repart vide.
          if (isPresetVoletMonoblocCouleur(normalized)) onChange?.('');
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        title="Saisir une autre couleur (RAL, teinte spéciale…)"
        className={pillClass(customMode)}
      >
        Autre
      </button>
      {customMode && (
        <input
          ref={inputRef}
          type="text"
          value={isCustomValue ? normalized : ''}
          onChange={(event) => onChange?.(normalizeVoletMonoblocCouleur(event.target.value))}
          maxLength={VOLET_MONOBLOC_COULEUR_MAX_LENGTH}
          placeholder="Ex. RAL 5003, bleu nuit"
          aria-label="Autre couleur du volet"
          className="w-44 rounded-lg border border-orange-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 outline-none ring-2 ring-orange-200"
        />
      )}
    </div>
  );
}
