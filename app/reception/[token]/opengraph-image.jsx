// Image d'aperçu du lien de bon (fin de chantier, livraison, enlèvement) ou de
// PV de levée des réserves : personnalisée pour le client. Générée à la
// demande, sans effet de bord sur la session (le robot d'aperçu n'est pas le
// client).
import { ImageResponse } from 'next/og';

import LinkPreviewImage, { LINK_PREVIEW_SIZE } from '@/components/LinkPreviewImage';
import { buildCompletionLinkPreviewTexts } from '@/lib/completion-link-preview.mjs';
import { getCompletionSessionLinkPreview } from '@/lib/completion-signature-service';

export const runtime = 'nodejs';
export const size = LINK_PREVIEW_SIZE;
export const contentType = 'image/png';
export const alt = 'Votre bon SARANGE à signer en ligne';

export default async function ReceptionLinkImage({ params }) {
  const { token } = await params;

  let preview = null;
  try {
    preview = await getCompletionSessionLinkPreview(token);
  } catch {
    preview = null;
  }

  return new ImageResponse(<LinkPreviewImage texts={buildCompletionLinkPreviewTexts(preview)} />, {
    ...LINK_PREVIEW_SIZE,
  });
}
