'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ClipboardCheck,
  Hammer,
  Loader2,
  Package,
  PenLine,
  Star,
  Truck,
  UserRound,
} from 'lucide-react';
import { formatPhoneNumber, formatPhoneWhileTyping } from '@/lib/phone.mjs';
import {
  capitalizeLabel,
  getCompletionDocTypeLabel,
  getCompletionRatingCriteria,
} from '@/lib/completion-certificate.mjs';
import SignaturePad from './SignaturePad';
import AddressAutocomplete from './AddressAutocomplete';
import ReservePhotoInput from './ReservePhotoInput';
import {
  StarRow,
  StepAlert,
  StepBar,
  PageShell,
  FinalScreen,
  fetchJson,
} from './CompletionSignaturePage';

const STEPS = ['Prestation', 'Coordonnées', 'Validation', 'Satisfaction', 'Signature'];

// Un seul lien pour les trois cas : le client choisit d'abord la prestation,
// et tout le parcours (textes, critères de satisfaction, PDF, e-mails) suit
// le type de document, comme pour le bon lié à un devis.
const DOC_TYPE_OPTIONS = [
  {
    id: 'reception',
    label: 'Pose',
    description: 'Travaux réalisés chez vous : bon de fin de chantier.',
    Icon: Hammer,
  },
  {
    id: 'livraison',
    label: 'Livraison',
    description: 'Menuiseries livrées sans pose : bon de livraison.',
    Icon: Truck,
  },
  {
    id: 'enlevement',
    label: 'Enlèvement',
    description: "Menuiseries retirées à l'atelier : bon d'enlèvement.",
    Icon: Package,
  },
];

const inputClassName =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10';

/**
 * Variante générale du bon (fin de chantier, livraison ou enlèvement) : pas de
 * devis lié (lien fixe donné aux poseurs, voir /parametres), le client choisit
 * la prestation puis saisit ses coordonnées lui-même. Tout est soumis en un
 * seul appel à la signature (voir
 * lib/completion-signature-service.js#submitGenericCompletion).
 */
export default function GenericCompletionPage() {
  const [stepIndex, setStepIndex] = useState(0);
  const [docType, setDocType] = useState('');
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
  const [stepError, setStepError] = useState('');
  const [showMissing, setShowMissing] = useState(false);

  // Chaque étape repart du haut de page (bouton Continuer en bas sur mobile).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    setStepError('');
    setShowMissing(false);
  }, [stepIndex]);

  const isRemise = docType === 'livraison' || docType === 'enlevement';
  const docLabel = docType ? getCompletionDocTypeLabel(docType) : 'bon';
  const ratingCriteria = getCompletionRatingCriteria(docType || 'reception');
  const addressLabel =
    docType === 'livraison'
      ? 'Adresse de livraison'
      : docType === 'enlevement'
        ? 'Votre adresse'
        : 'Adresse du chantier';

  // Seuls nom, prénom et adresse bloquent la suite du parcours.
  const REQUIRED_CONTACT_FIELDS = [
    ['nom', 'votre nom'],
    ['prenom', 'votre prénom'],
    ['adresse', addressLabel.toLowerCase().replace(/^adresse/, "l'adresse")],
  ];
  const missingContactFields = REQUIRED_CONTACT_FIELDS.filter(([key]) => !contact[key].trim());
  const contactComplete = missingContactFields.length === 0;
  const allRated = ratingCriteria.every((criterion) => ratings[criterion.key] > 0);
  const hasReserves = validationChoice === 'warn';

  // Téléphone : mise en forme automatique pendant la frappe (06 62 68 90 84).
  const updatePhone = (event) => {
    const formatted = formatPhoneWhileTyping(event.target.value, event.target.selectionStart);
    setContact((prev) => ({ ...prev, telephone: formatted }));
  };

  const blurPhone = (event) => {
    const formatted = formatPhoneNumber(event.target.value);
    setContact((prev) => (prev.telephone === formatted ? prev : { ...prev, telephone: formatted }));
  };

  const updateContact = (key) => (event) => {
    setContact((prev) => ({ ...prev, [key]: event.target.value }));
    setStepError('');
  };

  const isFieldMissing = (key) => showMissing && !contact[key].trim();
  const missingFieldClass = (key) => (isFieldMissing(key) ? ' border-amber-400 ring-4 ring-amber-500/10' : '');

  const handleContinueDocType = () => {
    if (!docType) {
      setStepError('Choisissez la prestation concernée pour continuer.');
      setShowMissing(true);
      return;
    }
    setStepIndex(1);
  };

  const handleContinueContact = () => {
    if (!contactComplete) {
      setStepError(
        `Pour continuer, renseignez ${missingContactFields.map(([, label]) => label).join(', ')}.`
      );
      setShowMissing(true);
      return;
    }
    setStepIndex(2);
  };

  const handleContinueValidation = () => {
    if (!validationChoice) {
      setStepError('Choisissez une des deux options pour continuer.');
      setShowMissing(true);
      return;
    }
    setStepIndex(3);
  };

  const handleContinueRatings = () => {
    if (!allRated) {
      setStepError('Touchez les étoiles pour noter les 3 critères, puis continuez.');
      setShowMissing(true);
      return;
    }
    setStepIndex(4);
  };

  const handleSubmit = async () => {
    if (!confirmed) {
      setStepError('Cochez la case de confirmation ci-dessus pour pouvoir signer.');
      setShowMissing(true);
      return;
    }
    if (!signatureDataUrl) {
      setStepError("Signez dans le cadre ci-dessus (au doigt ou à la souris) avant d'envoyer.");
      setShowMissing(true);
      return;
    }
    setStepError('');
    setSubmitError('');
    setSubmitting(true);
    try {
      const payload = await fetchJson('/api/completion-certificates/generic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...contact,
          docType,
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
      setStepIndex(5);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const clientLabel = `${contact.prenom} ${contact.nom}`.trim();

  // Textes de validation et de récapitulatif selon la prestation.
  const validationTitle = isRemise ? 'Validation des produits' : 'Validation des travaux';
  const validationQuestion = isRemise
    ? 'Confirmez-vous la bonne réception de vos menuiseries ?'
    : 'Confirmez-vous la bonne réalisation des travaux ?';
  const validationOkLabel = isRemise ? 'Je valide les produits remis' : 'Je valide les travaux réalisés';
  const recapSubtitle = isRemise
    ? 'Relisez le constat puis signez pour confirmer la remise des produits.'
    : 'Relisez le constat puis signez pour prononcer la réception des travaux.';
  const recapWord = isRemise ? 'Remise' : 'Réception';
  const recapOkDetail = isRemise
    ? 'Les produits ont été validés conformes.'
    : 'Les travaux ont été validés conformes.';
  const recapWarnDetail = isRemise
    ? "Un problème a été signalé. Cela n'empêche pas la remise : SARANGE s'engage à le traiter dans un délai standard de 30 jours."
    : "Un problème a été signalé. Cela n'empêche pas la réception : SARANGE s'engage à le corriger dans un délai standard de 30 jours.";
  const confirmationText =
    docType === 'livraison'
      ? 'Je confirme la livraison des produits,'
      : docType === 'enlevement'
        ? "Je confirme l'enlèvement des produits,"
        : 'Je prononce la réception des travaux,';

  const continueButtonClass = (enabled) =>
    `inline-flex items-center gap-2 rounded-full bg-orange-500 px-10 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/25 transition-colors hover:bg-orange-600 ${
      enabled ? '' : 'opacity-60'
    }`;

  const backButtonClass =
    'inline-flex items-center gap-2 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700';

  return (
    <PageShell
      headerLeft={
        <>
          <span className="truncate font-bold text-slate-800">
            {docType ? capitalizeLabel(docLabel) : 'Bon SARANGE'}
          </span>
          {clientLabel && stepIndex > 1 && <span className="hidden truncate sm:inline">· {clientLabel}</span>}
        </>
      }
      stepBar={
        stepIndex < 5 ? (
          <StepBar steps={STEPS} currentIndex={stepIndex} onStepClick={setStepIndex} />
        ) : null
      }
    >
      {stepIndex === 0 && (
        <div className="mx-auto max-w-2xl duration-300 animate-in fade-in">
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-2xl bg-orange-100 p-3 text-orange-600">
              <ClipboardCheck size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 sm:text-2xl">Quelle prestation ?</h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                Choisissez ce que SARANGE vient de réaliser pour vous : le bon à signer s&apos;adapte.
              </p>
            </div>
          </div>

          <div className={`space-y-3 ${showMissing && !docType ? 'rounded-2xl ring-4 ring-amber-500/10' : ''}`}>
            {DOC_TYPE_OPTIONS.map(({ id, label, description, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setDocType(id);
                  setStepError('');
                }}
                className={`flex w-full items-center gap-4 rounded-2xl border-2 bg-white px-6 py-5 text-left transition-colors ${
                  docType === id
                    ? 'border-orange-400 bg-orange-50 text-orange-700'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon size={26} className={docType === id ? 'text-orange-500' : 'text-slate-400'} />
                <span>
                  <span className="block text-base font-bold">{label}</span>
                  <span className="block text-sm font-medium text-slate-500">{description}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-6">
            <StepAlert message={stepError} />
          </div>

          <div className="mt-2 flex justify-center">
            <button type="button" onClick={handleContinueDocType} className={continueButtonClass(Boolean(docType))}>
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
              <UserRound size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 sm:text-2xl">Vos coordonnées</h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                Merci de renseigner vos informations pour ce {docLabel}.
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
                  className={inputClassName + missingFieldClass('nom')}
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
                  className={inputClassName + missingFieldClass('prenom')}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-slate-500">
                  {addressLabel}
                </label>
                <div className={isFieldMissing('adresse') ? 'rounded-xl ring-4 ring-amber-500/10' : ''}>
                  <AddressAutocomplete
                    value={contact.adresse}
                    onChange={(value) => {
                      setContact((prev) => ({ ...prev, adresse: value }));
                      setStepError('');
                    }}
                    onSelect={({ label, ville }) => setContact((prev) => ({ ...prev, adresse: label, ville }))}
                    placeholder="Numéro et nom de rue, ville…"
                  />
                </div>
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
                  onChange={updatePhone}
                  onBlur={blurPhone}
                  inputMode="tel"
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

          <div className="mt-6">
            <StepAlert message={stepError} />
          </div>

          <div className="mt-2 flex items-center justify-between">
            <button type="button" onClick={() => setStepIndex(0)} className={backButtonClass}>
              <ArrowLeft size={16} />
              Retour
            </button>
            <button type="button" onClick={handleContinueContact} className={continueButtonClass(contactComplete)}>
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
              <ClipboardCheck size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 sm:text-2xl">{validationTitle}</h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">{validationQuestion}</p>
            </div>
          </div>

          <div className={`space-y-3 ${showMissing && !validationChoice ? 'rounded-2xl ring-4 ring-amber-500/10' : ''}`}>
            <button
              type="button"
              onClick={() => {
                setValidationChoice('ok');
                setStepError('');
              }}
              className={`flex w-full items-center gap-4 rounded-2xl border-2 bg-white px-6 py-5 text-left text-base font-bold transition-colors ${
                validationChoice === 'ok'
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              <span className="text-2xl">✓</span> {validationOkLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                setValidationChoice('warn');
                setStepError('');
              }}
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
                max={8}
                uploadContext={{ uploadId: photoUploadId, onUploadId: setPhotoUploadId }}
              />
            </>
          )}

          <div className="mt-4">
            <StepAlert message={stepError} />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button type="button" onClick={() => setStepIndex(1)} className={backButtonClass}>
              <ArrowLeft size={16} />
              Retour
            </button>
            <button
              type="button"
              onClick={handleContinueValidation}
              className={continueButtonClass(Boolean(validationChoice))}
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

          <div className="mt-4 flex items-center justify-between">
            <button type="button" onClick={() => setStepIndex(2)} className={backButtonClass}>
              <ArrowLeft size={16} />
              Retour
            </button>
            <button type="button" onClick={handleContinueRatings} className={continueButtonClass(allRated)}>
              Continuer
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {stepIndex === 4 && (
        <div className="mx-auto max-w-2xl duration-300 animate-in fade-in">
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-2xl bg-orange-100 p-3 text-orange-600">
              <PenLine size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 sm:text-2xl">Récapitulatif &amp; signature</h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">{recapSubtitle}</p>
            </div>
          </div>

          {hasReserves ? (
            <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-800">
              <p className="text-base font-bold">{recapWord} avec réserve</p>
              <p className="mt-1.5 text-sm leading-6">{recapWarnDetail}</p>
              {validationComment && (
                <p className="mt-3 rounded-xl bg-white/60 px-3.5 py-2 text-sm">{validationComment}</p>
              )}
            </div>
          ) : (
            <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-800">
              <p className="text-base font-bold">{recapWord} sans réserve</p>
              <p className="mt-1.5 text-sm">{recapOkDetail}</p>
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
              {confirmationText} <strong>{hasReserves ? 'avec réserve' : 'sans réserve'}</strong>
            </span>
          </label>

          <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Votre signature</p>
          <div className={showMissing && !signatureDataUrl ? 'rounded-2xl ring-4 ring-amber-500/15' : ''}>
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

          <div className="mt-4 flex items-center justify-between">
            <button type="button" onClick={() => setStepIndex(3)} className={backButtonClass}>
              <ArrowLeft size={16} />
              Retour
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className={`${continueButtonClass(Boolean(confirmed && signatureDataUrl))} disabled:opacity-50`}
            >
              {submitting && <Loader2 size={17} className="animate-spin" />}
              Signer et envoyer
            </button>
          </div>
        </div>
      )}

      {stepIndex === 5 && <FinalScreen result={result} />}
    </PageShell>
  );
}
