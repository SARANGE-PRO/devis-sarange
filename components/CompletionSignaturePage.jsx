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
import ReservePhotoInput from './ReservePhotoInput';
import {
  getCompletionDocTypeLabel,
  getCompletionRatingCriteria,
} from '@/lib/completion-certificate.mjs';

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

export function StarRow({ label, value, onChange, missing = false }) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-2xl border bg-white px-5 py-4 ${
        missing ? 'border-amber-400 ring-4 ring-amber-500/10' : 'border-slate-200'
      }`}
    >
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

// Alerte de validation d'étape : dit CE QUI MANQUE au lieu de laisser un
// bouton grisé muet (les éléments concernés sont surlignés en ambre).
export function StepAlert({ message }) {
  if (!message) return null;
  return (
    <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 duration-200 animate-in fade-in">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </p>
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
        <p className="text-3xl tracking-wider" aria-hidden="true">
          ⭐⭐⭐⭐⭐
        </p>
        {/* Espace insécable avant le « ! » : la typographie française met une
            espace avant, qui provoquait un retour à la ligne du « ! » seul. */}
        <h2 className="mt-3 text-2xl font-black text-slate-900">Merci pour votre confiance&nbsp;!</h2>
        <p className="mx-auto mt-3 max-w-md text-base leading-7 text-slate-600">
          Votre avis compte énormément. Partagez-le en 30 secondes :
        </p>
        <a
          href={result.googleReviewUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-orange-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/25 transition-colors hover:bg-orange-600"
        >
          Partager mon avis sur Google
          <ArrowRight size={18} />
        </a>
        <p className="mt-5 text-xs text-slate-400">Votre exemplaire signé arrive par e-mail.</p>
      </div>
    </div>
  ) : (
    <div className="mx-auto max-w-2xl duration-300 animate-in fade-in">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-black/5 sm:p-10">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 size={34} className="text-emerald-500" />
        </div>
        <h2 className="text-2xl font-black text-slate-900">Merci&nbsp;!</h2>
        <p className="mx-auto mt-3 max-w-md text-base leading-7 text-slate-600">
          Votre bon de réception est signé et transmis à SARANGE. Votre exemplaire arrive par e-mail.
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
  // Message « ce qui manque » de l'étape courante + surlignage des éléments
  // incomplets une fois que le client a tenté de continuer.
  const [stepError, setStepError] = useState('');
  const [showMissing, setShowMissing] = useState(false);
  // Refus de la levée (PV uniquement) : le client signale qu'une réserve
  // n'est pas corrigée au lieu de signer — le cycle repart côté SARANGE.
  const [refusalOpen, setRefusalOpen] = useState(false);
  const [refusalComment, setRefusalComment] = useState('');
  const [refusalSubmitting, setRefusalSubmitting] = useState(false);
  const [refusalError, setRefusalError] = useState('');
  const [refusalDone, setRefusalDone] = useState(false);

  // Chaque étape repart du haut de page : sur mobile, le bouton Continuer est
  // en bas et l'étape suivante s'ouvrirait sinon au milieu du contenu.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    setStepError('');
    setShowMissing(false);
  }, [stepIndex]);

  useEffect(() => {
    let cancelled = false;
    fetchJson(`/api/completion-certificates/${encodeURIComponent(token)}`)
      .then((data) => {
        if (cancelled) return;
        setSession(data);
        setItemStates((data.ouvrages || []).map(() => ({ choice: null, comment: '', photos: [] })));
        // PV de levée : pas d'étape de vérification ouvrage par ouvrage, le
        // parcours démarre directement sur le constat de levée.
        if (data.mode === 'reserves-lift') setStepIndex(0);
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
  // Critères de notation adaptés au type de document (pas de « qualité de la
  // pose » sur un bon d'enlèvement/livraison) — mêmes clés de stockage.
  const ratingCriteria = getCompletionRatingCriteria(session?.docType);
  const allRated = ratingCriteria.every((criterion) => ratings[criterion.key] > 0);
  const checkedCount = itemStates.filter((item) => item.choice).length;

  const updateItem = (index, patch) => {
    setItemStates((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    if (patch.choice) setStepError('');
  };

  const markAllConform = () => {
    setItemStates((prev) => prev.map((item) => ({ ...item, choice: 'ok' })));
    setStepError('');
    setShowMissing(false);
  };

  const handleContinueChecklist = () => {
    if (!allItemsChecked) {
      const remaining = itemStates.length - checkedCount;
      setStepError(
        `Il reste ${remaining} élément${remaining > 1 ? 's' : ''} à vérifier : touchez « Conforme » ou « Signaler » sur chaque carte surlignée.`
      );
      setShowMissing(true);
      return;
    }
    setStepIndex(1);
  };

  const handleContinueRatings = () => {
    if (!allRated) {
      setStepError('Touchez les étoiles pour noter les 3 critères, puis continuez.');
      setShowMissing(true);
      return;
    }
    setStepIndex(2);
  };

  const handleSubmitSignature = async () => {
    if (!confirmed) {
      setStepError('Cochez la case de confirmation ci-dessus pour pouvoir signer.');
      setShowMissing(true);
      return;
    }
    if (!signatureDataUrl) {
      setStepError('Signez dans le cadre ci-dessus (au doigt ou à la souris) avant d\'envoyer.');
      setShowMissing(true);
      return;
    }
    setStepError('');
    setSubmitError('');
    setSubmitting(true);
    try {
      const payload = await fetchJson(`/api/completion-certificates/${encodeURIComponent(token)}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Les dimensions identifient précisément l'ouvrage concerné sur le
          // PDF (deux fenêtres du même modèle se distinguent par leur taille).
          reserves: flaggedItems.map((item) => ({
            description: [
              item.ouvrage?.designation || '',
              item.ouvrage?.dimensions ? `(${item.ouvrage.dimensions})` : '',
              item.comment ? `: ${item.comment}` : '',
            ]
              .filter(Boolean)
              .join(' ')
              .trim(),
          })),
          // Chemin de SECOURS uniquement : les photos dont le téléversement
          // en staging a réussi sont déjà côté serveur (rattachées au token),
          // seules celles en échec repartent inline (plafond serveur : 4).
          reservePhotos: flaggedItems
            .flatMap((item) => item.photos || [])
            .filter((photo) => !photo.uploaded)
            .map((photo) => photo.dataUrl)
            .slice(0, 4),
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

  const handleRefuseLift = async () => {
    if (!refusalComment.trim()) {
      setRefusalError("Décrivez en quelques mots ce qui n'est pas corrigé.");
      return;
    }
    setRefusalSubmitting(true);
    setRefusalError('');
    try {
      await fetchJson(`/api/completion-certificates/${encodeURIComponent(token)}/refuse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: refusalComment.trim() }),
      });
      setRefusalDone(true);
    } catch (error) {
      setRefusalError(error.message);
    } finally {
      setRefusalSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 size={30} className="animate-spin text-orange-500" />
      </main>
    );
  }

  if (refusalDone) {
    return (
      <CenteredNotice
        icon={<CheckCircle2 className="mx-auto text-emerald-500" size={40} />}
        title="Votre signalement est transmis."
        message="SARANGE est prévenu que la correction n'est pas terminée. Notre équipe reviendra vers vous pour planifier une nouvelle intervention, puis un nouveau PV de levée vous sera envoyé."
      />
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
    ['refused', 'received_no_reserves', 'received_with_reserves', 'reserves_lifted'].includes(session?.status) &&
    stepIndex !== 3
  ) {
    return (
      <CenteredNotice
        icon={<CheckCircle2 className="mx-auto text-emerald-500" size={40} />}
        title="Ce document a déjà été traité."
      />
    );
  }

  const isLift = session?.mode === 'reserves-lift';
  const isReception = (session?.docType || 'reception') === 'reception';
  const docLabel = getCompletionDocTypeLabel(session?.docType);
  const docLabelCapitalized = docLabel.charAt(0).toUpperCase() + docLabel.slice(1);
  const chantierLabel = [session?.clientData?.adresseChantier, session?.clientData?.villeChantier]
    .filter(Boolean)
    .join(', ');

  return (
    <PageShell
      headerLeft={
        <>
          <span className="truncate font-bold text-slate-800">
            {isLift ? 'Levée des réserves' : docLabelCapitalized}
            {session?.quoteNumber ? ` — Devis n°${session.quoteNumber.replace(/^DV[-\s]*/i, '')}` : ''}
          </span>
          {chantierLabel && <span className="hidden truncate sm:inline">— {chantierLabel}</span>}
        </>
      }
      stepBar={
        stepIndex < 3 ? (
          <StepBar
            steps={isLift ? ['Constat', 'Satisfaction', 'Signature'] : STEPS}
            currentIndex={stepIndex}
            onStepClick={setStepIndex}
          />
        ) : null
      }
    >
      {stepIndex === 0 && isLift && (
        <div className="mx-auto max-w-2xl duration-300 animate-in fade-in">
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-2xl bg-orange-100 p-3 text-orange-600">
              <ClipboardCheck size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 sm:text-2xl">Constat de levée des réserves</h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                SARANGE est intervenu pour corriger les réserves formulées lors de la réception
                {session?.completionNumber ? ` (bon n°${session.completionNumber})` : ''}.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {(session?.reserves || []).map((reserve, index) => (
              <div key={index} className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-500" />
                <div>
                  <p className="text-sm text-slate-800">{reserve.description}</p>
                  <p className="mt-0.5 text-xs font-bold text-emerald-600">Corrigée</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => setStepIndex(1)}
              className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-10 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/25 transition-colors hover:bg-orange-600"
            >
              Continuer
              <ArrowRight size={18} />
            </button>
          </div>

          {/* Refus discret : le client ne doit pas signer si une correction
              n'est pas réellement terminée — il le signale, avec un
              commentaire, et le cycle de levée repart côté SARANGE. */}
          <div className="mt-6 text-center">
            {!refusalOpen ? (
              <button
                type="button"
                onClick={() => setRefusalOpen(true)}
                className="text-xs font-semibold text-slate-400 underline underline-offset-2 hover:text-slate-600"
              >
                Une réserve n&apos;est pas corrigée ?
              </button>
            ) : (
              <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm">
                <p className="text-sm font-bold text-slate-800">Signaler une réserve non corrigée</p>
                <p className="mt-1 text-xs text-slate-500">
                  Ne signez pas le PV : décrivez ce qui reste à corriger, SARANGE planifiera une
                  nouvelle intervention.
                </p>
                <textarea
                  value={refusalComment}
                  onChange={(event) => {
                    setRefusalComment(event.target.value);
                    if (refusalError) setRefusalError('');
                  }}
                  rows={3}
                  placeholder="Ex. : la rayure sur le vitrage du séjour est toujours visible."
                  className={`mt-3 w-full rounded-xl border px-3.5 py-3 text-sm outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 ${
                    refusalError ? 'border-amber-400 ring-4 ring-amber-500/10' : 'border-slate-300'
                  }`}
                />
                {refusalError && (
                  <p className="mt-2 text-xs font-semibold text-rose-600">{refusalError}</p>
                )}
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRefusalOpen(false);
                      setRefusalError('');
                    }}
                    className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={refusalSubmitting}
                    onClick={handleRefuseLift}
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
                  >
                    {refusalSubmitting && <Loader2 size={13} className="animate-spin" />}
                    Envoyer le signalement
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {stepIndex === 0 && !isLift && (
        <div className="duration-300 animate-in fade-in">
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-2xl bg-orange-100 p-3 text-orange-600">
              <ClipboardCheck size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 sm:text-2xl">
                {isReception ? 'Vérifiez vos ouvrages' : 'Vérifiez vos produits'}
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                {isReception
                  ? "Pour chaque élément installé, indiquez s'il est conforme ou signalez un problème. Ce constat sera repris sur le bon de réception."
                  : "Pour chaque produit remis, indiquez s'il est conforme ou signalez un problème. Ce constat sera repris sur votre bon."}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {(session?.ouvrages || []).map((item, index) => (
              <div
                key={index}
                className={`rounded-2xl border bg-white p-5 shadow-sm ${
                  showMissing && !itemStates[index]?.choice
                    ? 'border-amber-400 ring-4 ring-amber-500/10'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-bold text-slate-900">{item.designation}</p>
                  {item.qte > 1 && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
                      × {item.qte}
                    </span>
                  )}
                </div>
                {(item.dimensions || item.repere) && (
                  <p className="mt-0.5 text-sm text-slate-500">
                    {[item.dimensions, item.repere].filter(Boolean).join(' · ')}
                  </p>
                )}
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
                  <>
                    <textarea
                      value={itemStates[index]?.comment || ''}
                      onChange={(event) => updateItem(index, { comment: event.target.value })}
                      placeholder="Décrivez le problème constaté…"
                      className="mt-3 w-full rounded-xl border border-amber-300 bg-white p-3 text-sm outline-none focus:ring-4 focus:ring-amber-500/10"
                      rows={2}
                    />
                    <ReservePhotoInput
                      photos={itemStates[index]?.photos || []}
                      onChange={(photos) => updateItem(index, { photos })}
                      max={4}
                      uploadContext={{ token }}
                    />
                  </>
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
              {checkedCount}/{itemStates.length} {isReception ? 'ouvrages vérifiés' : 'produits vérifiés'}
            </p>
            <div className="w-full max-w-md">
              <StepAlert message={stepError} />
            </div>
            <button
              type="button"
              onClick={handleContinueChecklist}
              className={`inline-flex items-center gap-2 rounded-full bg-orange-500 px-10 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/25 transition-colors hover:bg-orange-600 ${
                allItemsChecked ? '' : 'opacity-60'
              }`}
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
            {ratingCriteria.map((criterion) => (
              <StarRow
                key={criterion.key}
                label={criterion.label}
                value={ratings[criterion.key]}
                missing={showMissing && ratings[criterion.key] === 0}
                onChange={(value) => {
                  setRatings((prev) => ({ ...prev, [criterion.key]: value }));
                  setStepError('');
                }}
              />
            ))}
          </div>

          <div className="mt-4">
            <StepAlert message={stepError} />
          </div>

          <div className="mt-6 flex items-center justify-between">
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
              onClick={handleContinueRatings}
              className={`inline-flex items-center gap-2 rounded-full bg-orange-500 px-10 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/25 transition-colors hover:bg-orange-600 ${
                allRated ? '' : 'opacity-60'
              }`}
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
                {isLift
                  ? 'Relisez le constat puis signez le PV de levée des réserves.'
                  : isReception
                    ? 'Relisez le constat puis signez pour prononcer la réception des travaux.'
                    : 'Relisez le constat puis signez pour confirmer la remise de vos produits.'}
              </p>
            </div>
          </div>

          {isLift ? (
            <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-800">
              <p className="text-base font-bold">Réserves levées</p>
              <p className="mt-1.5 text-sm">
                Les {(session?.reserves || []).length} réserve(s) de la réception ont été corrigées. La signature
                de ce PV clôt votre dossier.
              </p>
              {Number(session?.amountDue) > 0 && (
                <p className="mt-3 rounded-xl bg-white/70 px-3.5 py-2.5 text-sm">
                  Le solde retenu de{' '}
                  <strong>
                    {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
                      Number(session.amountDue)
                    )}
                  </strong>{' '}
                  devient dû à la signature. Les coordonnées de règlement figurent sur le PV.
                </p>
              )}
            </div>
          ) : hasReserves ? (
            <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-800">
              <p className="text-base font-bold">{isReception ? 'Réception avec réserves' : 'Remise avec réserves'}</p>
              <p className="mt-1.5 text-sm leading-6">
                {flaggedItems.length} élément(s) signalé(s). Cela n&apos;empêche pas {isReception ? 'la réception' : 'la remise'} : SARANGE
                s&apos;engage à les corriger dans le délai convenu ({session?.reserveLiftDelayDays || 30} jours).
              </p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {flaggedItems.map((item, index) => (
                  <li key={index} className="rounded-xl bg-white/60 px-3.5 py-2">
                    <span className="font-bold">{item.ouvrage?.designation}</span>
                    {item.ouvrage?.dimensions && (
                      <span className="text-amber-700/80"> ({item.ouvrage.dimensions})</span>
                    )}
                    {item.comment ? ` : ${item.comment}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-800">
              <p className="text-base font-bold">{isReception ? 'Réception sans réserve' : 'Remise sans réserve'}</p>
              <p className="mt-1.5 text-sm">
                {isReception
                  ? 'Tous les ouvrages ont été vérifiés conformes au devis.'
                  : 'Tous les produits ont été vérifiés conformes au devis.'}
              </p>
            </div>
          )}

          <label
            className={`mb-5 flex items-start gap-3 rounded-2xl border bg-white p-5 shadow-sm ${
              showMissing && !confirmed ? 'border-amber-400 ring-4 ring-amber-500/10' : 'border-slate-200'
            }`}
          >
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => {
                setConfirmed(event.target.checked);
                if (event.target.checked) setStepError('');
              }}
              className="mt-0.5 h-5 w-5 accent-orange-500"
            />
            <span className="text-sm text-slate-800 sm:text-base">
              {isLift ? (
                <>
                  Je reconnais que les réserves listées ont été <strong>levées</strong>
                </>
              ) : isReception ? (
                <>
                  Je prononce la réception des travaux,{' '}
                  <strong>{hasReserves ? 'avec les réserves ci-dessus' : 'sans réserve'}</strong>
                </>
              ) : (
                <>
                  Je confirme la {session?.docType === 'enlevement' ? "remise des produits lors de l'enlèvement" : 'livraison des produits'},{' '}
                  <strong>{hasReserves ? 'avec les réserves ci-dessus' : 'sans réserve'}</strong>
                </>
              )}
            </span>
          </label>

          <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Votre signature</p>
          <div
            className={
              showMissing && !signatureDataUrl ? 'rounded-2xl ring-4 ring-amber-500/15' : ''
            }
          >
            <SignaturePad
              onChange={(dataUrl) => {
                setSignatureDataUrl(dataUrl);
                if (dataUrl) setStepError('');
              }}
              height={200}
            />
          </div>

          {submitError && (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertTriangle size={15} className="shrink-0" /> {submitError}
            </p>
          )}

          <div className="mt-4">
            <StepAlert message={stepError} />
          </div>

          <div className="mt-6 flex items-center justify-between">
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
              disabled={submitting}
              onClick={handleSubmitSignature}
              className={`inline-flex items-center gap-2 rounded-full bg-orange-500 px-10 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/25 transition-colors hover:bg-orange-600 disabled:opacity-50 ${
                confirmed && signatureDataUrl ? '' : 'opacity-60'
              }`}
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
