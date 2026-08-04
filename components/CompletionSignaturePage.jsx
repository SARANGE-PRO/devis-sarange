'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Star,
  XCircle,
} from 'lucide-react';
import SignaturePad from './SignaturePad';

const RATING_CRITERIA = [
  { key: 'pose', label: 'Qualité de la pose' },
  { key: 'proprete', label: 'Propreté du chantier' },
  { key: 'relation', label: "Relation avec l'équipe" },
];

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Une erreur est survenue.');
  }
  return data;
};

function StarRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed border-slate-200 py-3">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            aria-label={`${star} étoile${star > 1 ? 's' : ''}`}
            className="p-0.5"
          >
            <Star
              size={22}
              className={star <= value ? 'fill-orange-500 text-orange-500' : 'text-slate-200'}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CompletionSignaturePage({ token }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [session, setSession] = useState(null);
  const [step, setStep] = useState('checklist');
  const [itemStates, setItemStates] = useState([]);
  const [ratings, setRatings] = useState({ pose: 0, proprete: 0, relation: 0 });
  const [confirmed, setConfirmed] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchJson(`/api/completion-certificates/${encodeURIComponent(token)}`)
      .then((data) => {
        if (cancelled) return;
        setSession(data);
        setItemStates((data.ouvrages || []).map(() => ({ choice: null, comment: '' })));
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const allItemsChecked = itemStates.length > 0 && itemStates.every((item) => item.choice);
  const flaggedItems = useMemo(
    () =>
      itemStates
        .map((item, index) => ({ ...item, ouvrage: session?.ouvrages?.[index] }))
        .filter((item) => item.choice === 'warn'),
    [itemStates, session]
  );
  const hasReserves = flaggedItems.length > 0;
  const allRated = RATING_CRITERIA.every((criterion) => ratings[criterion.key] > 0);
  const allFiveStars = RATING_CRITERIA.every((criterion) => ratings[criterion.key] === 5);

  const updateItem = (index, patch) => {
    setItemStates((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const handleSubmitSignature = async () => {
    setSubmitError('');
    setSubmitting(true);
    try {
      const payload = await fetchJson(`/api/completion-certificates/${encodeURIComponent(token)}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reserves: flaggedItems.map((item) => ({
            description: `${item.ouvrage?.designation || ''}${item.comment ? ' : ' + item.comment : ''}`.trim(),
          })),
          ratings,
          signatureDataUrl,
          confirmed,
        }),
      });
      setResult(payload);
      setStep('done');
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Loader2 size={28} className="animate-spin text-orange-500" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="max-w-sm rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <XCircle className="mx-auto mb-3 text-rose-500" size={32} />
          <p className="font-semibold text-slate-900">Lien invalide</p>
          <p className="mt-1 text-sm text-slate-500">{loadError}</p>
        </div>
      </div>
    );
  }

  if (['refused', 'received_no_reserves', 'received_with_reserves'].includes(session?.status) && step !== 'done') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <CheckCircle2 className="mx-auto mb-3 text-emerald-500" size={32} />
          <p className="font-semibold text-slate-900">Ce bon de fin de chantier a déjà été traité.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 px-4 py-8">
      <div className="mx-auto max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="relative bg-slate-950 px-5 py-4 text-white">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-orange-500" />
          <p className="text-base font-bold">SARANGE</p>
          <p className="mt-0.5 text-xs text-slate-300">
            {session?.quoteNumber ? `Devis ${session.quoteNumber}` : 'Bon de fin de chantier'}
            {session?.clientData?.villeChantier ? ` · ${session.clientData.villeChantier}` : ''}
          </p>
        </div>
        <div className="h-1 bg-white/10">
          <div
            className="h-full bg-orange-500 transition-all duration-300"
            style={{
              width:
                step === 'checklist'
                  ? '25%'
                  : step === 'ratings'
                    ? '55%'
                    : step === 'summary'
                      ? '80%'
                      : '100%',
            }}
          />
        </div>

        {step === 'checklist' && (
          <div className="p-5">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-orange-600">Étape 1/3</p>
            <h1 className="mb-1 text-lg font-bold text-slate-900">Vérifiez vos ouvrages</h1>
            <p className="mb-5 text-sm text-slate-500">
              Pour chaque élément installé, indiquez s&apos;il est conforme ou si vous souhaitez signaler un problème.
            </p>
            <div className="space-y-2.5">
              {(session?.ouvrages || []).map((item, index) => (
                <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <p className="text-sm font-bold text-slate-900">{item.designation}</p>
                  {item.repere && <p className="text-xs text-slate-500">{item.repere}</p>}
                  <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateItem(index, { choice: 'ok' })}
                      className={`rounded-lg border px-2 py-2 text-xs font-bold ${
                        itemStates[index]?.choice === 'ok'
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      ✓ Conforme
                    </button>
                    <button
                      type="button"
                      onClick={() => updateItem(index, { choice: 'warn' })}
                      className={`rounded-lg border px-2 py-2 text-xs font-bold ${
                        itemStates[index]?.choice === 'warn'
                          ? 'border-amber-300 bg-amber-50 text-amber-700'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      ⚠ Signaler
                    </button>
                  </div>
                  {itemStates[index]?.choice === 'warn' && (
                    <textarea
                      value={itemStates[index]?.comment || ''}
                      onChange={(event) => updateItem(index, { comment: event.target.value })}
                      placeholder="Décrivez le problème constaté…"
                      className="mt-2.5 w-full rounded-lg border border-amber-300 bg-white p-2.5 text-xs outline-none"
                      rows={2}
                    />
                  )}
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-xs text-slate-400">
              {itemStates.filter((item) => item.choice).length}/{itemStates.length} ouvrages vérifiés
            </p>
            <button
              type="button"
              disabled={!allItemsChecked}
              onClick={() => setStep('ratings')}
              className="mt-3 w-full rounded-xl bg-orange-500 py-3.5 text-sm font-bold text-white disabled:opacity-40"
            >
              Continuer
            </button>
          </div>
        )}

        {step === 'ratings' && (
          <div className="p-5">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-orange-600">Étape 2/3</p>
            <h1 className="mb-1 text-lg font-bold text-slate-900">Votre satisfaction</h1>
            <p className="mb-4 text-sm text-slate-500">Avant de signer, dites-nous comment s&apos;est passée votre expérience :</p>
            {RATING_CRITERIA.map((criterion) => (
              <StarRow
                key={criterion.key}
                label={criterion.label}
                value={ratings[criterion.key]}
                onChange={(value) => setRatings((prev) => ({ ...prev, [criterion.key]: value }))}
              />
            ))}
            <button
              type="button"
              disabled={!allRated}
              onClick={() => setStep('summary')}
              className="mt-5 w-full rounded-xl bg-orange-500 py-3.5 text-sm font-bold text-white disabled:opacity-40"
            >
              Continuer
            </button>
            <button
              type="button"
              onClick={() => setStep('checklist')}
              className="mt-2 w-full py-2 text-xs font-semibold text-slate-500 underline"
            >
              Revenir à la vérification
            </button>
          </div>
        )}

        {step === 'summary' && (
          <div className="p-5">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-orange-600">Étape 3/3</p>
            <h1 className="mb-3 text-lg font-bold text-slate-900">Récapitulatif &amp; signature</h1>

            {hasReserves ? (
              <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-800">
                <p className="font-bold">Réception avec réserves</p>
                <p className="mt-1">
                  {flaggedItems.length} élément(s) signalé(s). Cela n&apos;empêche pas la réception : SARANGE
                  s&apos;engage à les corriger dans le délai indiqué ({session?.reserveLiftDelayDays || 30} jours).
                </p>
              </div>
            ) : (
              <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-sm text-emerald-800">
                <p className="font-bold">Réception sans réserve</p>
                <p className="mt-1">Tous les ouvrages ont été vérifiés conformes.</p>
              </div>
            )}

            <label className="mb-4 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-orange-500"
              />
              <span className="text-sm text-slate-800">
                Je prononce la réception des travaux,{' '}
                <strong>{hasReserves ? 'avec les réserves ci-dessus' : 'sans réserve'}</strong>
              </span>
            </label>

            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Signature</p>
            <SignaturePad onChange={setSignatureDataUrl} />

            {submitError && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-rose-600">
                <AlertTriangle size={13} /> {submitError}
              </p>
            )}

            <button
              type="button"
              disabled={!confirmed || !signatureDataUrl || submitting}
              onClick={handleSubmitSignature}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {submitting && <Loader2 size={15} className="animate-spin" />}
              Signer et envoyer
            </button>
            <button
              type="button"
              onClick={() => setStep('ratings')}
              className="mt-2 w-full py-2 text-xs font-semibold text-slate-500 underline"
            >
              Revenir à la satisfaction
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="p-5">
            {result?.allFiveStars ? (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-800">
                <p className="text-base font-bold">Merci pour votre confiance ! ⭐⭐⭐⭐⭐</p>
                <p className="mt-2 text-sm">
                  Toute l&apos;équipe SARANGE vous remercie pour votre évaluation. Votre satisfaction est notre plus
                  belle réussite. Pourriez-vous prendre 30 secondes pour partager votre expérience sur Google ? Cela
                  aide grandement de futurs clients à nous faire confiance.
                </p>
                <a
                  href={result.googleReviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 block rounded-xl bg-orange-500 py-3.5 text-center text-sm font-bold text-white"
                >
                  Partager mon avis sur Google →
                </a>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-slate-700">
                <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={30} />
                <p className="font-bold">Merci !</p>
                <p className="mt-1 text-sm">Votre bon de réception a bien été signé et transmis à SARANGE. À bientôt.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
