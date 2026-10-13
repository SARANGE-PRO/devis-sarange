'use client';

// Suivi des devis envoyés (vue « Suivi des envois » de Mes devis), sur le
// modèle des relances de factures de sarange-finances : une ligne par devis,
// groupée par ce qu'il y a à faire. Relance due aujourd'hui, proposée au bon
// niveau (J+3, J+10, J+30) ; prochaines relances ; devis modifiés à renvoyer ;
// envois par e-mail simple (suivi manuel) ; sans réponse après trois relances.
// Rien ne part sans un clic : l'envoi passe par l'aperçu de vérification
// habituel (lib/quote-follow-up.mjs pour la logique, testée).

import Link from 'next/link';
import { useMemo } from 'react';
import { BellRing, Link2, Loader2, Pencil, PenSquare, Send } from 'lucide-react';
import { getClientDisplayName } from '@/lib/client-cloud';
import { getQuoteNumberDisplay, getQuoteSignatureWorkflow } from '@/lib/quote-signature';
import { QUOTE_REMINDER_STEPS, getQuoteReminderStep, groupQuotesForFollowUp } from '@/lib/quote-follow-up.mjs';

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

function QuoteLine({ item, children }) {
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
    <div className="border-t border-slate-100 px-4 py-3 first:border-t-0 sm:flex sm:items-center sm:gap-4">
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
 */
export default function QuoteFollowUp({
  quotes,
  loading = false,
  actionId = null,
  actionKind = null,
  onSendReminder,
  onSendForSignature,
  onCopySignatureLink,
}) {
  const groups = useMemo(() => groupQuotesForFollowUp(quotes), [quotes]);
  const isWorking = (quote, kind) => actionId === quote.id && (!kind || actionKind === kind);

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

  if (!loading && !groups.count) {
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
          <QuoteLine key={item.quote.id} item={item}>
            {reminderButton(item.quote, item.state.nextLevel, item.state.nextLabel)}
            {copyButton(item.quote)}
            {openLink(item.quote)}
          </QuoteLine>
        ))}
      </Section>

      <Section title="Prochaines relances" items={groups.upcoming}>
        {groups.upcoming.map((item) => (
          <QuoteLine key={item.quote.id} item={item}>
            <span className="text-xs text-slate-500">
              {item.state.nextLabel} le <strong>{formatDay(item.state.nextDateMs)}</strong>
            </span>
            {copyButton(item.quote)}
            {openLink(item.quote)}
          </QuoteLine>
        ))}
      </Section>

      <Section
        title="À renvoyer"
        hint="Devis modifiés depuis leur envoi : le client doit recevoir la nouvelle version avant toute relance."
        items={groups.resend}
      >
        {groups.resend.map((item) => (
          <QuoteLine key={item.quote.id} item={item}>
            {resendButton(item.quote, 'Renvoyer pour signature')}
            {openLink(item.quote)}
          </QuoteLine>
        ))}
      </Section>

      <Section
        title="Envoyés par e-mail simple"
        hint="PDF joint sans lien de signature : relance de vive voix, ou nouvel envoi pour signature en ligne."
        items={groups.emailOnly}
      >
        {groups.emailOnly.map((item) => (
          <QuoteLine key={item.quote.id} item={item}>
            {resendButton(item.quote, 'Envoyer pour signature')}
            {openLink(item.quote)}
          </QuoteLine>
        ))}
      </Section>

      <Section
        title="Sans réponse après trois relances"
        hint="Une relance de plus reste possible ; sinon le devis attend ici, ou se range depuis sa fiche."
        items={groups.unanswered}
      >
        {groups.unanswered.map((item) => (
          <QuoteLine key={item.quote.id} item={item}>
            {reminderButton(item.quote, 3, 'Relancer encore', false)}
            {copyButton(item.quote)}
            {openLink(item.quote)}
          </QuoteLine>
        ))}
      </Section>
    </div>
  );
}
