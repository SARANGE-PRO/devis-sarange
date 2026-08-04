'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  PenLine,
  Star,
  XCircle,
} from 'lucide-react';
import SignaturePad from './SignaturePad';

const SUPPORT_PHONE = '09 86 71 34 44';

export const RATING_CRITERIA = [
  { key: 'pose', label: 'Qualité de la pose' },
  { key: 'proprete', label: 'Propreté du chantier' },
  { key: 'relation', label: "Relation avec l'équipe" },
];

export const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Une erreur est survenue.');
  }
  return data;
};

export function StarRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <span className="text-sm font-bold text-slate-800 sm:text-base">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            aria-label={`${star} étoile${star > 1 ? 's' : ''}`}
            className="p-1 transition-transform hover:scale-110"
          >
            <Star
              size={28}
              className={star <= value ? 'fill-orange-500 text-orange-500' : 'text-slate-200'}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// Barre d'étapes du micro-header, sur le modèle de la page de signature du
// devis : libellés cliquables uniquement en arrière (jamais de saut avant).
export function StepBar({ steps, currentIndex, onStepClick }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <button
            key={step}
            type="button"
            disabled={!isDone}
            onClick={() => isDone && onStepClick(index)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              isCurrent
                ? 'bg-orange-500 text-white'
                : isDone
                  ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                  : 'bg-slate-100 text-slate-400'
            }`}
          >
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                isCurrent ? 'bg-white/25' : isDone ? 'bg-orange-200' : 'bg-slate-200'
              }`}
            >
              {index + 1}
            </span>
            <span className="hidden sm:inline">{step}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PageShell({ headerLeft, headerRight, stepBar, children }) {
  return (
    <main className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="flex min-w-0 items-baseline gap-2 text-sm text-slate-500">{headerLeft}</div>
          {stepBar && <div className="lg:px-2">{stepBar}</div>}
          {headerRight && <div className="flex shrink-0 items-center gap-3">{headerRight}</div>}
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</div>

      <footer className="border-t border-slate-200 bg-white py-5 text-center text-xs text-slate-400">
        SARANGE Menuiseries — Une question ? {SUPPORT_PHONE}
      </footer>
    </main>
  );
}

export function CenteredNotice({ icon, title, message }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-black/5">
        {icon}
        <p className="mt-3 text-lg font-bold text-slate-900">{title}</p>
        {message && <p className="mt-2 text-sm text-slate-500">{message}</p>}
      </div>
    </main>
  );
}

export function FinalScreen({ result }) {
  return result?.allFiveStars ? (
    <div className="mx-auto max-w-2xl duration-300 animate-in fade-in">
      <div className="rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-xl shadow-black/5 sm:p-10">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 size={34} className="text-emerald-500" />
        </div>
        <h2 className="text-2xl font-black text-slate-900">Merci pour votre confiance ! ⭐⭐⭐⭐⭐</h2>
        <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-slate-600">
          Toute l&apos;équipe SARANGE vous remercie pour votre évaluation. Votre satisfaction est notre plus belle
          réussite. Pourriez-vous prendre 30 secondes pour partager votre expérience sur Google ? Cela aide
          grandement de futurs clients à nous faire confiance.
        </p>
        <a
          href={result.googleReviewUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-7 inline-flex items-center gap-2 rounded-full bg-orange-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/25 transition-colors hover:bg-orange-600"
        >
          Partager mon avis sur Google
          <ArrowRight size={18} />
        </a>
      </div>
    </div>
  ) : (
    <div className="mx-auto max-w-2xl duration-300 animate-in fade-in">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-black/5 sm:p-10">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 size={34} className="text-emerald-500" />
        </div>
        <h2 className="text-2xl font-black text-slate-900">Merci !</h2>
        <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-slate-600">
          Votre bon de réception a bien été signé et transmis à SARANGE. Vous recevrez votre exemplaire par e-mail.
          À bientôt.
        </p>
      </div>
    </div>
  );
}

const STEPS = ['Vérification', 'Satisfaction', 'Signature'];

export default function CompletionSignaturePage({ token }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [session, setSession] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [itemStates, setItemStates] = useState([]);
  const [ratings, setRatings] = useState({ pose: 0, proprete: 0, relation: 0 });
  const [confirmed, setConfirmed] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);

  // Chaque étape repart du haut de page : sur mobile, le bouton Continuer est
  // en bas et l'étape suivante s'ouvrirait sinon au milieu du contenu.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [stepIndex]);

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
  const checkedCount = itemStates.filter((item) => item.choice).length;

  const updateItem = (index, patch) => {
    setItemStates((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const markAllConform = () => {
    setItemStates((prev) => prev.map((item) => ({ ...item, choice: 'ok' })));
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
      setStepIndex(3);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 size={30} className="animate-spin text-orange-500" />
      </main>
    );
  }

  if (loadError) {
    return (
      <CenteredNotice
        icon={<XCircle className="mx-auto text-rose-500" size={40} />}
        title="Lien invalide"
        message={loadError}
      />
    );
  }

  if (
    ['refused', 'received_no_reserves', 'received_with_reserves'].includes(session?.status) &&
    stepIndex !== 3
  ) {
    return (
      <CenteredNotice
        icon={<CheckCircle2 className="mx-auto text-emerald-500" size={40} />}
        title="Ce bon de fin de chantier a déjà été traité."
      />
    );
  }

  const chantierLabel = [session?.clientData?.adresseChantier, session?.clientData?.villeChantier]
    .filter(Boolean)
    .join(', ');

  return (
    <PageShell
      headerLeft={
        <>
          <span className="truncate font-bold text-slate-800">
            Bon de fin de chantier{session?.quoteNumber ? ` — Devis n°${session.quoteNumber.replace(/^DV[-\s]*/i, '')}` : ''}
          </span>
          {chantierLabel && <span className="hidden truncate sm:inline">— {chantierLabel}</span>}
        </>
      }
      stepBar={
        stepIndex < 3 ? (
          <StepBar steps={STEPS} currentIndex={stepIndex} onStepClick={setStepIndex} />
        ) : null
      }
    >
      {stepIndex === 0 && (
        <div className="duration-300 animate-in fade-in">
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-2xl bg-orange-100 p-3 text-orange-600">
              <ClipboardCheck size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 sm:text-2xl">Vérifiez vos ouvrages</h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                Pour chaque élément installé, indiquez s&apos;il est conforme ou signalez un problème. Ce constat
                sera repris sur le bon de réception.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {(session?.ouvrages || []).map((item, index) => (
              <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-bold text-slate-900">{item.designation}</p>
                  {item.qte > 1 && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
                      × {item.qte}
                    </span>
                  )}
                </div>
                {item.repere && <p className="mt-0.5 text-sm text-slate-500">{item.repere}</p>}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateItem(index, { choice: 'ok' })}
                    className={`rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition-colors ${
                      itemStates[index]?.choice === 'ok'
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    ✓ Conforme
                  </button>
                  <button
                    type="button"
                    onClick={() => updateItem(index, { choice: 'warn' })}
                    className={`rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition-colors ${
                      itemStates[index]?.choice === 'warn'
                        ? 'border-amber-400 bg-amber-50 text-amber-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
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
                    className="mt-3 w-full rounded-xl border border-amber-300 bg-white p-3 text-sm outline-none focus:ring-4 focus:ring-amber-500/10"
                    rows={2}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            {!allItemsChecked && itemStates.length > 1 && (
              <button
                type="button"
                onClick={markAllConform}
                className="inline-flex items-center gap-2 rounded-full border-2 border-emerald-300 bg-emerald-50 px-6 py-2.5 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
              >
                ✓ Tout est conforme
              </button>
            )}
            <p className="text-sm text-slate-400">
              {checkedCount}/{itemStates.length} ouvrages vérifiés
            </p>
            <button
              type="button"
              disabled={!allItemsChecked}
              onClick={() => setStepIndex(1)}
              className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-10 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/25 transition-colors hover:bg-orange-600 disabled:opacity-40 disabled:shadow-none"
            >
              Continuer
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {stepIndex === 1 && (
        <div className="mx-auto max-w-2xl duration-300 animate-in fade-in">
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-2xl bg-orange-100 p-3 text-orange-600">
              <Star size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 sm:text-2xl">Votre satisfaction</h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                Avant de signer, dites-nous comment s&apos;est passée votre expérience :
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {RATING_CRITERIA.map((criterion) => (
              <StarRow
                key={criterion.key}
                label={criterion.label}
                value={ratings[criterion.key]}
                onChange={(value) => setRatings((prev) => ({ ...prev, [criterion.key]: value }))}
              />
            ))}
          </div>

          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStepIndex(0)}
              className="inline-flex items-center gap-2 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
            >
              <ArrowLeft size={16} />
              Retour
            </button>
            <button
              type="button"
              disabled={!allRated}
              onClick={() => setStepIndex(2)}
              className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-10 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/25 transition-colors hover:bg-orange-600 disabled:opacity-40 disabled:shadow-none"
            >
              Continuer
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {stepIndex === 2 && (
        <div className="mx-auto max-w-2xl duration-300 animate-in fade-in">
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-2xl bg-orange-100 p-3 text-orange-600">
              <PenLine size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 sm:text-2xl">Récapitulatif &amp; signature</h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                Relisez le constat puis signez pour prononcer la réception des travaux.
              </p>
            </div>
          </div>

          {hasReserves ? (
            <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-800">
              <p className="text-base font-bold">Réception avec réserves</p>
              <p className="mt-1.5 text-sm leading-6">
                {flaggedItems.length} élément(s) signalé(s). Cela n&apos;empêche pas la réception : SARANGE
                s&apos;engage à les corriger dans le délai convenu ({session?.reserveLiftDelayDays || 30} jours).
              </p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {flaggedItems.map((item, index) => (
                  <li key={index} className="rounded-xl bg-white/60 px-3.5 py-2">
                    <span className="font-bold">{item.ouvrage?.designation}</span>
                    {item.comment ? ` : ${item.comment}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-800">
              <p className="text-base font-bold">Réception sans réserve</p>
              <p className="mt-1.5 text-sm">Tous les ouvrages ont été vérifiés conformes au devis.</p>
            </div>
          )}

          <label className="mb-5 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5 h-5 w-5 accent-orange-500"
            />
            <span className="text-sm text-slate-800 sm:text-base">
              Je prononce la réception des travaux,{' '}
              <strong>{hasReserves ? 'avec les réserves ci-dessus' : 'sans réserve'}</strong>
            </span>
          </label>

          <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Votre signature</p>
          <SignaturePad onChange={setSignatureDataUrl} height={200} />

          {submitError && (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertTriangle size={15} className="shrink-0" /> {submitError}
            </p>
          )}

          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStepIndex(1)}
              className="inline-flex items-center gap-2 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
            >
              <ArrowLeft size={16} />
              Retour
            </button>
            <button
              type="button"
              disabled={!confirmed || !signatureDataUrl || submitting}
              onClick={handleSubmitSignature}
              className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-10 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/25 transition-colors hover:bg-orange-600 disabled:opacity-40 disabled:shadow-none"
            >
              {submitting && <Loader2 size={17} className="animate-spin" />}
              Signer et envoyer
            </button>
          </div>
        </div>
      )}

      {stepIndex === 3 && <FinalScreen result={result} />}
    </PageShell>
  );
}
