'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Link2, Loader2, Mail, Package, Receipt, Truck, X } from 'lucide-react';
import CreatedLinkPanel from './CreatedLinkPanel';
import { useFirebaseAuth } from './FirebaseProvider';
import { getQuoteDisplayStatus } from '@/lib/quote-signature';
import { CONTRACT_TYPES, resolveContractType } from '@/lib/line-nature.mjs';

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
 *
 * Deux modes de remise du lien de signature :
 *  - envoi par e-mail (adresse pré-remplie depuis le devis, modifiable) ;
 *  - création du lien SEUL, copié dans le presse-papier, à transmettre
 *    soi-même (SMS, WhatsApp, client sans e-mail...).
 */
export default function CompletionSendModal({ quote, onClose, onSent }) {
  const { user } = useFirebaseAuth();
  const [acompte, setAcompte] = useState('');
  const [soldeOverride, setSoldeOverride] = useState(null);
  const [invoiceReference, setInvoiceReference] = useState('');
  const [email, setEmail] = useState(
    quote?.clientEmail || quote?.payload?.clientData?.email || ''
  );
  const [submittingMode, setSubmittingMode] = useState(null);
  const [error, setError] = useState('');
  const [missingField, setMissingField] = useState('');
  const [createdLink, setCreatedLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const [deliveryType, setDeliveryType] = useState('');

  const totalTTC = Number(quote?.totalTTC) || 0;
  const isDigitallySigned = getQuoteDisplayStatus(quote) === 'signed';
  const computedSolde = Math.max(0, totalTTC - parseAmount(acompte));
  const soldeValue = soldeOverride !== null ? soldeOverride : computedSolde.toFixed(2).replace('.', ',');

  // Détection AUTOMATIQUE pose / fourniture seule (même source de vérité que
  // la TVA et les CGV) sur la variante retenue à la signature. Le mode de
  // remise (enlèvement/livraison) reste un CHOIX MANUEL, jamais deviné —
  // le serveur refait la même détection et exige le choix.
  const withPose = useMemo(() => {
    const payload = quote?.payload || {};
    let cartItems = Array.isArray(payload.cartItems) ? payload.cartItems : [];
    let settings = payload.quoteSettings || {};
    if (payload.variantsMode === true && Array.isArray(payload.variants)) {
      const wantedVariantId =
        quote?.signatureWorkflow?.selectedVariantId || payload.activeVariantId || '';
      const variant =
        payload.variants.find((entry) => entry?.id === wantedVariantId) || payload.variants[0] || {};
      cartItems = Array.isArray(variant.cartItems) ? variant.cartItems : [];
      settings = variant.quoteSettings || {};
    }
    return resolveContractType(cartItems, settings?.contractTypeOverride) === CONTRACT_TYPES.AVEC_POSE;
  }, [quote]);

  const handleAcompteChange = (value) => {
    setAcompte(value);
    setSoldeOverride(null);
  };

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
    if (!withPose && !deliveryType) {
      setError('Ce devis est en fourniture seule : choisissez Enlèvement ou Livraison.');
      setMissingField('deliveryType');
      return;
    }
    if (!invoiceReference.trim()) {
      setError('La référence facture est obligatoire (celle de votre compta).');
      setMissingField('invoiceReference');
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
      // Le montant qui fait foi est le SOLDE AFFICHÉ (modifiable) : l'acompte
      // transmis en est déduit, pour que le PDF reflète exactement ce que
      // l'utilisateur a validé à l'écran, y compris après une saisie manuelle
      // du solde (avenant, règlement partiel non listé).
      const effectiveAcompte = Math.max(0, totalTTC - parseAmount(soldeValue));
      const response = await fetch('/api/completion-certificates/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          quoteId: quote.id,
          acompteRecu: effectiveAcompte,
          invoiceReference: invoiceReference.trim(),
          deliveryMode,
          deliveryType: withPose ? '' : deliveryType,
          overrideEmail: email.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Impossible d'envoyer le bon de fin de chantier.");
      }
      if (deliveryMode === 'link') {
        // La modale reste ouverte : le lien vient d'être créé, il faut
        // pouvoir le copier (et le recopier) avant de fermer.
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
              <Receipt size={18} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-orange-500">
                {withPose
                  ? 'Bon de fin de chantier'
                  : deliveryType === 'livraison'
                    ? 'Bon de livraison'
                    : deliveryType === 'enlevement'
                      ? "Bon d'enlèvement"
                      : "Bon d'enlèvement / de livraison"}
              </p>
              <h3 className="text-base font-bold text-slate-900">Envoyer au client</h3>
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
            {!isDigitallySigned && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  Ce devis n&apos;est pas marqué comme signé numériquement. Vérifiez qu&apos;il a bien été signé
                  (sur papier ou autrement) avant d&apos;envoyer ce bon.
                </span>
              </div>
            )}

            {!withPose && (
              <div className="mt-4">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Type de remise (devis en fourniture seule)
                </span>
                <div
                  className={`grid grid-cols-2 gap-2 ${
                    missingField === 'deliveryType' ? 'rounded-xl ring-4 ring-amber-500/10' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryType('enlevement');
                      if (missingField === 'deliveryType') setMissingField('');
                      setError('');
                    }}
                    className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-bold transition-colors ${
                      deliveryType === 'enlevement'
                        ? 'border-orange-400 bg-orange-50 text-orange-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Package size={16} />
                    Enlèvement
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryType('livraison');
                      if (missingField === 'deliveryType') setMissingField('');
                      setError('');
                    }}
                    className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-bold transition-colors ${
                      deliveryType === 'livraison'
                        ? 'border-orange-400 bg-orange-50 text-orange-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Truck size={16} />
                    Livraison
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm">
              <span className="text-slate-500">Total devis TTC</span>
              <span className="font-bold text-slate-900">{currencyFormatter.format(totalTTC)}</span>
            </div>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Acompte reçu
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={acompte}
                onChange={(event) => handleAcompteChange(event.target.value)}
                placeholder="0,00"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
              />
              <span className="mt-1 block text-[11px] text-slate-400">
                L&apos;app ne suit pas les acomptes (comptabilité externe) : renseignez ce qui a déjà été reçu
                pour ce devis.
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
                Calculé automatiquement (total − acompte), mais reste modifiable directement en cas
                d&apos;avenant ou de règlement partiel non saisi ci-dessus.
              </span>
            </label>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Référence facture
              </span>
              <input
                type="text"
                value={invoiceReference}
                onChange={(event) => {
                  setInvoiceReference(event.target.value);
                  if (missingField === 'invoiceReference') setMissingField('');
                }}
                placeholder="FA-2026-0458"
                className={`w-full rounded-xl border px-3.5 py-3 text-sm outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 ${
                  missingField === 'invoiceReference'
                    ? 'border-amber-400 ring-4 ring-amber-500/10'
                    : 'border-slate-300'
                }`}
              />
              <span className="mt-1 block text-[11px] text-slate-400">
                Saisie manuellement : la référence de la facture émise dans votre compta, pas un numéro généré
                automatiquement.
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
                Pré-rempli depuis le devis, modifiable. Inutile si vous créez simplement un lien à copier.
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
