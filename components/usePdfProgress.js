'use client';

import { useSyncExternalStore } from 'react';
import { getPdfProgress, subscribePdfProgress } from '@/lib/pdf-progress.mjs';

const SERVER_SNAPSHOT = { active: false, value: 0 };
const getServerSnapshot = () => SERVER_SNAPSHOT;

/**
 * Avancement (0..1) de la génération de PDF en cours, ou null si aucune
 * génération n'est en cours (le loader affiche alors une barre indéterminée).
 */
export default function usePdfProgress() {
  const progress = useSyncExternalStore(subscribePdfProgress, getPdfProgress, getServerSnapshot);
  return progress.active ? progress.value : null;
}
