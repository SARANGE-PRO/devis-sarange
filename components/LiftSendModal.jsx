'use client';

import { useState } from 'react';
import { Link2, Loader2, Mail, Sparkles, X } from 'lucide-react';

import CreatedLinkPanel from './CreatedLinkPanel';
import { useFirebaseAuth } from './FirebaseProvider';

const currencyFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

const parseAmount = (value) => {
  const n = parseFloat(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Écran d'envoi du PV de levée des réserves depuis /devis, sur le même modèle
 * que CompletionSendModal : l'app ne sait pas ce qui a réellement été réglé
 * depuis la réception, donc le montant réclamé à la levée (la retenue de 5 %
 * en général) est pré-rempli mais reste ENTIÈREMENT à la main de
 * l'utilisateur — mettre 0 si tout est déjà soldé. Deux modes de remise :
 * e-mail ou lien à copier (avec QR), comme pour le bon.
 */
export default function LiftSendModal({ quote, onClose, onSent }) {
  const { user } = useFirebaseAuth();
  const workflow = quote?.completionWorkflow || {};

  const [amount, setAmount] = useState(() => {
    const retenue = Number(workflow.retenueGarantie) || 0;
    return retenue > 0 ? retenue.toFixed(2).replace('.', ',') : '';
  });
  const [paymentReference, setPaymentReference] = useState(workflow.invoiceReference || '');
  const [email, setEmail] = useState(
    workflow.clientEmail || quote?.clientEmail || quote?.payload?.clientData?.email || ''
  );
  const [submittingMode, setSubmittingMode] = useState(null);
  const [error, setError] = useState('');
  const [missingField, setMissingField] = useState('');
  const [createdLink, setCreatedLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const amountDue = parseAmount(amount);

  const copyLink = async (link) => {
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      window.prompt('Copiez ce lien :', link);
    }
  };

  const handleSubmit = async (deliveryMode) => {
    if (amountDue > 0 && !paymentReference.trim()) {
      setError('Indiquez la référence facture : elle figurera en libellé du virement demandé.');
      setMissingField('paymentReference');
      return;
    }
    if (deliveryMode === 'email' && !email.trim()) {
      setError('Renseignez une adresse e-mail, ou utilisez « Créer le lien et le copier ».');
      setMissingField('email');
      return;
    }
    if (!user) {
      setError('Session expirée, reconnectez-vous.');
      return;
    }
    setSubmittingMode(deliveryMode);
    setError('');
    setMissingField('');
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/completion-certificates/lift/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          quoteId: quote.id,
          amountDue,
          paymentReference: paymentReference.trim(),
          deliveryMode,
          overrideEmail: email.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Impossible d'envoyer le PV de levée des réserves.");
      }
      if (deliveryMode === 'link') {
        setCreatedLink(data.signingUrl || '');
        await copyLink(data.signingUrl || '');
        onSent?.(data);
      } else {
        onSent?.(data);
        onClose?.();
      }
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmittingMode(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-orange-100 p-2 text-orange-600">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-orange-500">
                Levée des réserves
              </p>
              <h3 className="text-base font-bold text-slate-900">
                Envoyer le PV{workflow.completionNumber ? ` (bon n°${workflow.completionNumber})` : ''}
              </h3>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {createdLink ? (
          <CreatedLinkPanel
            link={createdLink}
            copied={linkCopied}
            onCopy={() => copyLink(createdLink)}
            onClose={onClose}
          />
        ) : (
          <>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Solde réclamé à la levée
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0,00"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm font-bold outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
              />
              <span className="mt-1 block text-[11px] text-slate-400">
                Pré-rempli avec la retenue de garantie appliquée à la réception
                {Number(workflow.retenueGarantie) > 0
                  ? ` (${currencyFormatter.format(Number(workflow.retenueGarantie))})`
                  : ''}
                . Vérifiez ce qui a réellement été réglé depuis : mettez 0 si tout est déjà soldé.
              </span>
            </label>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Référence facture
              </span>
              <input
                type="text"
                value={paymentReference}
                onChange={(event) => {
                  setPaymentReference(event.target.value);
                  if (missingField === 'paymentReference') setMissingField('');
                }}
                placeholder="FA-2026-0458"
                className={`w-full rounded-xl border px-3.5 py-3 text-sm outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 ${
                  missingField === 'paymentReference'
                    ? 'border-amber-400 ring-4 ring-amber-500/10'
                    : 'border-slate-300'
                }`}
              />
              <span className="mt-1 block text-[11px] text-slate-400">
                Celle du bon d&apos;origine est reprise ; le client la mettra en libellé de son virement.
              </span>
            </label>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                E-mail du client
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (missingField === 'email') setMissingField('');
                }}
                placeholder="client@exemple.fr"
                className={`w-full rounded-xl border px-3.5 py-3 text-sm outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 ${
                  missingField === 'email' ? 'border-amber-400 ring-4 ring-amber-500/10' : 'border-slate-300'
                }`}
              />
              <span className="mt-1 block text-[11px] text-slate-400">
                Pré-rempli depuis le bon d&apos;origine, modifiable. Inutile si vous créez simplement un lien à
                copier.
              </span>
            </label>

            {error && <p className="mt-3 text-xs font-semibold text-rose-600">{error}</p>}

            <button
              type="button"
              onClick={() => handleSubmit('email')}
              disabled={submittingMode !== null}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3.5 text-sm font-bold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
            >
              {submittingMode === 'email' ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
              Envoyer par e-mail
            </button>
            <button
              type="button"
              onClick={() => handleSubmit('link')}
              disabled={submittingMode !== null}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {submittingMode === 'link' ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
              Créer le lien et le copier
            </button>
          </>
        )}
      </div>
    </div>
  );
}
