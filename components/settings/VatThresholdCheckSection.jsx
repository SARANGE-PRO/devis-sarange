'use client';

import { useSyncExternalStore } from 'react';
import { Percent } from 'lucide-react';
import {
  getVatThresholdCheckServerSnapshot,
  getVatThresholdCheckSnapshot,
  setVatThresholdCheckEnabled,
  subscribeToVatThresholdCheck,
} from '@/lib/vat-check-settings';

export default function VatThresholdCheckSection() {
  const enabled = useSyncExternalStore(
    subscribeToVatThresholdCheck,
    getVatThresholdCheckSnapshot,
    getVatThresholdCheckServerSnapshot
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-xl bg-sky-100 p-2 text-sky-600">
          <Percent size={18} />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-sky-600">
            Paramètres société
          </p>
          <h3 className="text-lg font-bold text-slate-900">TVA 5,5 % : contrôle des seuils</h3>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-slate-600">
        Quand ce contrôle est actif, une ligne saisie à 5,5 % dont les performances
        thermiques ne respectent pas l&apos;article 30-0 D bis de l&apos;annexe IV du CGI est
        <strong> automatiquement ramenée à 10 %</strong> : fenêtres Uw ≤ 1,3 et Sw ≥ 0,3 (ou
        Uw ≤ 1,7 et Sw ≥ 0,36), fenêtres de toit Uw ≤ 1,5 et Sw ≤ 0,36, portes Ud ≤ 1,7.
      </p>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-4">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setVatThresholdCheckEnabled(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-orange-500"
        />
        <span className="min-w-0">
          <span className="block text-sm font-bold text-slate-900">
            Corriger automatiquement le taux quand les seuils ne sont pas respectés
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-slate-500">
            {enabled
              ? 'Actif : un devis à 5,5 % non conforme passera à 10 % sans intervention.'
              : 'Désactivé (réglage par défaut) : le taux que vous saisissez est toujours respecté. Les indications Uw/Sw restent affichées, à vous d’en juger.'}
          </span>
        </span>
      </label>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Réglage propre à ce poste. Laissez-le désactivé tant que les valeurs thermiques de
        toutes vos gammes ne sont pas confirmées par les fournisseurs : une correction
        automatique fondée sur une donnée incertaine changerait le prix TTC d&apos;un devis
        sans que vous le voyiez.
      </p>
    </section>
  );
}
