'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Inbox,
  Loader2,
  Lock,
  Mail,
  Paperclip,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react';

import AppShell from '@/components/AppShell';
import { useFirebaseAuth } from '@/components/FirebaseProvider';
import {
  DEMANDE_STATUSES,
  EXCLUDED_STATUS,
  HOUSING_AGE_LABELS,
  LINE_CATEGORY_LABELS,
  PRESTATION_LABELS,
  REQUESTER_TYPE_LABELS,
  confidenceLabel,
  demandeStatusLabel,
  isPublicMailboxDomain,
  toDemandeListItem,
} from '@/lib/demandes.mjs';

/**
 * Page /demande : demandes de devis reçues par e-mail, détectées par le scan
 * Apps Script de la boîte contact@sarange.fr et rangées par le serveur.
 * Réservée aux administrateurs (rôle vérifié par les routes /api/demandes/*).
 *
 * Trois actions par demande : ouvrir le fil dans Gmail, lancer l'analyse IA
 * (Gemini gratuit ou Claude selon la clé configurée : normalisation, infos
 * manquantes, message de relance), créer la fiche client. Jamais d'envoi
 * automatique au demandeur.
 *
 * Mobile d'abord : cartes, panneau de détail en feuille basse ; sur desktop le
 * panneau glisse depuis la droite.
 */

const STATUS_STYLES = {
  nouvelle: 'bg-amber-50 text-amber-700 border-amber-200',
  'a-chiffrer': 'bg-orange-50 text-orange-700 border-orange-200',
  'devis-envoye': 'bg-sky-50 text-sky-700 border-sky-200',
  'sans-suite': 'bg-slate-100 text-slate-500 border-slate-200',
  exclue: 'bg-rose-50 text-rose-600 border-rose-200',
};

// Statuts proposés dans le sélecteur du panneau : l'exclusion a son bouton.
const SELECTABLE_STATUSES = DEMANDE_STATUSES.filter((status) => status.value !== EXCLUDED_STATUS);

const CONFIDENCE_STYLES = {
  haute: 'bg-emerald-50 text-emerald-700',
  moyenne: 'bg-amber-50 text-amber-700',
  basse: 'bg-rose-50 text-rose-700',
};

const PRIORITY_STYLES = {
  haute: 'bg-rose-50 text-rose-700',
  normale: 'bg-slate-100 text-slate-600',
  basse: 'bg-slate-50 text-slate-400',
};

const FILTERS = [
  { value: 'nouvelle', label: 'Nouvelles' },
  { value: 'a-chiffrer', label: 'À chiffrer' },
  { value: 'devis-envoye', label: 'Devis envoyés' },
  { value: 'sans-suite', label: 'Sans suite' },
  { value: 'toutes', label: 'Toutes' },
  { value: EXCLUDED_STATUS, label: 'Exclues' },
];

const formatDate = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatSize = (bytes) => {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
  if (value >= 1024) return `${Math.round(value / 1024)} Ko`;
  return `${value} o`;
};

const normalizeSearch = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const Badge = ({ className = '', children }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${className}`}
  >
    {children}
  </span>
);

const SectionTitle = ({ children }) => (
  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{children}</p>
);

const Field = ({ label, value }) =>
  value ? (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="break-words text-sm text-slate-800">{value}</p>
    </div>
  ) : null;

/* ─── Message d'un fil (replié au-delà de quelques lignes) ───────────────── */
function MessageCard({ message, index }) {
  const [expanded, setExpanded] = useState(index === 0);
  const body = message.body || '';
  const isLong = body.length > 700;
  const shown = expanded || !isLong ? body : `${body.slice(0, 700)}…`;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-semibold text-slate-700">
          {message.fromName || message.from}
          {message.fromName && <span className="font-normal text-slate-400"> · {message.from}</span>}
        </p>
        <p className="text-[11px] text-slate-400">{formatDate(message.date)}</p>
      </div>
      <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-700">
        {shown || '(message vide)'}
      </pre>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-orange-600"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? 'Réduire' : 'Lire la suite'}
        </button>
      )}
      {message.attachments?.length > 0 && (
        <ul className="mt-3 space-y-1">
          {message.attachments.map((attachment, attachmentIndex) => (
            <li
              key={`${attachment.name}-${attachmentIndex}`}
              className="flex items-center gap-2 text-xs text-slate-600"
            >
              <Paperclip size={12} className="shrink-0 text-slate-400" />
              <span className="min-w-0 truncate">{attachment.name}</span>
              <span className="shrink-0 text-slate-400">{formatSize(attachment.size)}</span>
              {attachment.analyzable ? (
                <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 text-[10px] font-bold text-emerald-600">
                  lue par l’analyse
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">
                  à voir dans Gmail
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Résultat de l'analyse Claude ───────────────────────────────────────── */
function AnalysisPanel({ analysis, meta, onCopy, copied }) {
  const dimension = (line) =>
    line.largeurMm || line.hauteurMm ? `${line.largeurMm || '?'} × ${line.hauteurMm || '?'} mm` : '';
  const requester = analysis.demandeur;
  const chantier = analysis.chantier;
  const exigences = analysis.exigences;
  const hasExigences =
    exigences.uwMax || exigences.swMax || exigences.swMin || exigences.delai || exigences.budget || exigences.autres.length;

  return (
    <div className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-sm font-bold text-violet-800">
          <Sparkles size={16} />
          Analyse IA
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={PRIORITY_STYLES[analysis.priorite] || PRIORITY_STYLES.normale}>
            Priorité {analysis.priorite}
          </Badge>
          <Badge className="bg-white text-slate-500">Confiance {analysis.confiance} %</Badge>
        </div>
      </div>

      {!analysis.estDemandeDevis && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>Claude ne pense pas que ce fil soit une demande de devis. {analysis.resume}</p>
        </div>
      )}

      {analysis.estDemandeDevis && analysis.resume && (
        <p className="text-sm font-medium leading-relaxed text-slate-800">{analysis.resume}</p>
      )}
      {analysis.prochaineAction && (
        <p className="rounded-xl bg-white p-3 text-sm text-slate-700">
          <span className="font-bold text-slate-900">Prochaine action : </span>
          {analysis.prochaineAction}
          {analysis.prioriteRaison && (
            <span className="block pt-1 text-xs text-slate-400">{analysis.prioriteRaison}</span>
          )}
        </p>
      )}

      {analysis.estDemandeDevis && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-xl bg-white p-3">
              <SectionTitle>Demandeur</SectionTitle>
              <Field label="Type" value={REQUESTER_TYPE_LABELS[requester.type]} />
              <Field label="Société" value={requester.societe} />
              <Field label="Nom" value={[requester.prenom, requester.nom].filter(Boolean).join(' ')} />
              <Field label="Téléphone" value={requester.telephone} />
              <Field label="E-mail" value={requester.email} />
            </div>
            <div className="space-y-2 rounded-xl bg-white p-3">
              <SectionTitle>Chantier</SectionTitle>
              <Field label="Adresse" value={chantier.adresse} />
              <Field label="Ville" value={[chantier.codePostal, chantier.ville].filter(Boolean).join(' ')} />
              <Field label="Précisions" value={chantier.complement} />
              <Field label="Prestation" value={PRESTATION_LABELS[analysis.prestation]} />
              <Field label="Dépose" value={analysis.deposeExistant ? 'Dépose de l’existant comprise' : ''} />
              <Field
                label="Logement"
                value={analysis.logementAnciennete !== 'inconnu' ? HOUSING_AGE_LABELS[analysis.logementAnciennete] : ''}
              />
            </div>
          </div>

          {analysis.lignes.length > 0 && (
            <div className="rounded-xl bg-white p-3">
              <SectionTitle>Lignes à chiffrer ({analysis.lignes.length})</SectionTitle>
              <div className="mt-2 -mx-3 overflow-x-auto px-3">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                      <th className="py-1 pr-2">Qté</th>
                      <th className="py-1 pr-2">Désignation</th>
                      <th className="py-1 pr-2">Matériau · couleur</th>
                      <th className="py-1 pr-2">L × H</th>
                      <th className="py-1 pr-2">Ouverture</th>
                      <th className="py-1 pr-2">Vitrage · options</th>
                      <th className="py-1">Pièce · note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analysis.lignes.map((line, index) => (
                      <tr key={index} className="align-top text-slate-700">
                        <td className="py-2 pr-2 font-bold">{line.quantite}</td>
                        <td className="py-2 pr-2">
                          <p className="font-semibold text-slate-900">{line.designation || LINE_CATEGORY_LABELS[line.categorie]}</p>
                          <p className="text-[11px] text-slate-400">{LINE_CATEGORY_LABELS[line.categorie]}</p>
                        </td>
                        <td className="py-2 pr-2">
                          {[line.materiau !== 'inconnu' ? line.materiau.toUpperCase() : '', line.couleur]
                            .filter(Boolean)
                            .join(' · ')}
                        </td>
                        <td className="py-2 pr-2 whitespace-nowrap">{dimension(line)}</td>
                        <td className="py-2 pr-2">
                          {[line.vantaux ? `${line.vantaux} vantail${line.vantaux > 1 ? 'x' : ''}` : '', line.ouverture]
                            .filter(Boolean)
                            .join(' · ')}
                        </td>
                        <td className="py-2 pr-2">
                          {[line.vitrage, ...line.options].filter(Boolean).join(' · ')}
                        </td>
                        <td className="py-2">
                          {line.piece && <p>{line.piece}</p>}
                          {line.commentaire && <p className="text-[11px] text-slate-500">{line.commentaire}</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {hasExigences ? (
            <div className="rounded-xl bg-white p-3">
              <SectionTitle>Exigences</SectionTitle>
              <div className="mt-2 flex flex-wrap gap-2">
                {exigences.uwMax ? <Badge className="bg-slate-100 text-slate-700">Uw ≤ {exigences.uwMax}</Badge> : null}
                {exigences.swMax ? <Badge className="bg-slate-100 text-slate-700">Sw ≤ {exigences.swMax}</Badge> : null}
                {exigences.swMin ? <Badge className="bg-slate-100 text-slate-700">Sw ≥ {exigences.swMin}</Badge> : null}
                {exigences.delai ? <Badge className="bg-slate-100 text-slate-700">Délai : {exigences.delai}</Badge> : null}
                {exigences.budget ? <Badge className="bg-slate-100 text-slate-700">Budget : {exigences.budget}</Badge> : null}
                {exigences.autres.map((entry) => (
                  <Badge key={entry} className="bg-slate-100 text-slate-700">
                    {entry}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {analysis.piecesJointes.length > 0 && (
            <div className="rounded-xl bg-white p-3">
              <SectionTitle>Pièces jointes</SectionTitle>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {analysis.piecesJointes.map((entry, index) => (
                  <li key={`${entry.nom}-${index}`} className="flex items-start gap-2">
                    <Paperclip size={14} className="mt-0.5 shrink-0 text-slate-400" />
                    <span>
                      <span className="font-semibold">{entry.nom}</span>
                      <span className="text-slate-400"> · {entry.nature}</span>
                      {entry.contenuUtile && <span className="block text-xs text-slate-500">{entry.contenuUtile}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(analysis.infosManquantes.length > 0 || analysis.questionsAPoser.length > 0) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <SectionTitle>Il manque</SectionTitle>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                {analysis.infosManquantes.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
              {analysis.questionsAPoser.length > 0 && (
                <>
                  <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-amber-700">Questions à poser</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-900">
                    {analysis.questionsAPoser.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {analysis.messageRelance && (
            <div className="rounded-xl bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <SectionTitle>Message de relance proposé</SectionTitle>
                <button
                  type="button"
                  onClick={() => onCopy(analysis.messageRelance)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                  {copied ? 'Copié' : 'Copier'}
                </button>
              </div>
              <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-700">
                {analysis.messageRelance}
              </pre>
              <p className="mt-2 text-[11px] text-slate-400">
                À coller dans votre réponse Gmail après relecture. Rien n’est envoyé automatiquement.
              </p>
            </div>
          )}
        </>
      )}

      {meta && (
        <p className="text-[11px] text-slate-400">
          Analysé le {formatDate(meta.analyzedAt)}
          {meta.analyzedBy ? ` par ${meta.analyzedBy}` : ''} · {meta.model}
          {meta.inputTokens ? ` · ${meta.inputTokens.toLocaleString('fr-FR')} jetons lus` : ''}
        </p>
      )}
    </div>
  );
}

/* ─── « Pas une demande » : fil seul, expéditeur, domaine ─────────────────── */
function ExcludeChooser({ demande, pending, onExclude, onCancel }) {
  const email = demande.from.email;
  const domain = demande.from.domain || email.split('@')[1] || '';
  const domainAllowed = Boolean(domain) && !isPublicMailboxDomain(domain);
  const optionClass =
    'flex w-full items-start gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-rose-50 disabled:opacity-50';
  return (
    <div className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50/60 p-3">
      <p className="text-sm font-semibold text-rose-800">
        Exclure cette fausse demande. Elle ne réapparaîtra pas, même si le fil reçoit un nouveau message.
      </p>
      <button type="button" disabled={Boolean(pending)} onClick={() => onExclude({})} className={optionClass}>
        <Ban size={16} className="mt-0.5 shrink-0 text-rose-500" />
        <span>
          <span className="font-semibold">Ce fil seulement</span>
          <span className="block text-xs text-slate-500">Les prochains e-mails de cet expéditeur seront encore examinés.</span>
        </span>
      </button>
      <button
        type="button"
        disabled={Boolean(pending)}
        onClick={() => onExclude({ blockSender: true })}
        className={optionClass}
      >
        <Ban size={16} className="mt-0.5 shrink-0 text-rose-500" />
        <span>
          <span className="font-semibold">Et tout ce qui vient de {email}</span>
          <span className="block text-xs text-slate-500">Plus jamais proposé pour cette adresse (liste des expéditeurs exclus, modifiable).</span>
        </span>
      </button>
      {domainAllowed && (
        <button
          type="button"
          disabled={Boolean(pending)}
          onClick={() => onExclude({ blockSender: true, blockDomain: true })}
          className={optionClass}
        >
          <Ban size={16} className="mt-0.5 shrink-0 text-rose-500" />
          <span>
            <span className="font-semibold">Et tout le domaine @{domain}</span>
            <span className="block text-xs text-slate-500">Pour un fournisseur ou une société qui n’est jamais cliente.</span>
          </span>
        </button>
      )}
      <button type="button" onClick={onCancel} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
        Annuler
      </button>
    </div>
  );
}

/* ─── Panneau de détail ──────────────────────────────────────────────────── */
function DetailDrawer({
  isOpen,
  demande,
  loading,
  pending,
  error,
  analysisConfigured,
  analysisProvider,
  notesDraft,
  onNotesChange,
  onSaveNotes,
  onStatusChange,
  onAnalyze,
  onCreateClient,
  onExclude,
  onClose,
}) {
  const [copied, setCopied] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [excluding, setExcluding] = useState(false);
  // Changement de demande : repli des états locaux, ajustés pendant le rendu
  // (pas d'effet) comme le recommande React.
  const [trackedId, setTrackedId] = useState(demande?.id || '');
  if ((demande?.id || '') !== trackedId) {
    setTrackedId(demande?.id || '');
    setCopied(false);
    setShowHints(false);
    setExcluding(false);
  }
  const isExcluded = demande?.status === EXCLUDED_STATUS;

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : l'utilisateur peut sélectionner le texte.
    }
  };

  const displayName = demande
    ? demande.analysis?.demandeur?.societe ||
      [demande.analysis?.demandeur?.prenom, demande.analysis?.demandeur?.nom].filter(Boolean).join(' ') ||
      demande.from.name ||
      demande.from.email
    : '';

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Détail de la demande"
        className={`fixed z-50 flex flex-col bg-slate-50 shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          inset-x-0 bottom-0 max-h-[92vh] rounded-t-3xl
          lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[640px] lg:max-h-none lg:rounded-none
          ${isOpen ? 'translate-y-0 lg:translate-x-0' : 'translate-y-full lg:translate-y-0 lg:translate-x-full'}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-slate-900">{displayName || 'Demande'}</h3>
            {demande && (
              <p className="truncate text-xs text-slate-500">
                {demande.subject || '(sans objet)'} · {formatDate(demande.receivedAt)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-6">
          {loading || !demande ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={CONFIDENCE_STYLES[demande.hints.confidence]}>
                  {confidenceLabel(demande.hints.confidence)}
                </Badge>
                {demande.inSpam && (
                  <Badge className="bg-rose-50 text-rose-700">
                    <ShieldAlert size={11} />
                    Était en courrier indésirable
                  </Badge>
                )}
                {demande.hasNewMessages && <Badge className="bg-sky-50 text-sky-700">Nouveau message</Badge>}
                {demande.analysis?.demandeur?.type && demande.analysis.demandeur.type !== 'inconnu' && (
                  <Badge className="bg-slate-100 text-slate-600">
                    {REQUESTER_TYPE_LABELS[demande.analysis.demandeur.type]}
                  </Badge>
                )}
                <span className="text-xs text-slate-400">
                  {demande.from.email}
                  {demande.messageCount > 1 ? ` · ${demande.messageCount} messages` : ''}
                </span>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {isExcluded && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  <p className="inline-flex items-center gap-2">
                    <Ban size={16} className="shrink-0" />
                    Exclue le {formatDate(demande.excludedAt) || '?'}
                    {demande.excludedBy ? ` par ${demande.excludedBy}` : ''}. Le scan ne la remettra pas dans la liste.
                  </p>
                  <button
                    type="button"
                    onClick={() => onStatusChange('nouvelle')}
                    disabled={Boolean(pending)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                  >
                    <RotateCcw size={13} />
                    Rétablir
                  </button>
                </div>
              )}

              {excluding && !isExcluded && (
                <ExcludeChooser
                  demande={demande}
                  pending={pending}
                  onExclude={(options) => {
                    setExcluding(false);
                    onExclude(options);
                  }}
                  onCancel={() => setExcluding(false)}
                />
              )}

              <div className="grid gap-2 sm:grid-cols-3">
                <a
                  href={demande.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Mail size={16} />
                  Ouvrir dans Gmail
                  <ExternalLink size={13} className="text-slate-400" />
                </a>
                <button
                  type="button"
                  onClick={onAnalyze}
                  disabled={Boolean(pending) || !analysisConfigured}
                  title={
                    analysisConfigured
                      ? `Normalise la demande (lignes à chiffrer, infos manquantes, relance) avec ${analysisProvider || 'l’IA'}`
                      : 'Analyse non configurée : renseignez GEMINI_API_KEY (gratuit) ou ANTHROPIC_API_KEY sur Vercel'
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending === 'analyze' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {pending === 'analyze'
                    ? 'Analyse en cours…'
                    : demande.analysis
                      ? 'Relancer l’analyse'
                      : 'Analyser avec l’IA'}
                </button>
                {demande.clientId ? (
                  <Link
                    href="/clients"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                  >
                    <Check size={16} />
                    Fiche client créée
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={onCreateClient}
                    disabled={Boolean(pending)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    {pending === 'create-client' ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                    Créer la fiche client
                  </button>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <SectionTitle>Statut</SectionTitle>
                  {!isExcluded && !excluding && (
                    <button
                      type="button"
                      onClick={() => setExcluding(true)}
                      disabled={Boolean(pending)}
                      title="Fausse demande : fournisseur, démarchage, facture…"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                    >
                      <Ban size={13} />
                      Pas une demande
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SELECTABLE_STATUSES.map((status) => {
                    const active = demande.status === status.value;
                    return (
                      <button
                        key={status.value}
                        type="button"
                        onClick={() => onStatusChange(status.value)}
                        disabled={Boolean(pending)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                          active ? STATUS_STYLES[status.value] : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {status.label}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-3 block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Notes internes</span>
                  <textarea
                    value={notesDraft}
                    onChange={(event) => onNotesChange(event.target.value)}
                    onBlur={onSaveNotes}
                    rows={2}
                    placeholder="Rappelé le…, attend les cotes…"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-200 sm:text-sm"
                  />
                </label>
              </div>

              {demande.analysis && (
                <AnalysisPanel
                  analysis={demande.analysis}
                  meta={demande.analysisMeta}
                  onCopy={copyText}
                  copied={copied}
                />
              )}

              <div>
                <button
                  type="button"
                  onClick={() => setShowHints((value) => !value)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500"
                >
                  {showHints ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  Indices du tri automatique (score {demande.hints.score})
                </button>
                {showHints && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {demande.hints.matched.map((entry) => (
                      <Badge key={entry} className="bg-slate-100 text-slate-600">
                        {entry}
                      </Badge>
                    ))}
                    {demande.hints.dimensions.map((entry) => (
                      <Badge key={`dim-${entry}`} className="bg-white text-slate-500 ring-1 ring-slate-200">
                        {entry}
                      </Badge>
                    ))}
                    {demande.hints.phones.map((entry) => (
                      <Badge key={`tel-${entry}`} className="bg-white text-slate-500 ring-1 ring-slate-200">
                        {entry}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <SectionTitle>Fil d’e-mails</SectionTitle>
                {demande.messages.map((message, index) => (
                  <MessageCard key={message.id || index} message={message} index={index} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function DemandesPage() {
  const { user, access } = useFirebaseAuth();
  const isAdmin = Boolean(user) && access?.isAdmin === true;

  const [items, setItems] = useState([]);
  const [blocklist, setBlocklist] = useState({ emails: [], domains: [] });
  const [analysisConfigured, setAnalysisConfigured] = useState(true);
  const [analysisProvider, setAnalysisProvider] = useState('');
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [filter, setFilter] = useState('nouvelle');
  const [search, setSearch] = useState('');

  const [selectedId, setSelectedId] = useState('');
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [pending, setPending] = useState('');
  const [notesDraft, setNotesDraft] = useState('');

  const authFetch = useCallback(
    async (path, init = {}) => {
      if (!user) throw new Error('Connexion requise.');
      const idToken = await user.getIdToken();
      return fetch(path, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
          ...(init.headers || {}),
        },
      });
    },
    [user]
  );

  const readJson = async (response, fallback) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || fallback);
    return payload;
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const payload = await readJson(await authFetch('/api/demandes'), 'Impossible de charger les demandes.');
      setItems(Array.isArray(payload.demandes) ? payload.demandes : []);
      if (payload.blocklist) setBlocklist(payload.blocklist);
      setAnalysisConfigured(payload.analysisConfigured !== false);
      setAnalysisProvider(typeof payload.analysisProvider === 'string' ? payload.analysisProvider : '');
    } catch (error) {
      setListError(error.message);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (isAdmin) void loadList();
  }, [isAdmin, loadList]);

  const replaceInList = useCallback((demande) => {
    const item = toDemandeListItem(demande);
    setItems((current) => {
      const index = current.findIndex((entry) => entry.id === item.id);
      if (index === -1) return [item, ...current];
      const next = [...current];
      next[index] = item;
      return next;
    });
  }, []);

  const openDemande = async (id) => {
    setSelectedId(id);
    setSelected(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const payload = await readJson(
        await authFetch(`/api/demandes?id=${encodeURIComponent(id)}`),
        'Impossible de charger cette demande.'
      );
      setSelected(payload.demande);
      setNotesDraft(payload.demande?.notes || '');
      if (payload.demande?.hasNewMessages) {
        // Ouvrir la demande acquitte le « nouveau message » (mise à jour vide).
        void runAction('ack', { action: 'update', id, data: {} }, { silent: true });
      }
    } catch (error) {
      setDetailError(error.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDrawer = () => {
    setSelectedId('');
    setSelected(null);
    setDetailError('');
  };

  const runAction = async (name, body, { silent = false } = {}) => {
    if (!silent) {
      setPending(name);
      setDetailError('');
    }
    try {
      const path = name === 'analyze' ? '/api/demandes/analyze' : '/api/demandes';
      const payload = await readJson(
        await authFetch(path, { method: 'POST', body: JSON.stringify(body) }),
        'Action impossible.'
      );
      if (payload.demande) {
        setSelected(payload.demande);
        setNotesDraft((current) => (name === 'ack' ? current : payload.demande.notes ?? current));
        replaceInList(payload.demande);
      }
      if (payload.blocklist) setBlocklist(payload.blocklist);
      return payload;
    } catch (error) {
      if (!silent) setDetailError(error.message);
      return null;
    } finally {
      if (!silent) setPending('');
    }
  };

  const counts = useMemo(() => {
    const result = { toutes: 0 };
    for (const item of items) {
      result[item.status] = (result[item.status] || 0) + 1;
      if (item.status !== EXCLUDED_STATUS) result.toutes += 1;
    }
    return result;
  }, [items]);

  const blockedEntries = useMemo(
    () => [
      ...blocklist.domains.map((domain) => ({ key: `d-${domain}`, label: `@${domain}`, data: { domain } })),
      ...blocklist.emails.map((email) => ({ key: `e-${email}`, label: email, data: { email } })),
    ],
    [blocklist]
  );

  const visible = useMemo(() => {
    const term = normalizeSearch(search.trim());
    return items.filter((item) => {
      // « Toutes » ne montre pas les exclues : elles ont leur onglet.
      if (filter === 'toutes' ? item.status === EXCLUDED_STATUS : item.status !== filter) return false;
      if (!term) return true;
      const haystack = normalizeSearch(
        [item.displayName, item.from.email, item.subject, item.summary, item.city, item.notes].join(' ')
      );
      return haystack.includes(term);
    });
  }, [items, filter, search]);

  let content;
  if (!user || (access?.checked && !isAdmin)) {
    content = (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <Lock size={28} className="mx-auto text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-700">Page réservée aux administrateurs.</p>
      </div>
    );
  } else if (!access?.checked) {
    content = (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  } else {
    content = (
      <div className="space-y-4">
        {!analysisConfigured && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p>
              L’analyse IA n’est pas configurée : ajoutez GEMINI_API_KEY (palier gratuit Google) ou
              ANTHROPIC_API_KEY sur Vercel. La détection et la liste fonctionnent, le bouton d’analyse reste
              désactivé.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {FILTERS.map((entry) => {
              const active = filter === entry.value;
              return (
                <button
                  key={entry.value}
                  type="button"
                  onClick={() => setFilter(entry.value)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                    active
                      ? 'border-orange-200 bg-orange-50 text-orange-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {entry.label}
                  <span className={`ml-1.5 ${active ? 'text-orange-400' : 'text-slate-300'}`}>
                    {counts[entry.value] || 0}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <label className="relative flex-1 sm:w-64">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nom, ville, objet…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-base outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-200 sm:text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void loadList()}
              disabled={loading}
              aria-label="Actualiser"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {listError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p>{listError}</p>
          </div>
        )}

        {filter === EXCLUDED_STATUS && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <SectionTitle>Expéditeurs exclus ({blockedEntries.length})</SectionTitle>
            <p className="mt-1 text-xs text-slate-500">
              Leurs e-mails ne sont plus jamais proposés. Retirer une entrée suffit pour les examiner à nouveau.
            </p>
            {blockedEntries.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {blockedEntries.map((entry) => (
                  <li
                    key={entry.key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 py-1 pl-3 pr-1 text-xs font-semibold text-rose-700"
                  >
                    {entry.label}
                    <button
                      type="button"
                      aria-label={`Retirer ${entry.label}`}
                      title="Retirer de la liste des exclus"
                      disabled={Boolean(pending)}
                      onClick={() => void runAction('blocklist-remove', { action: 'blocklist-remove', data: entry.data })}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-rose-400 transition-colors hover:bg-rose-100 hover:text-rose-700 disabled:opacity-50"
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-400">Aucun expéditeur exclu pour l’instant.</p>
            )}
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="flex justify-center py-16 text-slate-400">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
            <Inbox size={28} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-600">Aucune demande ici.</p>
            <p className="mt-1 text-xs text-slate-400">
              Les fils détectés par le scan de la boîte contact@sarange.fr apparaissent toutes les 15 minutes.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void openDemande(item.id)}
                  className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition-all hover:border-orange-200 hover:shadow ${
                    selectedId === item.id ? 'border-orange-300 ring-2 ring-orange-100' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {item.displayName}
                        {item.city && <span className="font-normal text-slate-400"> · {item.city}</span>}
                      </p>
                      <p className="truncate text-xs text-slate-500">{item.subject || '(sans objet)'}</p>
                    </div>
                    <p className="shrink-0 text-[11px] text-slate-400">{formatDate(item.lastMessageAt || item.receivedAt)}</p>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-700">{item.summary}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Badge className={`border ${STATUS_STYLES[item.status]}`}>{demandeStatusLabel(item.status)}</Badge>
                    {item.hints.confidence !== 'haute' && (
                      <Badge className={CONFIDENCE_STYLES[item.hints.confidence]}>
                        {confidenceLabel(item.hints.confidence)}
                      </Badge>
                    )}
                    {item.analyzed && (
                      <Badge className="bg-violet-50 text-violet-700">
                        <Sparkles size={10} />
                        Analysée
                      </Badge>
                    )}
                    {item.hasNewMessages && <Badge className="bg-sky-50 text-sky-700">Nouveau message</Badge>}
                    {item.inSpam && (
                      <Badge className="bg-rose-50 text-rose-700">
                        <ShieldAlert size={10} />
                        Spam
                      </Badge>
                    )}
                    {item.clientId && (
                      <Badge className="bg-emerald-50 text-emerald-700">
                        <Check size={10} />
                        Fiche client
                      </Badge>
                    )}
                    {item.attachmentCount > 0 && (
                      <Badge className="bg-slate-100 text-slate-500">
                        <Paperclip size={10} />
                        {item.attachmentCount}
                      </Badge>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <AppShell title="Demandes de devis" subtitle="Reçues par e-mail sur contact@sarange.fr, détectées automatiquement.">
      {content}
      <DetailDrawer
        isOpen={Boolean(selectedId)}
        demande={selected}
        loading={detailLoading}
        pending={pending}
        error={detailError}
        analysisConfigured={analysisConfigured}
        analysisProvider={analysisProvider}
        notesDraft={notesDraft}
        onNotesChange={setNotesDraft}
        onSaveNotes={() => {
          if (selected && notesDraft !== (selected.notes || '')) {
            void runAction('notes', { action: 'update', id: selected.id, data: { notes: notesDraft } });
          }
        }}
        onStatusChange={(status) => {
          if (selected && status !== selected.status) {
            void runAction('status', { action: 'update', id: selected.id, data: { status } });
          }
        }}
        onAnalyze={() => selected && void runAction('analyze', { id: selected.id })}
        onCreateClient={() => selected && void runAction('create-client', { action: 'create-client', id: selected.id })}
        onExclude={(options) => selected && void runAction('exclude', { action: 'exclude', id: selected.id, data: options })}
        onClose={closeDrawer}
      />
    </AppShell>
  );
}
