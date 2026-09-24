'use client';

import { useState } from 'react';
import { Check, ClipboardCheck, Copy, ExternalLink, Link2 } from 'lucide-react';
import QrCode from '@/components/QrCode';
import { PUBLIC_BASE_URL } from '@/lib/public-base-url.mjs';

// Lien FIXE (pas un token par session) : donné une fois aux poseurs, à
// utiliser quand le bon (fin de chantier, livraison ou enlèvement) n'a pas pu
// être préparé à l'avance depuis une fiche devis. Le client choisit la
// prestation à la première étape. Voir components/GenericCompletionPage.jsx.
export default function GenericCompletionLinkSection() {
  const [copied, setCopied] = useState(false);
  const fullUrl = `${PUBLIC_BASE_URL}/reception-generale`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copiez ce lien :', fullUrl);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-xl bg-orange-100 p-2 text-orange-600">
          <ClipboardCheck size={18} />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-orange-500">
            Bon de fin de chantier, de livraison ou d&apos;enlèvement
          </p>
          <h3 className="text-lg font-bold text-slate-900">Version générale (sans devis lié)</h3>
        </div>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        À utiliser quand le bon n&apos;a pas pu être préparé à l&apos;avance depuis une fiche devis : le client
        choisit d&apos;abord la prestation (pose, livraison ou enlèvement) puis saisit lui-même ses coordonnées.
        Un seul lien pour les trois cas, fixe (pas un lien à usage unique) : donnez-le une fois à vos poseurs
        pour qu&apos;ils l&apos;utilisent directement en fin d&apos;intervention ou de remise.
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Link2 size={14} className="shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-500">{fullUrl}</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <a
              href={fullUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800"
            >
              <ExternalLink size={15} />
              Ouvrir
            </a>
            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                copied ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Copié !' : 'Copier le lien'}
            </button>
          </div>
        </div>

        {/* QR code du lien fixe : à imprimer/enregistrer pour que le poseur le
            fasse simplement scanner au client en fin d'intervention. Généré
            localement (lib/qr-code.mjs) : aucun service externe, donc aucun
            risque de blocage réseau ou de pistage de l'URL. */}
        <div className="flex shrink-0 flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <QrCode value={fullUrl} size={140} className="rounded-lg" />
          <p className="max-w-[150px] text-center text-[11px] leading-tight text-slate-400">
            À faire scanner par le client (clic droit pour enregistrer / imprimer)
          </p>
        </div>
      </div>
    </section>
  );
}
