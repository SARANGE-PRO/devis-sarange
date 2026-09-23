'use client';

// Vérification AVANT tout envoi d'e-mail au client : destinataire, objet,
// pièces jointes, lien inclus et texte intégral du message, tels que le
// serveur va réellement les envoyer (l'aperçu est produit par les mêmes
// gabarits que l'envoi). Rien ne part tant que l'utilisateur n'a pas confirmé.
//
// Pour l'envoi d'un devis, la fenêtre est aussi un petit éditeur : objet et
// message personnel modifiables (le reste du gabarit reste figé), pièces
// jointes supplémentaires (PDF, JPG, PNG). La confirmation renvoie alors ces
// choix à l'appelant.
//
// Usage : `const { confirmation, requestEmailConfirmation, confirmEmail,
// cancelEmail } = useEmailConfirmation();` puis
// `const decision = await requestEmailConfirmation({ title, preview,
// pdfPreviewUrl, editable })` (faux si annulé, sinon `{ subject, message,
// files }` ou `true`), et `<EmailConfirmationModal … />` dans le rendu.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Mail, Paperclip, Plus, Send, ShieldCheck, Trash2, X } from 'lucide-react';

import { ATTACHMENT_ACCEPT, formatFileSize, validateAttachmentSelection } from '@/lib/email-attachments.mjs';
import {
  CUSTOM_MESSAGE_PLACEHOLDER,
  MAX_CUSTOM_MESSAGE_LENGTH,
  MAX_CUSTOM_SUBJECT_LENGTH,
} from '@/lib/email-custom-message.mjs';

export const useEmailConfirmation = () => {
  const [confirmation, setConfirmation] = useState(null);
  // Résolution de la promesse en attente, hors de l'état React (jamais
  // d'effet de bord dans un « setState »).
  const pendingResolveRef = useRef(null);
  const requestIdRef = useRef(0);

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
        requestIdRef.current += 1;
        setConfirmation({ ...payload, requestId: requestIdRef.current });
      }),
    []
  );

  const confirmEmail = useCallback(
    (details) => settle(details && typeof details === 'object' ? details : true),
    [settle]
  );
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

let nextFileKey = 0;

/**
 * Contenu de la fenêtre : remonté à chaque demande (clé = requestId) pour
 * repartir des textes par défaut.
 */
function ConfirmationDialog({ confirmation, onConfirm, onCancel }) {
  const { title, subtitle, preview, pdfPreviewUrl, loading, error, editable } = confirmation;
  const [subject, setSubject] = useState(editable?.subject ?? '');
  const [message, setMessage] = useState(editable?.message ?? '');
  const [files, setFiles] = useState([]);
  const [attachmentError, setAttachmentError] = useState('');
  const fileInputRef = useRef(null);

  const baseAttachments = Array.isArray(preview?.attachments) ? preview.attachments : [];
  const expiresLabel = formatDateLabel(preview?.expiresAt);
  const effectiveMessage = message.trim() || editable?.message || '';
  const previewText =
    editable && preview?.textTemplate
      ? preview.textTemplate.split(CUSTOM_MESSAGE_PLACEHOLDER).join(effectiveMessage)
      : preview?.text || '';

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []).map((file) => ({
      key: `f-${(nextFileKey += 1)}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type,
    }));
    if (!incoming.length) return;

    const next = [...files, ...incoming];
    const problem = validateAttachmentSelection(next, { extraBytes: editable?.baseAttachmentBytes || 0 });
    if (problem) {
      setAttachmentError(problem);
      return;
    }
    setAttachmentError('');
    setFiles(next);
  };

  const removeFile = (key) => {
    setFiles((current) => current.filter((entry) => entry.key !== key));
    setAttachmentError('');
  };

  const handleConfirm = () => {
    if (!editable) {
      onConfirm();
      return;
    }
    onConfirm({
      subject: subject.trim(),
      message: message.trim(),
      files: files.map((entry) => entry.file),
    });
  };

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
                {editable ? (
                  <input
                    type="text"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    maxLength={MAX_CUSTOM_SUBJECT_LENGTH}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                ) : (
                  <p className="text-sm font-semibold text-slate-800">{preview.subject}</p>
                )}
              </Section>

              {editable && (
                <Section label="Votre message">
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    maxLength={MAX_CUSTOM_MESSAGE_LENGTH}
                    rows={5}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Modifiable à votre guise. Le bouton de signature, les étapes et les modalités de règlement
                    restent ajoutés automatiquement.
                  </p>
                </Section>
              )}

              {(baseAttachments.length > 0 || editable?.allowAttachments) && (
                <Section label="Pièces jointes">
                  <ul className="space-y-1">
                    {baseAttachments.map((attachment) => (
                      <li
                        key={`base-${attachment.filename}`}
                        className="flex items-center justify-between gap-2 text-sm text-slate-700"
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Paperclip size={13} className="shrink-0 text-slate-400" />
                          <span className="truncate">{attachment.filename}</span>
                          {attachment.size ? (
                            <span className="shrink-0 text-xs text-slate-400">{formatFileSize(attachment.size)}</span>
                          ) : null}
                        </span>
                        {pdfPreviewUrl && baseAttachments.length === 1 && (
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
                    {files.map((entry) => (
                      <li key={entry.key} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Paperclip size={13} className="shrink-0 text-orange-500" />
                          <span className="truncate">{entry.name}</span>
                          <span className="shrink-0 text-xs text-slate-400">{formatFileSize(entry.size)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFile(entry.key)}
                          title="Retirer cette pièce jointe"
                          className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {editable?.allowAttachments && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={ATTACHMENT_ACCEPT}
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          addFiles(event.target.files);
                          event.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-orange-300 hover:text-orange-700"
                      >
                        <Plus size={13} />
                        Ajouter un PDF ou une image
                      </button>
                      {attachmentError && (
                        <p className="mt-1.5 text-xs font-semibold text-rose-600">{attachmentError}</p>
                      )}
                    </>
                  )}
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
                  {previewText}
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
            onClick={handleConfirm}
            disabled={!preview || Boolean(loading) || Boolean(attachmentError)}
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

/**
 * @param {object} props
 * @param {object|null} props.confirmation  { title, subtitle, preview, pdfPreviewUrl, editable? }
 * @param {(details?: object) => void} props.onConfirm
 * @param {() => void} props.onCancel
 */
export default function EmailConfirmationModal({ confirmation, onConfirm, onCancel }) {
  if (!confirmation) return null;

  return (
    <ConfirmationDialog
      key={confirmation.requestId || 0}
      confirmation={confirmation}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
