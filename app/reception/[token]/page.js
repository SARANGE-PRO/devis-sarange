import CompletionSignaturePage from '@/components/CompletionSignaturePage';
import { buildCompletionLinkPreviewTexts } from '@/lib/completion-link-preview.mjs';
import { getCompletionSessionLinkPreview } from '@/lib/completion-signature-service';

/**
 * Métadonnées de partage du lien de bon (fin de chantier, livraison,
 * enlèvement) ou de PV de levée des réserves. Collé dans WhatsApp, un SMS ou
 * un e-mail, l'aperçu montre au client SON document à signer, adapté à son
 * type et à son état. Lecture sans effet de bord : le robot d'aperçu ne
 * marque jamais la session comme consultée. L'image vient de
 * ./opengraph-image.jsx.
 */
export async function generateMetadata({ params }) {
  const { token } = await params;

  let preview = null;
  try {
    preview = await getCompletionSessionLinkPreview(token);
  } catch {
    preview = null;
  }

  const texts = buildCompletionLinkPreviewTexts(preview);

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

export default async function ReceptionPage({ params }) {
  const { token } = await params;
  return <CompletionSignaturePage token={token} />;
}
