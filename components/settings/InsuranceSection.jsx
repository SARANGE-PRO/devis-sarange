'use client';

import { useState, useSyncExternalStore } from 'react';
import { AlertTriangle, Check, FileText, ShieldCheck } from 'lucide-react';
import { getInsuranceStatus, normalizeCompanyInsurance } from '@/lib/company-insurance.mjs';
import { loadCompanyInsurance, saveCompanyInsurance } from '@/lib/insurance-settings';

const INSURANCE_FIELDS = [
  { key: 'insurer', label: 'Assureur', type: 'text', placeholder: 'BPCE IARD' },
  { key: 'contractNumber', label: 'Numéro de contrat', type: 'text', placeholder: '194388251 R 002' },
  { key: 'activities', label: 'Activités couvertes', type: 'text', placeholder: 'Fabrication et pose de menuiseries extérieures' },
  { key: 'startDate', label: 'Début de validité', type: 'date' },
  { key: 'endDate', label: 'Fin de validité', type: 'date' },
  { key: 'attestationUrl', label: "Lien vers l'attestation (PDF)", type: 'url', placeholder: 'https://…' },
];

const subscribeNoop = () => () => {};
const useIsMounted = () =>
  useSyncExternalStore(subscribeNoop, () => true, () => false);

export default function InsuranceSection() {
  const isMounted = useIsMounted();
  // `draft` = modifications en cours ; tant qu'aucune édition n'a eu lieu, on
  // affiche la valeur stockée sur ce poste (défauts au rendu serveur).
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(false);
  const insurance =
    draft ?? (isMounted ? loadCompanyInsurance() : normalizeCompanyInsurance({}));

  const status = getInsuranceStatus(insurance);

  const handleChange = (key, value) => {
    setDraft({ ...insurance, [key]: value });
    setSaved(false);
  };

  const handleSave = () => {
    setDraft(saveCompanyInsurance(insurance));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const statusBadge = status.isExpired
    ? { label: `Expirée depuis le ${status.endDateLabel}`, className: 'bg-red-100 text-red-700' }
    : status.expiresSoon
      ? { label: `Expire le ${status.endDateLabel} (${status.daysLeft} j)`, className: 'bg-amber-100 text-amber-700' }
      : { label: `Valide jusqu'au ${status.endDateLabel}`, className: 'bg-emerald-100 text-emerald-700' };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-emerald-100 p-2 text-emerald-600">
            <ShieldCheck size={18} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-emerald-600">
              Paramètres société
            </p>
            <h3 className="text-lg font-bold text-slate-900">Assurance décennale</h3>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusBadge.className}`}>
          {statusBadge.label}
        </span>
      </div>

      <p className="mb-4 text-sm text-slate-500">
        Ces informations alimentent la carte « Garanties et assurances » et l&apos;article
        Garanties des CGV de chaque devis <strong>avec pose</strong>. Mettez à jour la
        période à chaque renouvellement : les devis déjà finalisés conservent leur version
        figée.
      </p>

      {(status.isExpired || status.expiresSoon) && (
        <div
          className={`mb-4 flex items-start gap-3 rounded-xl border-2 p-4 ${
            status.isExpired ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
          }`}
        >
          <AlertTriangle
            size={18}
            className={`mt-0.5 shrink-0 ${status.isExpired ? 'text-red-500' : 'text-amber-500'}`}
          />
          <p
            className={`text-sm font-semibold ${
              status.isExpired ? 'text-red-700' : 'text-amber-700'
            }`}
          >
            {status.isExpired
              ? "L'attestation décennale est EXPIRÉE : les nouveaux devis avec pose afficheront une période dépassée. Renouvelez le contrat puis mettez à jour les dates ci-dessous."
              : "L'attestation décennale expire bientôt : pensez à demander la nouvelle attestation à votre assureur puis à mettre à jour les dates ci-dessous."}
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {INSURANCE_FIELDS.map((field) => (
          <label key={field.key} className={field.key === 'activities' || field.key === 'attestationUrl' ? 'block md:col-span-2' : 'block'}>
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">
              {field.label}
            </span>
            <input
              type={field.type}
              value={insurance[field.key] || ''}
              placeholder={field.placeholder || ''}
              onChange={(event) => handleChange(field.key, event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:border-slate-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
            />
          </label>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-colors ${
            saved ? 'bg-emerald-500' : 'bg-slate-900 hover:bg-slate-800'
          }`}
        >
          {saved ? <Check size={15} /> : <ShieldCheck size={15} />}
          {saved ? 'Enregistré !' : 'Enregistrer'}
        </button>
        {insurance.attestationUrl && (
          <a
            href={insurance.attestationUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <FileText size={15} />
            Ouvrir l&apos;attestation
          </a>
        )}
        <span className="text-xs text-slate-400">
          Réglage enregistré sur ce poste (navigateur).
        </span>
      </div>
    </section>
  );
}

/**
 * Contrôle des seuils thermiques pour la TVA à 5,5 %.
 *
 * Désactivé par défaut : tant que toutes les valeurs Uw/Sw ne sont pas
 * confirmées fournisseur, mieux vaut que le taux saisi soit respecté et que la
 * vérification reste humaine, plutôt qu'un devis soit requalifié tout seul sur
 * une donnée incertaine.
 */
