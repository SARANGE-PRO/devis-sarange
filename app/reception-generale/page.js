import GenericCompletionPage from '@/components/GenericCompletionPage';
import { GENERIC_COMPLETION_LINK_TEXTS } from '@/lib/completion-link-preview.mjs';

// Lien général de réception (remis par les poseurs, sans devis lié) : aperçu
// de partage explicite, même charte que les liens personnalisés. L'image
// vient de ./opengraph-image.jsx.
export const metadata = {
  title: GENERIC_COMPLETION_LINK_TEXTS.title,
  description: GENERIC_COMPLETION_LINK_TEXTS.description,
  robots: { index: false, follow: false },
  openGraph: {
    title: GENERIC_COMPLETION_LINK_TEXTS.title,
    description: GENERIC_COMPLETION_LINK_TEXTS.description,
    siteName: 'SARANGE',
    type: 'website',
    locale: 'fr_FR',
  },
  twitter: {
    card: 'summary_large_image',
    title: GENERIC_COMPLETION_LINK_TEXTS.title,
    description: GENERIC_COMPLETION_LINK_TEXTS.description,
  },
};

export default function ReceptionGeneralePage() {
  return <GenericCompletionPage />;
}
