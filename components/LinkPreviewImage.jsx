// Image d'aperçu (1200 × 630) des liens envoyés au client : devis à signer,
// bon de fin de chantier, de livraison ou d'enlèvement, PV de levée des
// réserves, lien général de réception. Rendue côté serveur par les routes
// opengraph-image via ImageResponse (next/og) : aucun hook, aucun état.
// Contraintes de Satori : chaque bloc à plusieurs enfants déclare
// `display: 'flex'`.

export const LINK_PREVIEW_SIZE = { width: 1200, height: 630 };

const NAVY = '#0f172a';
const ORANGE = '#f97316';

export default function LinkPreviewImage({ texts }) {
  return (
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
          <div style={{ width: 14, height: 14, borderRadius: 7, background: ORANGE, display: 'flex' }} />
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
  );
}
