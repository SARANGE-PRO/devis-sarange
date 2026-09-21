// Image d'aperçu du lien de signature (WhatsApp, SMS, e-mail) : personnalisée
// pour le client (nom, numéro de devis, montant) afin qu'il comprenne qu'il
// s'agit de SON devis à signer. Générée à la demande, sans effet de bord sur la
// session (le robot d'aperçu n'est pas le client).
import { ImageResponse } from 'next/og';

import { buildSignatureLinkPreviewTexts } from '@/lib/quote-signature-preview.mjs';
import { getQuoteSignatureLinkPreview } from '@/lib/quote-signature-service';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Votre devis SARANGE à signer en ligne';

const NAVY = '#0f172a';
const ORANGE = '#f97316';

export default async function SignatureLinkImage({ params }) {
  const { token } = await params;

  let preview = null;
  try {
    preview = await getQuoteSignatureLinkPreview(token);
  } catch {
    preview = null;
  }

  const texts = buildSignatureLinkPreviewTexts(preview);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: NAVY,
          color: '#ffffff',
          padding: '64px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Bande d'accent */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 18,
            height: '100%',
            background: ORANGE,
            display: 'flex',
          }}
        />

        {/* Marque */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: 32,
              background: '#1e293b',
              border: '3px solid #334155',
              fontSize: 40,
              fontWeight: 900,
              color: '#ffffff',
            }}
          >
            S
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 34, fontWeight: 900, letterSpacing: 6 }}>SARANGE</span>
            <div
              style={{ width: 14, height: 14, borderRadius: 7, background: ORANGE, display: 'flex' }}
            />
          </div>
        </div>

        {/* Message principal */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 62, fontWeight: 900, lineHeight: 1.1, display: 'flex' }}>
            {texts.headline}
          </div>
          {texts.subline ? (
            <div style={{ fontSize: 34, color: '#cbd5e1', display: 'flex' }}>{texts.subline}</div>
          ) : null}
          {texts.details ? (
            <div style={{ fontSize: 30, color: '#94a3b8', display: 'flex' }}>{texts.details}</div>
          ) : null}
        </div>

        {/* Bouton + rassurance */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '22px 44px',
              borderRadius: 999,
              background: ORANGE,
              color: '#ffffff',
              fontSize: 32,
              fontWeight: 800,
            }}
          >
            {texts.badge}
          </div>
          <div style={{ fontSize: 24, color: '#94a3b8', display: 'flex' }}>
            Lien personnel et sécurisé
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
