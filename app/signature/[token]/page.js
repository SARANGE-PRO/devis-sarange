import QuoteSignaturePage from '@/components/QuoteSignaturePage';
import { buildSignatureLinkPreviewTexts } from '@/lib/quote-signature-preview.mjs';
import { getQuoteSignatureLinkPreview } from '@/lib/quote-signature-service';

/**
 * Métadonnées de partage du lien de signature. Quand le lien est collé dans
 * WhatsApp, un SMS ou un e-mail, l'aperçu montre au client SON devis à signer
 * (nom, numéro, montant) au lieu de la description générique de l'application.
 *
 * Lecture SANS effet de bord : le robot d'aperçu ne doit pas marquer la
 * session comme consultée. L'image d'aperçu vient de ./opengraph-image.jsx.
 */
export async function generateMetadata({ params }) {
  const { token } = await params;

  let preview = null;
  try {
    preview = await getQuoteSignatureLinkPreview(token);
  } catch {
    preview = null;
  }

  const texts = buildSignatureLinkPreviewTexts(preview);

  return {
    title: texts.title,
    description: texts.description,
    // Lien personnel : jamais indexé.
    robots: { index: false, follow: false },
    openGraph: {
      title: texts.title,
      description: texts.description,
      siteName: 'SARANGE',
      type: 'website',
      locale: 'fr_FR',
    },
    twitter: {
      card: 'summary_large_image',
      title: texts.title,
      description: texts.description,
    },
  };
}

export default async function SignaturePage({ params }) {
  const { token } = await params;
  return <QuoteSignaturePage token={token} />;
}
