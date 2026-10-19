'use client';

// Suivi des devis envoyés (vue « Suivi des envois » de Mes devis), sur le
// modèle des relances de factures de sarange-finances : une ligne par devis,
// groupée par ce qu'il y a à faire. Relance due aujourd'hui, proposée au bon
// niveau (J+3, J+10, J+30) ; prochaines relances ; devis modifiés à renvoyer ;
// envois par e-mail simple (suivi manuel) ; sans réponse après trois relances.
// Rien ne part sans un clic : l'envoi passe par l'aperçu de vérification
// habituel (lib/quote-follow-up.mjs pour la logique, testée). Chaque devis
// peut être retiré du suivi (perdu, suivi en direct, ne plus relancer) et y
// être remis ; un nouvel envoi l'y remet de lui-même.

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BellRing, ChevronDown, Link2, Loader2, Pencil, PenSquare, RotateCcw, Send, X } from 'lucide-react';
import { getClientDisplayName } from '@/lib/client-cloud';
import { getQuoteNumberDisplay, getQuoteSignatureWorkflow } from '@/lib/quote-signature';
import {
  FOLLOW_UP_EXCLUSION_REASONS,
  QUOTE_REMINDER_STEPS,
  getFollowUpExclusionReason,
  getQuoteReminderStep,
  groupQuotesForFollowUp,
} from '@/lib/quote-follow-up.mjs';

const currencyFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const formatDay = (ms) => (ms ? dateFormatter.format(new Date(ms)) : '');

const getQuoteClient = (quote) =>
  quote.clientName || getClientDisplayName(quote.payload?.clientData) || 'Client à définir';

const getQuoteAmount = (quote) => {
  const workflow = getQuoteSignatureWorkflow(quote);
  return workflow.selectedVariantTotalTTC != null ? workflow.selectedVariantTotalTTC : quote.totalTTC || 0;
};

const getQuoteNumber = (quote) =>
  getQuoteNumberDisplay(quote.quoteNumber || getQuoteSignatureWorkflow(quote).quoteNumber || '');

const SMALL_BUTTON =
  'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-orange-300 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-50';
const PRIMARY_BUTTON =
  'inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50';

/** Frise des trois relances : faites, prochaine, à venir. */
function Steps({ state }) {
  return (
    <div className="flex gap-1" aria-hidden="true">
      {QUOTE_REMINDER_STEPS.map((step) => (
        <span
          key={step.level}
          title={step.label}
          className={`h-1.5 w-5 rounded-full ${
            step.level <= state.lastReminderLevel
              ? 'bg-slate-900'
              : step.level === state.nextLevel
                ? 'bg-orange-500'
                : 'bg-slate-200'
          }`}
        />
      ))}
    </div>
  );
}

function QuoteLine({ item, children, footer = null }) {
  const { quote, state } = item;
  const lastStep = getQuoteReminderStep(state.lastReminderLevel);
  const details = [
    `Devis n°${getQuoteNumber(quote)}`,
    `envoyé le ${formatDay(state.sentAtMs)}`,
    state.viewedAtMs ? `consulté le ${formatDay(state.viewedAtMs)}` : 'pas encore ouvert',
    lastStep ? `${lastStep.label} le ${formatDay(state.lastReminderAtMs)}` : '',
    state.linkExpired ? 'lien expiré (une relance le réactive)' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="border-t border-slate-100 px-4 py-3 first:border-t-0 sm:flex sm:flex-wrap sm:items-center sm:gap-4">
      <div className="flex items-start justify-between gap-3 sm:flex-1 sm:items-center">
        <div className="min-w-0 sm:flex-1">
          <p className="truncate text-sm font-bold text-slate-900">{getQuoteClient(quote)}</p>
          <p className="text-xs text-slate-500">{details}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[15px] font-black tabular-nums text-slate-900">
            {currencyFormatter.format(getQuoteAmount(quote))}
          </p>
          <p className={`text-xs font-semibold ${state.daysSinceSent >= 10 ? 'text-rose-600' : 'text-slate-500'}`}>
            J+{state.daysSinceSent}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 sm:mt-0 sm:shrink-0">
        <Steps state={state} />
        <div className="flex flex-wrap gap-1.5">{children}</div>
      </div>
      {footer}
    </div>
  );
}

/** Choix de la raison, sous la ligne, avant de retirer le devis du suivi. */
function RemovePanel({ busy, onPick, onCancel }) {
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:basis-full">
      <p className="mb-2 text-xs font-semibold text-slate-700">Retirer ce devis du suivi des relances :</p>
      <div className="flex flex-wrap gap-1.5">
        {FOLLOW_UP_EXCLUSION_REASONS.map((reason) => (
          <button
            key={reason.id}
            type="button"
            disabled={busy}
            onClick={() => onPick(reason.id)}
            title={reason.hint}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : null}
            {reason.label}
          </button>
        ))}
        <button type="button" disabled={busy} onClick={onCancel} className={SMALL_BUTTON}>
          Annuler
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Le devis reste dans « Mes devis ». Il revient ici de lui-même s&apos;il est renvoyé.
      </p>
    </div>
  );
}

function Section({ title, hint, items, children }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-1 text-[11px] font-black uppercase tracking-widest text-slate-500">
        {title} ({items.length})
      </h2>
      {hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{children}</div>
    </section>
  );
}

/**
 * @param {object} props
 * @param {object[]} props.quotes  devis de l'espace (tous statuts, filtrés ici)
 * @param {boolean} props.loading
 * @param {string|null} props.actionId  devis en cours d'action (bouton occupé)
 * @param {string|null} props.actionKind
 * @param {(quote: object, level: number) => void} props.onSendReminder
 * @param {(quote: object) => void} props.onSendForSignature
 * @param {(quote: object) => void} props.onCopySignatureLink
 * @param {(quote: object, reason: string|null) => Promise<void>} props.onSetExclusion
 *   retire le devis du suivi avec cette raison, ou l'y remet (null)
 */
export default function QuoteFollowUp({
  quotes,
  loading = false,
  actionId = null,
  actionKind = null,
  onSendReminder,
  onSendForSignature,
  onCopySignatureLink,
  onSetExclusion,
}) {
  const groups = useMemo(() => groupQuotesForFollowUp(quotes), [quotes]);
  const isWorking = (quote, kind) => actionId === quote.id && (!kind || actionKind === kind);
  // Devis dont on choisit la raison du retrait, devis en cours d'écriture,
  // section des retirés dépliée.
  const [removingId, setRemovingId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [showRemoved, setShowRemoved] = useState(false);

  const setExclusion = async (quote, reason) => {
    setSavingId(quote.id);
    try {
      await onSetExclusion(quote, reason);
      setRemovingId(null);
    } finally {
      setSavingId(null);
    }
  };

  const removeButton = (quote) => (
    <button
      type="button"
      onClick={() => setRemovingId((current) => (current === quote.id ? null : quote.id))}
      className={SMALL_BUTTON}
      title="Retirer du suivi des relances"
      aria-expanded={removingId === quote.id}
    >
      <X size={12} /> Retirer
    </button>
  );
  const removePanel = (quote) =>
    removingId === quote.id ? (
      <RemovePanel
        busy={savingId === quote.id}
        onPick={(reason) => setExclusion(quote, reason)}
        onCancel={() => setRemovingId(null)}
      />
    ) : null;

  const openLink = (quote) => (
    <Link href={`/?quote=${quote.id}`} className={SMALL_BUTTON}>
      <Pencil size={12} /> Ouvrir
    </Link>
  );
  const copyButton = (quote) => (
    <button
      type="button"
      onClick={() => onCopySignatureLink(quote)}
      className={SMALL_BUTTON}
      title="Copier le lien de signature (WhatsApp, SMS…)"
    >
      <Link2 size={12} /> Lien
    </button>
  );
  const reminderButton = (quote, level, label, primary = true) => (
    <button
      type="button"
      disabled={Boolean(actionId)}
      onClick={() => onSendReminder(quote, level)}
      className={primary ? PRIMARY_BUTTON : SMALL_BUTTON}
      title="Aperçu de l'e-mail avant envoi"
    >
      {isWorking(quote, `reminder-${level}`) ? <Loader2 size={12} className="animate-spin" /> : <BellRing size={12} />}
      {label} ▸
    </button>
  );
  const resendButton = (quote, label) => (
    <button
      type="button"
      disabled={Boolean(actionId)}
      onClick={() => onSendForSignature(quote)}
      className={PRIMARY_BUTTON}
      title="Aperçu de l'e-mail avant envoi"
    >
      {isWorking(quote) ? <Loader2 size={12} className="animate-spin" /> : <PenSquare size={12} />}
      {label}
    </button>
  );

  if (!loading && !groups.count && !groups.removed.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Send size={24} />
        </div>
        <h3 className="text-base font-bold text-slate-900">Aucun devis en attente de signature</h3>
        <p className="mt-2 text-sm text-slate-500">
          Les devis envoyés apparaissent ici avec la relance à faire, jusqu&apos;à leur signature.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Section
        title="À relancer aujourd'hui"
        hint="La relance proposée suit l'ancienneté de l'envoi (J+3, J+10, J+30). L'aperçu de l'e-mail s'affiche avant tout envoi."
        items={groups.due}
      >
        {groups.due.map((item) => (
          <QuoteLine key={item.quote.id} item={item} footer={removePanel(item.quote)}>
            {reminderButton(item.quote, item.state.nextLevel, item.state.nextLabel)}
            {copyButton(item.quote)}
            {openLink(item.quote)}
            {removeButton(item.quote)}
          </QuoteLine>
        ))}
      </Section>

      <Section title="Prochaines relances" items={groups.upcoming}>
        {groups.upcoming.map((item) => (
          <QuoteLine key={item.quote.id} item={item} footer={removePanel(item.quote)}>
            <span className="text-xs text-slate-500">
              {item.state.nextLabel} le <strong>{formatDay(item.state.nextDateMs)}</strong>
            </span>
            {copyButton(item.quote)}
            {openLink(item.quote)}
            {removeButton(item.quote)}
          </QuoteLine>
        ))}
      </Section>

      <Section
        title="À renvoyer"
        hint="Devis modifiés depuis leur envoi : le client doit recevoir la nouvelle version avant toute relance."
        items={groups.resend}
      >
        {groups.resend.map((item) => (
          <QuoteLine key={item.quote.id} item={item} footer={removePanel(item.quote)}>
            {resendButton(item.quote, 'Renvoyer pour signature')}
            {openLink(item.quote)}
            {removeButton(item.quote)}
          </QuoteLine>
        ))}
      </Section>

      <Section
        title="Envoyés par e-mail simple"
        hint="PDF joint sans lien de signature : relance de vive voix, ou nouvel envoi pour signature en ligne."
        items={groups.emailOnly}
      >
        {groups.emailOnly.map((item) => (
          <QuoteLine key={item.quote.id} item={item} footer={removePanel(item.quote)}>
            {resendButton(item.quote, 'Envoyer pour signature')}
            {openLink(item.quote)}
            {removeButton(item.quote)}
          </QuoteLine>
        ))}
      </Section>

      <Section
        title="Sans réponse après trois relances"
        hint="Une relance de plus reste possible ; sinon le devis attend ici, ou se range depuis sa fiche."
        items={groups.unanswered}
      >
        {groups.unanswered.map((item) => (
          <QuoteLine key={item.quote.id} item={item} footer={removePanel(item.quote)}>
            {reminderButton(item.quote, 3, 'Relancer encore', false)}
            {copyButton(item.quote)}
            {openLink(item.quote)}
            {removeButton(item.quote)}
          </QuoteLine>
        ))}
      </Section>

      {!groups.count && (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          Aucun devis à relancer.
        </p>
      )}

      {groups.removed.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowRemoved((open) => !open)}
            aria-expanded={showRemoved}
            className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-400 transition-colors hover:text-slate-600"
          >
            Retirés du suivi ({groups.removed.length})
            <ChevronDown size={14} className={`transition-transform ${showRemoved ? 'rotate-180' : ''}`} />
          </button>
          {showRemoved && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white opacity-90 shadow-sm">
              {groups.removed.map((item) => {
                const reason = getFollowUpExclusionReason(item.state.exclusion.reason);
                return (
                  <QuoteLine key={item.quote.id} item={item}>
                    <span className="text-xs text-slate-500">
                      {reason ? reason.label : 'Retiré'}
                      {item.state.exclusion.atMs ? ` le ${formatDay(item.state.exclusion.atMs)}` : ''}
                    </span>
                    <button
                      type="button"
                      disabled={savingId === item.quote.id}
                      onClick={() => setExclusion(item.quote, null)}
                      className={SMALL_BUTTON}
                      title="Remettre ce devis dans le suivi des relances"
                    >
                      {savingId === item.quote.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      Remettre
                    </button>
                    {openLink(item.quote)}
                  </QuoteLine>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
