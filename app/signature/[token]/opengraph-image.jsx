// Image d'aperçu du lien de signature (WhatsApp, SMS, e-mail) : personnalisée
// pour le client (nom, numéro de devis, montant) afin qu'il comprenne qu'il
// s'agit de SON devis à signer. Générée à la demande, sans effet de bord sur la
// session (le robot d'aperçu n'est pas le client).
import { ImageResponse } from 'next/og';

import LinkPreviewImage, { LINK_PREVIEW_SIZE } from '@/components/LinkPreviewImage';
import { buildSignatureLinkPreviewTexts } from '@/lib/quote-signature-preview.mjs';
import { getQuoteSignatureLinkPreview } from '@/lib/quote-signature-service';

export const runtime = 'nodejs';
export const size = LINK_PREVIEW_SIZE;
export const contentType = 'image/png';
export const alt = 'Votre devis SARANGE à signer en ligne';

export default async function SignatureLinkImage({ params }) {
  const { token } = await params;

  let preview = null;
  try {
    preview = await getQuoteSignatureLinkPreview(token);
  } catch {
    preview = null;
  }

  return new ImageResponse(<LinkPreviewImage texts={buildSignatureLinkPreviewTexts(preview)} />, {
    ...LINK_PREVIEW_SIZE,
  });
}
