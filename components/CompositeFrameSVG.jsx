'use client';

// Rendu SVG présentationnel d'un châssis composé « ossature » (modèle v2).
// Réutilisé par l'éditeur (avec interactions) ET par les aperçus du devis
// (lecture seule). Toute la géométrie vient de lib/composite-frame.mjs (mm).

import { useMemo } from 'react';
import {
  solveFrame,
  computeOpenings,
  listSegments,
} from '@/lib/composite-frame';
import { CompositeModule } from '@/components/CompositeSVG';

const COLORS = {
  frame: '#0f172a',
  segment: '#334155',
  segmentRemoved: '#cbd5e1',
  opening: '#ffffff',
  openingEmpty: '#f8fafc',
  openingFilled: '#eff6ff',
  openingConflict: '#fef2f2',
  selected: '#f97316',
  dim: '#64748b',
};

export default function CompositeFrameSVG({
  frame,
  mode = 'view', // 'structure' | 'chassis' | 'view'
  selectedSegmentId = null,
  selectedOpeningId = null,
  onSegmentClick = null,
  onOpeningClick = null,
  resolveChassisLabel = (id) => id,
  className = '',
}) {
  const geometry = useMemo(() => {
    if (!frame) return null;
    const solved = solveFrame(frame);
    if (!solved.ok) return { solved, openings: [], segments: [], error: solved.message };
    const opened = computeOpenings(frame, solved);
    const segments = listSegments(frame, solved);
    return { solved, openings: opened.openings, segments, error: null };
  }, [frame]);

  if (!frame) return null;

  const W = Math.max(1, frame.overallWidthMm);
  const H = Math.max(1, frame.overallHeightMm);
  const scale = Math.max(W, H) / 500;
  const frameStroke = Math.max(6, 10 * scale);
  const segStroke = Math.max(4, 7 * scale);
  const fontMm = Math.max(22, 26 * scale);
  const hit = Math.max(40, 28 * scale); // zone cliquable large (> trait visuel)
  const showDims = mode === 'structure';
  const padTop = showDims ? fontMm * 2.2 : 0;
  const padLeft = showDims ? fontMm * 3.4 : 0;

  if (geometry?.error) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm font-medium text-red-600 ${className}`}
      >
        {geometry.error}
      </div>
    );
  }

  const xs = (() => {
    const acc = [0];
    geometry.solved.cols.forEach((v) => acc.push(acc[acc.length - 1] + v));
    return acc;
  })();
  const ys = (() => {
    const acc = [0];
    geometry.solved.rows.forEach((v) => acc.push(acc[acc.length - 1] + v));
    return acc;
  })();

  const fmt = (mm) => `${Math.round(mm)}`;
  // En mode Châssis / aperçu : on n'affiche QUE les châssis (pas d'ossature ni de cadre noir).
  const editingStructure = mode === 'structure';
  // Volet roulant monobloc — rendu identique aux menuiseries simples : coffre
  // couleur menuiserie (blanc) + rainure + (solaire) panneau, et premières lames
  // du tablier descendues sur le haut des châssis. Affiché hors édition de structure.
  const showCoffre = Boolean(frame.voletMonobloc) && !editingStructure;
  const coffreMm = showCoffre ? Math.min(H * 0.06, 180) : 0;
  const apronMm = coffreMm > 0 ? Math.min(H * 0.16, coffreMm * 1.4) : 0;
  const coffreColor = '#FFFFFF';
  const slatMm = apronMm > 0 ? Math.max(apronMm / 6, 18) : 0;
  const apronLines = [];
  for (let ly = slatMm; ly < apronMm && slatMm > 0; ly += slatMm) apronLines.push(ly);

  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50/40 p-3 ${className}`}
    >
      <svg
        viewBox={`${-padLeft} ${-padTop - coffreMm} ${W + padLeft} ${H + padTop + coffreMm}`}
        className="h-full w-full max-h-full max-w-full object-contain"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Aperçu du châssis composé"
      >
        {coffreMm > 0 && (
          <g style={{ pointerEvents: 'none' }}>
            <rect x={0} y={-coffreMm} width={W} height={coffreMm} fill={coffreColor} stroke={COLORS.frame} strokeWidth={Math.max(1.5, scale * 1.5)} />
            <line x1={0} y1={-coffreMm * 0.4} x2={W} y2={-coffreMm * 0.4} stroke={COLORS.frame} strokeWidth={Math.max(0.8, scale * 0.8)} />
            {frame.voletMonoblocManoeuvre === 'solaire' && (
              <rect
                x={W - Math.min(W * 0.18, 60 * scale) - 12 * scale}
                y={-coffreMm + coffreMm * 0.3}
                width={Math.min(W * 0.18, 60 * scale)}
                height={coffreMm * 0.4}
                fill="#1f2937"
                stroke="#0f172a"
                strokeWidth={Math.max(1, scale)}
              />
            )}
          </g>
        )}
        {/* Ouvertures (fond + état) */}
        {geometry.openings.map((opening) => {
          const placement = frame.placements?.[opening.id];
          const isSelected = opening.id === selectedOpeningId;
          let fill = COLORS.openingEmpty;
          if (!opening.rectangular) fill = COLORS.openingConflict;
          else if (placement) fill = COLORS.openingFilled;
          const drawChassis = placement && (mode === 'chassis' || mode === 'view');
          return (
            <g key={opening.id}>
              {/* Fond + zone cliquable */}
              <rect
                x={opening.xMm}
                y={opening.yMm}
                width={opening.wMm}
                height={opening.hMm}
                fill={editingStructure ? fill : 'transparent'}
                onClick={
                  mode === 'chassis' && onOpeningClick ? () => onOpeningClick(opening) : undefined
                }
                style={mode === 'chassis' && onOpeningClick ? { cursor: 'pointer' } : undefined}
              />
              {/* Châssis réel dessiné dans l'ouverture (mode Châssis / aperçu) */}
              {drawChassis && (
                <g transform={`translate(${opening.xMm}, ${opening.yMm})`} style={{ pointerEvents: 'none' }}>
                  <CompositeModule
                    module={{
                      id: placement.id,
                      productId: placement.productId,
                      widthMm: opening.wMm,
                      heightMm: opening.hMm,
                      options: placement.options || {},
                    }}
                    frameColor={placement.options?.svgColor || '#FFFFFF'}
                  />
                </g>
              )}
              {/* Libellé du châssis dans les modes d'édition de structure */}
              {placement && !drawChassis && (
                <text
                  x={opening.xMm + opening.wMm / 2}
                  y={opening.yMm + opening.hMm / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={fontMm}
                  fill={COLORS.frame}
                  fontFamily="Inter, sans-serif"
                  fontWeight="600"
                  style={{ pointerEvents: 'none' }}
                >
                  {resolveChassisLabel(placement.productId)}
                </text>
              )}
              {/* Ouverture vide en mode Châssis : invite à cliquer */}
              {!placement && mode === 'chassis' && opening.rectangular && (
                <text
                  x={opening.xMm + opening.wMm / 2}
                  y={opening.yMm + opening.hMm / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={fontMm * 1.2}
                  fill={COLORS.dim}
                  fontFamily="Inter, sans-serif"
                  style={{ pointerEvents: 'none' }}
                >
                  + châssis
                </text>
              )}
              {/* Contour par-dessus : sélection (orange) ou zone vide (pointillés) */}
              <rect
                x={opening.xMm}
                y={opening.yMm}
                width={opening.wMm}
                height={opening.hMm}
                fill="none"
                stroke={
                  isSelected
                    ? COLORS.selected
                    : !placement
                      ? '#94a3b8'
                      : editingStructure
                        ? COLORS.segment
                        : 'none'
                }
                strokeWidth={isSelected ? segStroke * 1.6 : Math.max(1, segStroke * 0.6)}
                strokeDasharray={
                  !isSelected && !placement && opening.rectangular
                    ? `${segStroke * 2.5} ${segStroke * 2}`
                    : undefined
                }
                style={{ pointerEvents: 'none' }}
              />
            </g>
          );
        })}

        {/* Tablier monobloc : premières lames descendues sur le haut des châssis */}
        {apronMm > 0 && (
          <g style={{ pointerEvents: 'none' }}>
            <rect x={0} y={0} width={W} height={apronMm} fill={coffreColor} stroke={COLORS.frame} strokeWidth={Math.max(1, scale)} />
            {apronLines.map((ly) => (
              <line key={ly} x1={0} y1={ly} x2={W} y2={ly} stroke="#A8A8A8" strokeWidth={Math.max(0.8, scale * 0.8)} />
            ))}
            <line x1={0} y1={apronMm} x2={W} y2={apronMm} stroke={COLORS.frame} strokeWidth={Math.max(1, scale * 1.2)} />
          </g>
        )}

        {/* Dormant extérieur (uniquement en édition de structure) */}
        {editingStructure && (
          <rect
            x={0}
            y={0}
            width={W}
            height={H}
            fill="none"
            stroke={COLORS.frame}
            strokeWidth={frameStroke}
          />
        )}

        {/* Tronçons d'ossature (uniquement en édition de structure) */}
        {editingStructure &&
          geometry.segments.map((segment) => {
          const isSelected = segment.id === selectedSegmentId;
          const x2 = segment.kind === 'vertical' ? segment.xMm : segment.xMm + segment.lengthMm;
          const y2 = segment.kind === 'vertical' ? segment.yMm + segment.lengthMm : segment.yMm;
          return (
            <g key={segment.id}>
              {/* Trait visible : plein si actif, pointillé fin si supprimé. */}
              <line
                x1={segment.xMm}
                y1={segment.yMm}
                x2={x2}
                y2={y2}
                stroke={
                  isSelected
                    ? COLORS.selected
                    : segment.active
                      ? COLORS.segment
                      : COLORS.segmentRemoved
                }
                strokeWidth={isSelected ? segStroke * 1.5 : segStroke}
                strokeDasharray={segment.active ? undefined : `${segStroke * 2} ${segStroke * 2}`}
                style={{ pointerEvents: 'none' }}
              />
              {/* Zone cliquable large : supprimer (tronçon actif) ou rétablir (tronçon supprimé). */}
              {onSegmentClick && (
                <line
                  x1={segment.xMm}
                  y1={segment.yMm}
                  x2={x2}
                  y2={y2}
                  stroke="transparent"
                  strokeWidth={hit}
                  onClick={() => onSegmentClick(segment)}
                  style={{ cursor: 'pointer' }}
                />
              )}
            </g>
          );
        })}

        {/* Cotations (modes Dimensions / Entraxes) */}
        {showDims && (
          <g>
            {geometry.solved.cols.map((value, c) => (
              <text
                key={`cw-${c}`}
                x={(xs[c] + xs[c + 1]) / 2}
                y={-fontMm * 0.7}
                textAnchor="middle"
                fontSize={fontMm}
                fill={COLORS.dim}
                fontFamily="Inter, sans-serif"
                fontWeight={frame.columns[c]?.mode === 'fixed' ? '700' : '400'}
              >
                {fmt(value)}
                {frame.columns[c]?.mode === 'fixed' ? ' 🔒' : ''}
              </text>
            ))}
            {geometry.solved.rows.map((value, r) => (
              <text
                key={`rh-${r}`}
                x={-fontMm * 0.5}
                y={(ys[r] + ys[r + 1]) / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={fontMm}
                fill={COLORS.dim}
                fontFamily="Inter, sans-serif"
                fontWeight={frame.rows[r]?.mode === 'fixed' ? '700' : '400'}
              >
                {fmt(value)}
                {frame.rows[r]?.mode === 'fixed' ? ' 🔒' : ''}
              </text>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}
