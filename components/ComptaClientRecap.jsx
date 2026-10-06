'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { getClientFullName } from '@/lib/client-cloud';
import { formatSiret, isProfessionalClient } from '@/lib/client-type.mjs';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/** Lignes à recopier dans la fiche client Sage, dans l'ordre de saisie Sage. */
const buildRecapRows = (clientData = {}) => {
  const data = clientData || {};
  const isPro = isProfessionalClient(data.clientType);
  const fullName = clean(getClientFullName(data));
  const rows = [
    { key: 'nom', label: isPro ? 'Raison sociale' : 'Nom', value: fullName },
    { key: 'adresse', label: 'Adresse', value: clean(data.adresse) },
    { key: 'cp', label: 'Code postal', value: clean(data.codePostal) },
    { key: 'ville', label: 'Ville', value: clean(data.ville) },
    { key: 'email', label: 'E-mail', value: clean(data.email).toLowerCase() },
    { key: 'tel', label: 'Téléphone', value: clean(data.telephone) },
  ];

  if (isPro) {
    rows.push(
      { key: 'siret', label: 'SIRET', value: formatSiret(data.siret) },
      { key: 'tva', label: 'N° TVA intracom.', value: clean(data.tvaIntra).toUpperCase().replace(/\s+/g, '') }
    );
  }

  if (data.memeAdresseChantier === false) {
    const siteName = data.nomChantierDifferent
      ? clean([data.prenomChantier, data.nomChantier].filter(Boolean).join(' '))
      : '';
    if (siteName) rows.push({ key: 'nomChantier', label: 'Chantier · nom', value: siteName, site: true });
    rows.push(
      { key: 'adresseChantier', label: 'Chantier · adresse', value: clean(data.adresseChantier), site: true },
      { key: 'cpChantier', label: 'Chantier · code postal', value: clean(data.codePostalChantier), site: true },
      { key: 'villeChantier', label: 'Chantier · ville', value: clean(data.villeChantier), site: true }
    );
  }

  return { rows: rows.filter((row) => row.value), isPro };
};

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      window.prompt('Copie impossible automatiquement, sélectionne le texte :', value);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copier ${label}`}
      aria-label={`Copier ${label}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
        copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-orange-100 hover:text-orange-700'
      }`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copié' : 'Copier'}
    </button>
  );
}

/**
 * Récap client à recopier dans Sage (fiche client) : chaque information a son
 * bouton Copier, plus « Tout copier » pour coller le bloc complet.
 */
export default function ComptaClientRecap({ clientData }) {
  const { rows, isPro } = buildRecapRows(clientData);
  if (!rows.length) return null;

  const everything = rows.map((row) => `${row.label} : ${row.value}`).join('\n');
  const mainRows = rows.filter((row) => !row.site);
  const siteRows = rows.filter((row) => row.site);

  const renderRow = (row) => (
    <div key={row.key} className="flex items-center gap-3 px-5 py-2">
      <span className="w-32 shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-400">{row.label}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900" title={row.value}>
        {row.value}
      </span>
      <CopyButton value={row.value} label={row.label.toLowerCase()} />
    </div>
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">Fiche client Sage</p>
          <p className="text-xs text-slate-500">{isPro ? 'Professionnel' : 'Particulier'} · à recopier dans Sage</p>
        </div>
        <CopyButton value={everything} label="toute la fiche" />
      </div>
      <div className="divide-y divide-slate-50 py-1">{mainRows.map(renderRow)}</div>
      {siteRows.length > 0 && (
        <>
          <div className="border-t border-slate-100 bg-amber-50 px-5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
            Adresse de chantier différente
          </div>
          <div className="divide-y divide-slate-50 py-1">{siteRows.map(renderRow)}</div>
        </>
      )}
    </div>
  );
}
