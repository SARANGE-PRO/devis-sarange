'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Star } from 'lucide-react';
import SignaturePad from './SignaturePad';
import AddressAutocomplete from './AddressAutocomplete';

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
            <Star size={22} className={star <= value ? 'fill-orange-500 text-orange-500' : 'text-slate-200'} />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Variante générale du bon de fin de chantier : pas de devis lié (lien fixe
 * donné aux poseurs, voir /parametres), le client saisit ses coordonnées
 * lui-même. Contrairement à la version liée à un devis, il n'y a pas de
 * session pré-créée par le bureau : tout est soumis en un seul appel à la
 * signature (voir lib/completion-signature-service.js#submitGenericCompletion).
 */
export default function GenericCompletionPage() {
  const [step, setStep] = useState('contact');
  const [contact, setContact] = useState({ nom: '', prenom: '', email: '', adresse: '', telephone: '' });
  const [validationChoice, setValidationChoice] = useState(null);
  const [validationComment, setValidationComment] = useState('');
  const [ratings, setRatings] = useState({ pose: 0, proprete: 0, relation: 0 });
  const [confirmed, setConfirmed] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);

  const contactComplete = Object.values(contact).every((value) => value.trim().length > 0);
  const allRated = RATING_CRITERIA.every((criterion) => ratings[criterion.key] > 0);
  const hasReserves = validationChoice === 'warn';

  const progressWidth = useMemo(() => {
    if (step === 'contact') return '15%';
    if (step === 'validation') return '40%';
    if (step === 'ratings') return '65%';
    if (step === 'summary') return '90%';
    return '100%';
  }, [step]);

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
          ratings,
          signatureDataUrl,
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 px-4 py-8">
      <div className="mx-auto max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="relative bg-slate-950 px-5 py-4 text-white">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-orange-500" />
          <p className="text-base font-bold">SARANGE</p>
          <p className="mt-0.5 text-xs text-slate-300">
            {step === 'contact' ? 'Bon de fin de chantier' : `${contact.prenom} ${contact.nom}`.trim()}
          </p>
        </div>
        <div className="h-1 bg-white/10">
          <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: progressWidth }} />
        </div>

        {step === 'contact' && (
          <div className="p-5">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-orange-600">Étape 1/4</p>
            <h1 className="mb-1 text-lg font-bold text-slate-900">Vos coordonnées</h1>
            <p className="mb-4 text-sm text-slate-500">Merci de renseigner vos informations pour ce bon de fin de chantier.</p>

            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Nom</label>
                <input
                  type="text"
                  value={contact.nom}
                  onChange={(event) => setContact((prev) => ({ ...prev, nom: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Prénom</label>
                <input
                  type="text"
                  value={contact.prenom}
                  onChange={(event) => setContact((prev) => ({ ...prev, prenom: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">E-mail</label>
                <input
                  type="email"
                  value={contact.email}
                  onChange={(event) => setContact((prev) => ({ ...prev, email: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Adresse</label>
                <AddressAutocomplete
                  value={contact.adresse}
                  onChange={(value) => setContact((prev) => ({ ...prev, adresse: value }))}
                  onSelect={({ label }) => setContact((prev) => ({ ...prev, adresse: label }))}
                  placeholder="Numéro et nom de rue, ville…"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Téléphone</label>
                <input
                  type="tel"
                  value={contact.telephone}
                  onChange={(event) => setContact((prev) => ({ ...prev, telephone: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={!contactComplete}
              onClick={() => setStep('validation')}
              className="mt-5 w-full rounded-xl bg-orange-500 py-3.5 text-sm font-bold text-white disabled:opacity-40"
            >
              Continuer
            </button>
          </div>
        )}

        {step === 'validation' && (
          <div className="p-5">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-orange-600">Étape 2/4</p>
            <h1 className="mb-1 text-lg font-bold text-slate-900">Validation des travaux</h1>
            <p className="mb-4 text-sm text-slate-500">Confirmez-vous la bonne réalisation des travaux ?</p>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setValidationChoice('ok')}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm font-bold ${
                  validationChoice === 'ok'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <span className="text-lg">✓</span> Je valide les travaux réalisés
              </button>
              <button
                type="button"
                onClick={() => setValidationChoice('warn')}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm font-bold ${
                  validationChoice === 'warn'
                    ? 'border-amber-300 bg-amber-50 text-amber-700'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <span className="text-lg">⚠</span> Je signale un problème
              </button>
            </div>

            {validationChoice === 'warn' && (
              <textarea
                value={validationComment}
                onChange={(event) => setValidationComment(event.target.value)}
                placeholder="Décrivez le problème constaté…"
                className="mt-3 w-full rounded-xl border border-amber-300 bg-white p-3 text-sm outline-none"
                rows={3}
              />
            )}

            <button
              type="button"
              disabled={!validationChoice}
              onClick={() => setStep('ratings')}
              className="mt-5 w-full rounded-xl bg-orange-500 py-3.5 text-sm font-bold text-white disabled:opacity-40"
            >
              Continuer
            </button>
            <button
              type="button"
              onClick={() => setStep('contact')}
              className="mt-2 w-full py-2 text-xs font-semibold text-slate-500 underline"
            >
              Revenir aux coordonnées
            </button>
          </div>
        )}

        {step === 'ratings' && (
          <div className="p-5">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-orange-600">Étape 3/4</p>
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
              onClick={() => setStep('validation')}
              className="mt-2 w-full py-2 text-xs font-semibold text-slate-500 underline"
            >
              Revenir à la validation
            </button>
          </div>
        )}

        {step === 'summary' && (
          <div className="p-5">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-orange-600">Étape 4/4</p>
            <h1 className="mb-3 text-lg font-bold text-slate-900">Récapitulatif &amp; signature</h1>

            {hasReserves ? (
              <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-800">
                <p className="font-bold">Réception avec réserve</p>
                <p className="mt-1">
                  Un problème a été signalé. Cela n&apos;empêche pas la réception : SARANGE s&apos;engage à le
                  corriger dans un délai standard de 30 jours.
                </p>
              </div>
            ) : (
              <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-sm text-emerald-800">
                <p className="font-bold">Réception sans réserve</p>
                <p className="mt-1">Les travaux ont été validés conformes.</p>
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
                <strong>{hasReserves ? 'avec réserve' : 'sans réserve'}</strong>
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
              onClick={handleSubmit}
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
