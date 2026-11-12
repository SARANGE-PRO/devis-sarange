'use client';

import { useMemo, useState } from 'react';
import { Printer, X } from 'lucide-react';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import { buildClientFolderFields, buildClientFolderHtml } from '@/lib/client-folder.mjs';
import { formatPhoneNumber, formatPhoneWhileTyping } from '@/lib/phone.mjs';

const PREVIEW_WIDTH_PX = 300;
// Couverture 210 × 297 mm : même rapport pour la hauteur de l'aperçu.
const PREVIEW_HEIGHT_PX = Math.round((PREVIEW_WIDTH_PX * 297) / 210);

/**
 * Impression de la chemise papier A3 depuis une iframe cachée : le document
 * est autonome (police, @page A3 paysage), indépendant des styles de l'app.
 * On attend le chargement de la police avant d'ouvrir la boîte d'impression.
 */
const printFolder = (html) => {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const cleanup = () => setTimeout(() => iframe.remove(), 1000);

  iframe.onload = () => {
    const frameWindow = iframe.contentWindow;
    const fontsReady = iframe.contentDocument?.fonts?.ready || Promise.resolve();
    // Police indisponible (hors ligne) : on imprime quand même avec la police de repli.
    const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
    Promise.race([fontsReady, timeout]).then(() => {
      frameWindow.addEventListener('afterprint', cleanup, { once: true });
      frameWindow.focus();
      frameWindow.print();
      // Certains navigateurs n'émettent pas afterprint : nettoyage de secours.
      setTimeout(() => iframe.isConnected && iframe.remove(), 60_000);
    });
  };
  iframe.srcdoc = html;
};

export default function ClientFolderModal({ client, onClose }) {
  const [fields, setFields] = useState(() => buildClientFolderFields(client?.payload || {}));

  const previewHtml = useMemo(
    () => buildClientFolderHtml(fields, { mode: 'preview', previewWidthPx: PREVIEW_WIDTH_PX }),
    [fields]
  );

  const update = (name) => (event) => {
    const { value } = event.target;
    setFields((previous) => ({
      ...previous,
      [name]:
        name === 'letter'
          ? value.slice(-1).toUpperCase()
          : name === 'phone'
            ? // Espacement automatique pendant la frappe, comme le reste de l'app.
              formatPhoneWhileTyping(value, event.target.selectionStart)
            : value,
    }));
  };

  // Sortie du champ : on remet en forme une correction faite au milieu du numéro.
  const handlePhoneBlur = (event) => {
    const formatted = formatPhoneNumber(event.target.value);
    setFields((previous) => (previous.phone === formatted ? previous : { ...previous, phone: formatted }));
  };

  const inputClasses =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-200';
  const labelClasses = 'mb-1 block text-xs font-semibold text-slate-600';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Imprimer le dossier client"
        className="relative flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">Chemise A3</p>
            <h3 className="mt-0.5 text-lg font-bold text-slate-900">Imprimer le dossier client</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-6 md:grid-cols-[1fr_auto]">
            <div className="grid content-start gap-3 sm:grid-cols-[5rem_1fr]">
              <label className="block">
                <span className={labelClasses}>Lettre</span>
                <input
                  value={fields.letter}
                  onChange={update('letter')}
                  className={`${inputClasses} text-center text-lg font-black`}
                  maxLength={2}
                  aria-label="Lettre de classement"
                />
              </label>
              <label className="block">
                <span className={labelClasses}>Nom sur la chemise</span>
                <input value={fields.name} onChange={update('name')} className={inputClasses} />
              </label>
              {/* Adresse : suggestions de la Base Adresse Nationale (comme la fiche
                  client). Une suggestion choisie remplit aussi code postal et ville. */}
              <div className="block sm:col-span-2">
                <label htmlFor="folder-address" className={labelClasses}>Adresse</label>
                <AddressAutocomplete
                  id="folder-address"
                  value={fields.addressLine1}
                  onChange={(value) => setFields((previous) => ({ ...previous, addressLine1: value }))}
                  onSelect={({ adresse, codePostal, ville }) =>
                    setFields((previous) => ({
                      ...previous,
                      addressLine1: adresse || previous.addressLine1,
                      addressLine2: [codePostal, ville].filter(Boolean).join(' ') || previous.addressLine2,
                    }))
                  }
                  placeholder="Numéro et nom de rue, ville…"
                />
              </div>
              <label className="block sm:col-span-2">
                <span className={labelClasses}>Code postal et ville</span>
                <input value={fields.addressLine2} onChange={update('addressLine2')} className={inputClasses} />
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClasses}>Téléphone</span>
                <input
                  value={fields.phone}
                  onChange={update('phone')}
                  onBlur={handlePhoneBlur}
                  className={inputClasses}
                  type="tel"
                  inputMode="tel"
                  placeholder="06 12 34 56 78"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClasses}>E-mail</span>
                <input value={fields.email} onChange={update('email')} className={inputClasses} type="email" />
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClasses}>Notes</span>
                <textarea
                  value={fields.notes}
                  onChange={update('notes')}
                  rows={4}
                  className={`${inputClasses} resize-y`}
                  placeholder="Laisser vide pour écrire à la main"
                />
              </label>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div
                className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                style={{ width: PREVIEW_WIDTH_PX, height: PREVIEW_HEIGHT_PX }}
              >
                <iframe
                  title="Aperçu de la chemise"
                  srcDoc={previewHtml}
                  width={PREVIEW_WIDTH_PX}
                  height={PREVIEW_HEIGHT_PX}
                  className="pointer-events-none block border-0"
                />
              </div>
              <p className="text-[11px] text-slate-400">Aperçu de la couverture</p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="flex-1 text-xs text-slate-500">
              Le navigateur ne peut pas choisir le papier à votre place : dans la fenêtre
              d&apos;impression, ouvrez <strong>Plus de paramètres → Taille du papier → A3</strong>,
              échelle 100 %. Chrome le garde ensuite en mémoire pour cette imprimante.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 sm:flex-none"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => printFolder(buildClientFolderHtml(fields))}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600 sm:flex-none"
              >
                <Printer size={16} />
                Imprimer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
