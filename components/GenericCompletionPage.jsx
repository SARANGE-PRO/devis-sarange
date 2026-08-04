'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ClipboardCheck,
  Loader2,
  PenLine,
  Star,
  UserRound,
} from 'lucide-react';
import SignaturePad from './SignaturePad';
import AddressAutocomplete from './AddressAutocomplete';
import ReservePhotoInput from './ReservePhotoInput';
import {
  RATING_CRITERIA,
  StarRow,
  StepBar,
  PageShell,
  FinalScreen,
  fetchJson,
} from './CompletionSignaturePage';

const STEPS = ['Coordonnées', 'Validation', 'Satisfaction', 'Signature'];

const inputClassName =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10';

/**
 * Variante générale du bon de fin de chantier : pas de devis lié (lien fixe
 * donné aux poseurs, voir /parametres), le client saisit ses coordonnées
 * lui-même. Tout est soumis en un seul appel à la signature (voir
 * lib/completion-signature-service.js#submitGenericCompletion).
 */
export default function GenericCompletionPage() {
  const [stepIndex, setStepIndex] = useState(0);
  const [contact, setContact] = useState({
    nom: '',
    prenom: '',
    email: '',
    adresse: '',
    ville: '',
    telephone: '',
    quoteReference: '',
  });
  const [validationChoice, setValidationChoice] = useState(null);
  const [validationComment, setValidationComment] = useState('');
  const [validationPhotos, setValidationPhotos] = useState([]);
  const [photoUploadId, setPhotoUploadId] = useState('');
  const [ratings, setRatings] = useState({ pose: 0, proprete: 0, relation: 0 });
  const [confirmed, setConfirmed] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);

  // Chaque étape repart du haut de page (bouton Continuer en bas sur mobile).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [stepIndex]);

  // Seuls nom, prénom et adresse bloquent la suite du parcours.
  const contactComplete = [contact.nom, contact.prenom, contact.adresse].every(
    (value) => value.trim().length > 0
  );
  const allRated = RATING_CRITERIA.every((criterion) => ratings[criterion.key] > 0);
  const hasReserves = validationChoice === 'warn';

  const updateContact = (key) => (event) =>
    setContact((prev) => ({ ...prev, [key]: event.target.value }));

  const handleSubmit = async () => {
    setSubmitError('');
    setSubmitting(true);
    try {
      const payload = await fetchJson('/api/completion-certificates/generic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...contact,
          reserves: hasReserves ? [{ description: validationComment || 'Problème signalé par le client' }] : [],
          // Secours uniquement : les photos téléversées en staging sont déjà
          // côté serveur, référencées par photoUploadId.
          reservePhotos: hasReserves
            ? validationPhotos.filter((photo) => !photo.uploaded).map((photo) => photo.dataUrl).slice(0, 4)
            : [],
          photoUploadId: hasReserves ? photoUploadId : '',
          ratings,
          signatureDataUrl,
        }),
      });
      setResult(payload);
      setStepIndex(4);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const clientLabel = `${contact.prenom} ${contact.nom}`.trim();

  return (
    <PageShell
      headerLeft={
        <>
          <span className="truncate font-bold text-slate-800">Bon de fin de chantier</span>
          {clientLabel && stepIndex > 0 && <span className="hidden truncate sm:inline">— {clientLabel}</span>}
        </>
      }
      stepBar={
        stepIndex < 4 ? (
          <StepBar steps={STEPS} currentIndex={stepIndex} onStepClick={setStepIndex} />
        ) : null
      }
    >
      {stepIndex === 0 && (
        <div className="mx-auto max-w-2xl duration-300 animate-in fade-in">
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-2xl bg-orange-100 p-3 text-orange-600">
              <UserRound size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 sm:text-2xl">Vos coordonnées</h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                Merci de renseigner vos informations pour ce bon de fin de chantier.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-slate-500">
                  Nom
                </label>
                <input
                  type="text"
                  value={contact.nom}
                  onChange={updateContact('nom')}
                  autoComplete="family-name"
                  className={inputClassName}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-slate-500">
                  Prénom
                </label>
                <input
                  type="text"
                  value={contact.prenom}
                  onChange={updateContact('prenom')}
                  autoComplete="given-name"
                  className={inputClassName}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-slate-500">
                  Adresse du chantier
                </label>
                <AddressAutocomplete
                  value={contact.adresse}
                  onChange={(value) => setContact((prev) => ({ ...prev, adresse: value }))}
                  onSelect={({ label, ville }) => setContact((prev) => ({ ...prev, adresse: label, ville }))}
                  placeholder="Numéro et nom de rue, ville…"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-slate-500">
                  Numéro de devis
                </label>
                <input
                  type="text"
                  value={contact.quoteReference}
                  onChange={updateContact('quoteReference')}
                  placeholder="DV-26216-0931"
                  className={inputClassName}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-slate-500">
                  Téléphone
                </label>
                <input
                  type="tel"
                  value={contact.telephone}
                  onChange={updateContact('telephone')}
                  autoComplete="tel"
                  className={inputClassName}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-slate-500">
                  E-mail
                </label>
                <input
                  type="email"
                  value={contact.email}
                  onChange={updateContact('email')}
                  autoComplete="email"
                  placeholder="Pour recevoir votre exemplaire signé"
                  className={inputClassName}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-center">
            <button
              type="button"
              disabled={!contactComplete}
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
              <ClipboardCheck size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 sm:text-2xl">Validation des travaux</h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                Confirmez-vous la bonne réalisation des travaux ?
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setValidationChoice('ok')}
              className={`flex w-full items-center gap-4 rounded-2xl border-2 bg-white px-6 py-5 text-left text-base font-bold transition-colors ${
                validationChoice === 'ok'
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              <span className="text-2xl">✓</span> Je valide les travaux réalisés
            </button>
            <button
              type="button"
              onClick={() => setValidationChoice('warn')}
              className={`flex w-full items-center gap-4 rounded-2xl border-2 bg-white px-6 py-5 text-left text-base font-bold transition-colors ${
                validationChoice === 'warn'
                  ? 'border-amber-400 bg-amber-50 text-amber-700'
                  : 'border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              <span className="text-2xl">⚠</span> Je signale un problème
            </button>
          </div>

          {validationChoice === 'warn' && (
            <>
              <textarea
                value={validationComment}
                onChange={(event) => setValidationComment(event.target.value)}
                placeholder="Décrivez le problème constaté…"
                className="mt-4 w-full rounded-2xl border border-amber-300 bg-white p-4 text-sm outline-none focus:ring-4 focus:ring-amber-500/10"
                rows={4}
              />
              <ReservePhotoInput
                photos={validationPhotos}
                onChange={setValidationPhotos}
                max={6}
                uploadContext={{ uploadId: photoUploadId, onUploadId: setPhotoUploadId }}
              />
            </>
          )}

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
              disabled={!validationChoice}
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
              onClick={() => setStepIndex(1)}
              className="inline-flex items-center gap-2 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
            >
              <ArrowLeft size={16} />
              Retour
            </button>
            <button
              type="button"
              disabled={!allRated}
              onClick={() => setStepIndex(3)}
              className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-10 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/25 transition-colors hover:bg-orange-600 disabled:opacity-40 disabled:shadow-none"
            >
              Continuer
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {stepIndex === 3 && (
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
              <p className="text-base font-bold">Réception avec réserve</p>
              <p className="mt-1.5 text-sm leading-6">
                Un problème a été signalé. Cela n&apos;empêche pas la réception : SARANGE s&apos;engage à le
                corriger dans un délai standard de 30 jours.
              </p>
              {validationComment && (
                <p className="mt-3 rounded-xl bg-white/60 px-3.5 py-2 text-sm">{validationComment}</p>
              )}
            </div>
          ) : (
            <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-800">
              <p className="text-base font-bold">Réception sans réserve</p>
              <p className="mt-1.5 text-sm">Les travaux ont été validés conformes.</p>
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
              <strong>{hasReserves ? 'avec réserve' : 'sans réserve'}</strong>
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
              onClick={() => setStepIndex(2)}
              className="inline-flex items-center gap-2 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
            >
              <ArrowLeft size={16} />
              Retour
            </button>
            <button
              type="button"
              disabled={!confirmed || !signatureDataUrl || submitting}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-10 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/25 transition-colors hover:bg-orange-600 disabled:opacity-40 disabled:shadow-none"
            >
              {submitting && <Loader2 size={17} className="animate-spin" />}
              Signer et envoyer
            </button>
          </div>
        </div>
      )}

      {stepIndex === 4 && <FinalScreen result={result} />}
    </PageShell>
  );
}
