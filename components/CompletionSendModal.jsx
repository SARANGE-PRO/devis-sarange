'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, Receipt, X } from 'lucide-react';
import { useFirebaseAuth } from './FirebaseProvider';
import { getQuoteDisplayStatus } from '@/lib/quote-signature';

const currencyFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

const parseAmount = (value) => {
  const n = parseFloat(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Écran d'envoi du bon de fin de chantier depuis /devis. L'app ne suivant pas
 * les acomptes (comptabilité externe), on fait saisir l'acompte reçu et le
 * solde se recalcule automatiquement — mais reste un texte librement
 * modifiable, jamais un simple affichage figé (voir mémoire produit :
 * toujours une relecture humaine avant l'envoi d'un montant à un tiers).
 */
export default function CompletionSendModal({ quote, onClose, onSent }) {
  const { user } = useFirebaseAuth();
  const [acompte, setAcompte] = useState('');
  const [soldeOverride, setSoldeOverride] = useState(null);
  const [invoiceReference, setInvoiceReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const totalTTC = Number(quote?.totalTTC) || 0;
  const isDigitallySigned = getQuoteDisplayStatus(quote) === 'signed';
  const computedSolde = Math.max(0, totalTTC - parseAmount(acompte));
  const soldeValue = soldeOverride !== null ? soldeOverride : computedSolde.toFixed(2).replace('.', ',');

  const handleAcompteChange = (value) => {
    setAcompte(value);
    setSoldeOverride(null);
  };

  const handleSubmit = async () => {
    if (!invoiceReference.trim()) {
      setError('La référence facture est obligatoire.');
      return;
    }
    if (!user) {
      setError('Session expirée, reconnectez-vous.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/completion-certificates/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          quoteId: quote.id,
          acompteRecu: parseAmount(acompte),
          invoiceReference: invoiceReference.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Impossible d'envoyer le bon de fin de chantier.");
      }
      onSent?.(data);
      onClose?.();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-orange-100 p-2 text-orange-600">
              <Receipt size={18} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-orange-500">Bon de fin de chantier</p>
              <h3 className="text-base font-bold text-slate-900">Envoyer au client</h3>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {!isDigitallySigned && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Ce devis n&apos;est pas marqué comme signé numériquement. Vérifiez qu&apos;il a bien été signé (sur
              papier ou autrement) avant d&apos;envoyer ce bon.
            </span>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm">
          <span className="text-slate-500">Total devis TTC</span>
          <span className="font-bold text-slate-900">{currencyFormatter.format(totalTTC)}</span>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Acompte reçu</span>
          <input
            type="text"
            inputMode="decimal"
            value={acompte}
            onChange={(event) => handleAcompteChange(event.target.value)}
            placeholder="0,00"
            className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
          />
          <span className="mt-1 block text-[11px] text-slate-400">
            L&apos;app ne suit pas les acomptes (comptabilité externe) : renseignez ce qui a déjà été reçu pour ce
            devis.
          </span>
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
            Solde à réclamer sur ce bon
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={soldeValue}
            onChange={(event) => setSoldeOverride(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm font-bold outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
          />
          <span className="mt-1 block text-[11px] text-slate-400">
            Calculé automatiquement (total − acompte), mais reste modifiable directement en cas d&apos;avenant ou de
            règlement partiel non saisi ci-dessus.
          </span>
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
            Référence facture
          </span>
          <input
            type="text"
            value={invoiceReference}
            onChange={(event) => setInvoiceReference(event.target.value)}
            placeholder="FA-2026-0458"
            className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
          />
          <span className="mt-1 block text-[11px] text-slate-400">
            Saisie manuellement : la référence de la facture émise dans votre compta, pas un numéro généré
            automatiquement.
          </span>
        </label>

        {error && <p className="mt-3 text-xs font-semibold text-rose-600">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3.5 text-sm font-bold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
        >
          {submitting && <Loader2 size={15} className="animate-spin" />}
          Envoyer au client
        </button>
      </div>
    </div>
  );
}
