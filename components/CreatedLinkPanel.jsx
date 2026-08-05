'use client';

import { useState } from 'react';
import { Check, Copy, Link2, QrCode as QrCodeIcon } from 'lucide-react';

import QrCode from './QrCode';

/**
 * Vue affichée dans les modales d'envoi une fois le lien de signature créé
 * (bon de fin de chantier et levée de réserves). Le switch Lien / QR code
 * couvre les deux façons de transmettre sur chantier : copier le lien
 * (SMS, WhatsApp) ou faire scanner directement l'écran par le client.
 */
export default function CreatedLinkPanel({ link, copied, onCopy, onClose }) {
  const [view, setView] = useState('link');

  return (
    <div className="mt-5">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <p className="font-bold">Lien de signature créé{copied ? ' et copié !' : ''}</p>
        <p className="mt-1 text-xs">
          Transmettez-le au client (SMS, WhatsApp...) ou faites-lui scanner le QR code. Il reste
          valable 60 jours.
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setView('link')}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
            view === 'link' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Link2 size={13} />
          Lien
        </button>
        <button
          type="button"
          onClick={() => setView('qr')}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
            view === 'qr' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <QrCodeIcon size={13} />
          QR code
        </button>
      </div>

      {view === 'link' ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <Link2 size={14} className="shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-500">{link}</span>
        </div>
      ) : (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4">
          <QrCode value={link} size={190} />
          <p className="text-center text-[11px] leading-tight text-slate-400">
            Faites scanner ce code au client avec l&apos;appareil photo de son téléphone.
          </p>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onCopy}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition-all ${
            copied
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? 'Copié !' : 'Copier le lien'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
