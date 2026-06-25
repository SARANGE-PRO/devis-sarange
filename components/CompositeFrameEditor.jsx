'use client';

// Éditeur de châssis composé « ossature » (modèle v2). Contrôlé : reçoit `frame`
// et remonte chaque modification via `onChange`. Toute la géométrie/règles vient
// de lib/composite-frame.mjs (fonctions pures). 2 modes : Structure (dimensions +
// colonnes/lignes + suppression d'un tronçon au clic) et Châssis. Undo/redo + clavier.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Unlock, Plus, Trash2, Undo2, Redo2, AlertTriangle } from 'lucide-react';
import CompositeFrameSVG from '@/components/CompositeFrameSVG';
import {
  solveFrame,
  computeOpenings,
  refreshBandValues,
  setBandValue,
  setBandMode,
  addEntraxe,
  removeEntraxe,
  toggleSegment,
  placeChassis,
  clearPlacement,
} from '@/lib/composite-frame';

const MODES = [
  { id: 'structure', label: '1 · Structure' },
  { id: 'chassis', label: '2 · Châssis' },
];

export default function CompositeFrameEditor({
  frame,
  onChange,
  chassisCatalog = [],
  resolveChassisLabel = (id) => id,
  onSelectedOpeningChange = null,
}) {
  const [mode, setMode] = useState('structure');
  const [selectedOpeningId, setSelectedOpeningId] = useState(null);
  const [error, setError] = useState('');

  const history = useRef({ stack: [frame], index: 0 });

  const commit = (nextFrame) => {
    setError('');
    const h = history.current;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(nextFrame);
    h.index = h.stack.length - 1;
    onChange(nextFrame);
  };
  const undo = () => {
    const h = history.current;
    if (h.index > 0) {
      h.index -= 1;
      onChange(h.stack[h.index]);
    }
  };
  const redo = () => {
    const h = history.current;
    if (h.index < h.stack.length - 1) {
      h.index += 1;
      onChange(h.stack[h.index]);
    }
  };

  const solved = useMemo(() => solveFrame(frame), [frame]);
  const openingsResult = useMemo(
    () => (solved.ok ? computeOpenings(frame, solved) : { openings: [] }),
    [frame, solved]
  );
  const openings = openingsResult.openings;
  const openingIds = useMemo(() => new Set(openings.map((o) => o.id)), [openings]);
  const conflicts = useMemo(
    () =>
      Object.values(frame.placements || {}).filter(
        (placement) => !openingIds.has(placement.openingId)
      ),
    [frame.placements, openingIds]
  );
  const selectedOpening = openings.find((o) => o.id === selectedOpeningId) || null;

  // En mode Châssis, présélectionner automatiquement une ouverture pour que le
  // sélecteur de châssis soit visible immédiatement (sans deviner où cliquer).
  useEffect(() => {
    if (mode !== 'chassis') return;
    if (selectedOpeningId && openingIds.has(selectedOpeningId)) return;
    const first = openings.find((opening) => opening.rectangular);
    if (first) setSelectedOpeningId(first.id);
  }, [mode, selectedOpeningId, openings, openingIds]);

  // --- Clavier : Ctrl+Z / Ctrl+Y, Suppr, Échap --------------------------
  useEffect(() => {
    const onKey = (event) => {
      const target = event.target;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if (event.key === 'Escape') {
        setSelectedOpeningId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // --- Handlers dimensions / entraxes -----------------------------------
  const setOverall = (axis, raw) => {
    const value = parseInt(raw, 10);
    if (!Number.isFinite(value) || value <= 0) return;
    commit(
      refreshBandValues({
        ...frame,
        [axis === 'columns' ? 'overallWidthMm' : 'overallHeightMm']: value,
      })
    );
  };

  const onBandValue = (axis, bandId, raw) => {
    const value = parseInt(raw, 10);
    if (!Number.isFinite(value)) return;
    commit(setBandValue(frame, axis, bandId, value));
  };
  const toggleBandLock = (axis, band) => {
    commit(setBandMode(frame, axis, band.id, band.mode === 'fixed' ? 'auto' : 'fixed'));
  };
  const splitBand = (axis, bandId) => commit(addEntraxe(frame, axis, bandId));
  const deleteBand = (axis, bandId) => commit(removeEntraxe(frame, axis, bandId));

  // --- Ossature : suppression/restauration avec garde rectangulaire -----
  const attemptToggleSegment = (segmentId) => {
    const next = toggleSegment(frame, segmentId);
    const result = computeOpenings(next);
    if (result.openings.some((o) => !o.rectangular)) {
      setError('Cette suppression créerait une ouverture non rectangulaire (en L). Action refusée.');
      return;
    }
    commit(next);
  };

  // --- Châssis : placement / retrait ------------------------------------
  const assign = (opening, productId) => {
    if (!productId) return;
    commit(placeChassis(frame, opening.id, opening, { productId }));
  };
  const unassign = (opening) => commit(clearPlacement(frame, opening.id));
  const removeConflict = (placement) => commit(clearPlacement(frame, placement.openingId));

  // Signale au parent l'ouverture sélectionnée (pour piloter le formulaire de config).
  const onSelectRef = useRef(onSelectedOpeningChange);
  onSelectRef.current = onSelectedOpeningChange;
  useEffect(() => {
    onSelectRef.current?.(selectedOpeningId);
  }, [selectedOpeningId]);

  const bandRow = (axis, band, index, list) => (
    <div key={band.id} className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs font-semibold text-slate-400">
        {axis === 'columns' ? `Col ${index + 1}` : `Lig ${index + 1}`}
      </span>
      <input
        type="number"
        min={1}
        value={band.value}
        onChange={(event) => onBandValue(axis, band.id, event.target.value)}
        className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
      />
      <button
        type="button"
        title={band.mode === 'fixed' ? 'Verrouillé (fixe) — cliquer pour automatique' : 'Automatique — cliquer pour fixer'}
        onClick={() => toggleBandLock(axis, band)}
        className={`rounded-lg p-1.5 transition-colors ${
          band.mode === 'fixed' ? 'text-orange-600 hover:bg-orange-50' : 'text-slate-400 hover:bg-slate-100'
        }`}
      >
        {band.mode === 'fixed' ? <Lock size={15} /> : <Unlock size={15} />}
      </button>
      <button
        type="button"
        title="Diviser cette zone (ajouter un entraxe)"
        onClick={() => splitBand(axis, band.id)}
        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-orange-600"
      >
        <Plus size={15} />
      </button>
      {list.length > 1 && (
        <button
          type="button"
          title="Supprimer cette zone (fusionner)"
          onClick={() => deleteBand(axis, band.id)}
          className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50"
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* ----- Zone de dessin ----- */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                  mode === m.id
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={undo} title="Annuler (Ctrl+Z)" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
              <Undo2 size={16} />
            </button>
            <button type="button" onClick={redo} title="Rétablir (Ctrl+Y)" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
              <Redo2 size={16} />
            </button>
          </div>
        </div>

        <CompositeFrameSVG
          frame={frame}
          mode={mode}
          selectedOpeningId={selectedOpeningId}
          onSegmentClick={
            mode === 'structure' ? (segment) => attemptToggleSegment(segment.id) : null
          }
          onOpeningClick={
            mode === 'chassis'
              ? (opening) => {
                  if (opening.rectangular) setSelectedOpeningId(opening.id);
                }
              : null
          }
          resolveChassisLabel={resolveChassisLabel}
          className="h-[420px]"
        />

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
            <AlertTriangle size={16} /> {error}
          </div>
        )}
        {!solved.ok && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
            <AlertTriangle size={16} /> {solved.message}
          </div>
        )}
      </div>

      {/* ----- Panneau de propriétés ----- */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
        {mode === 'structure' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Largeur (mm)</span>
                <input
                  type="number"
                  min={1}
                  value={frame.overallWidthMm}
                  onChange={(event) => setOverall('columns', event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Hauteur (mm)</span>
                <input
                  type="number"
                  min={1}
                  value={frame.overallHeightMm}
                  onChange={(event) => setOverall('rows', event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">Largeurs (colonnes)</p>
                <div className="space-y-1.5">
                  {frame.columns.map((band, i) => bandRow('columns', band, i, frame.columns))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">Hauteurs (lignes)</p>
                <div className="space-y-1.5">
                  {frame.rows.map((band, i) => bandRow('rows', band, i, frame.rows))}
                </div>
              </div>
            </div>

            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
              <strong className="text-slate-600">Astuce :</strong> le bouton + divise une zone (ajoute une
              colonne / ligne), le verrou fixe une dimension. Cliquez un montant ou une traverse
              <strong> dans le dessin</strong> pour le supprimer ; recliquez le tracé en pointillés pour le rétablir.
            </p>
          </>
        )}

        {mode === 'chassis' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Cliquez une ouverture puis choisissez un châssis. Ses dimensions sont
              héritées de l’ouverture.
            </p>
            {selectedOpening ? (
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-orange-700">
                  Ouverture {selectedOpening.wMm} × {selectedOpening.hMm} mm
                </p>
                <select
                  value={frame.placements[selectedOpening.id]?.productId || ''}
                  onChange={(event) => assign(selectedOpening, event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">— Choisir un châssis —</option>
                  {chassisCatalog.map((group) => (
                    <optgroup key={group.category} label={group.category}>
                      {group.items.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {frame.placements[selectedOpening.id] && (
                  <div className="mt-3 space-y-2 border-t border-orange-100 pt-3">
                    <p className="text-xs text-slate-500">
                      Reglez les options de ce chassis (coloration, vitrage, petits bois…)
                      dans le panneau de configuration, comme une menuiserie simple.
                    </p>
                    <button
                      type="button"
                      onClick={() => unassign(selectedOpening)}
                      className="w-full rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      Retirer le chassis
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400">Aucune ouverture sélectionnée.</p>
            )}
            <p className="text-xs text-slate-500">
              {openings.length} ouverture(s) · {Object.keys(frame.placements || {}).filter((id) => openingIds.has(id)).length} équipée(s)
            </p>
          </div>
        )}

        {conflicts.length > 0 && (
          <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-red-700">
              <AlertTriangle size={14} /> {conflicts.length} châssis en conflit
            </p>
            <p className="text-xs text-red-600">
              L’ouverture a changé. Réaffectez ou retirez ces châssis (jamais supprimés automatiquement).
            </p>
            {conflicts.map((placement) => (
              <div key={placement.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700">{resolveChassisLabel(placement.productId)}</span>
                <button
                  type="button"
                  onClick={() => removeConflict(placement)}
                  className="rounded px-2 py-1 font-semibold text-red-600 hover:bg-red-100"
                >
                  Retirer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
