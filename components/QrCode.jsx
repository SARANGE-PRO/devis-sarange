'use client';

import { useMemo } from 'react';

import { buildQrMatrix } from '@/lib/qr-code.mjs';

/**
 * Rendu SVG d'un QR code généré localement (lib/qr-code.mjs), sans service
 * externe. Fond blanc et zone de silence de 4 modules imposés par la spec :
 * le QR doit rester scannable quel que soit le fond de la page.
 */
export default function QrCode({ value, size = 176, className = '' }) {
  const matrix = useMemo(() => {
    if (!value) return null;
    try {
      return buildQrMatrix(value);
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix) return null;

  const moduleCount = matrix.length;
  const quietZone = 4;
  const total = moduleCount + quietZone * 2;

  let path = '';
  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (matrix[row][col]) {
        path += `M${col + quietZone} ${row + quietZone}h1v1h-1z`;
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="QR code"
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path d={path} fill="#0f172a" />
    </svg>
  );
}
