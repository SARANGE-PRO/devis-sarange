'use client';

// Vérification AVANT tout envoi d'e-mail au client : destinataire, objet,
// pièce jointe, lien inclus et texte intégral du message, tels que le serveur
// va réellement les envoyer (l'aperçu est produit par les mêmes gabarits que
// l'envoi). Rien ne part tant que l'utilisateur n'a pas confirmé ici.
//
// Usage : `const { confirmation, requestEmailConfirmation, confirmEmail,
// cancelEmail } = useEmailConfirmation();` puis
// `if (!(await requestEmailConfirmation({ title, preview, pdfPreviewUrl })))
// return;` juste avant l'appel d'envoi, et `<EmailConfirmationModal … />` dans
// le rendu.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Mail, Paperclip, Send, ShieldCheck, X } from 'lucide-react';

export const useEmailConfirmation = () => {
  const [confirmation, setConfirmation] = useState(null);
  // Résolution de la promesse en attente, hors de l'état React (jamais
  // d'effet de bord dans un « setState »).
  const pendingResolveRef = useRef(null);

  const settle = useCallback((answer) => {
    const resolve = pendingResolveRef.current;
    pendingResolveRef.current = null;
    setConfirmation(null);
    resolve?.(answer);
  }, []);

  const requestEmailConfirmation = useCallback(
    (payload) =>
      new Promise((resolve) => {
        // Une demande encore ouverte (double clic) est annulée, jamais
        // laissée en suspens : l'appelant précédent reprend la main.
        pendingResolveRef.current?.(false);
        pendingResolveRef.current = resolve;
        setConfirmation(payload);
      }),
    []
  );

  const confirmEmail = useCallback(() => settle(true), [settle]);
  const cancelEmail = useCallback(() => settle(false), [settle]);

  // Page quittée pendant l'attente : l'appelant est libéré (annulation).
  useEffect(
    () => () => {
      pendingResolveRef.current?.(false);
      pendingResolveRef.current = null;
    },
    []
  );

  return { confirmation, requestEmailConfirmation, confirmEmail, cancelEmail };
};

const formatDateLabel = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(date);
};

const Section = ({ label, children }) => (
  <div className="mt-3">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    <div className="mt-1">{children}</div>
  </div>
);

/**
 * @param {object} props
 * @param {object|null} props.confirmation  { title, subtitle, preview, pdfPreviewUrl }
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onCancel
 */
export default function EmailConfirmationModal({ confirmation, onConfirm, onCancel }) {
  if (!confirmation) return null;

  const { title, subtitle, preview, pdfPreviewUrl, loading, error } = confirmation;
  const attachments = Array.isArray(preview?.attachments) ? preview.attachments : [];
  const expiresLabel = formatDateLabel(preview?.expiresAt);

  return (
    // Au-dessus de TOUS les calques de l'app : chargeur plein écran (80),
    // fenêtres de type de client et de TVA (200), modales d'envoi (50).
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-orange-100 p-2 text-orange-600">
              <ShieldCheck size={18} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-orange-500">
                Vérification avant envoi
              </p>
              <h3 className="text-base font-bold text-slate-900">{title || 'E-mail au client'}</h3>
              {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading && (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              Préparation de l&apos;aperçu du mail…
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {error}
            </p>
          )}

          {preview && (
            <>
              <Section label="Destinataire">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  {preview.recipientName && (
                    <p className="text-sm font-bold text-slate-900">{preview.recipientName}</p>
                  )}
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-orange-700">
                    <Mail size={13} />
                    {preview.to}
                  </p>
                </div>
              </Section>

              <Section label="Objet du mail">
                <p className="text-sm font-semibold text-slate-800">{preview.subject}</p>
              </Section>

              {attachments.length > 0 && (
                <Section label={attachments.length > 1 ? 'Pièces jointes' : 'Pièce jointe'}>
                  <ul className="space-y-1">
                    {attachments.map((attachment) => (
                      <li
                        key={attachment.filename}
                        className="flex items-center justify-between gap-2 text-sm text-slate-700"
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Paperclip size={13} className="shrink-0 text-slate-400" />
                          <span className="truncate">{attachment.filename}</span>
                        </span>
                        {pdfPreviewUrl && attachments.length === 1 && (
                          <a
                            href={pdfPreviewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:border-orange-300 hover:text-orange-700"
                          >
                            <ExternalLink size={12} />
                            Voir le PDF
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {(preview.link || preview.linkIsNew) && (
                <Section label="Lien inclus dans le mail">
                  <p className="text-sm text-slate-700">
                    {preview.linkIsNew
                      ? 'Un lien personnel de signature sera créé au moment de l’envoi.'
                      : preview.link}
                    {expiresLabel ? ` Actif jusqu’au ${expiresLabel}.` : ''}
                  </p>
                </Section>
              )}

              <Section label="Message tel qu’il sera reçu">
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-sans text-xs leading-relaxed text-slate-700">
                  {preview.text}
                </pre>
              </Section>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!preview || Boolean(loading)}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={14} />
            Confirmer l&apos;envoi
          </button>
        </div>
      </div>
    </div>
  );
}
