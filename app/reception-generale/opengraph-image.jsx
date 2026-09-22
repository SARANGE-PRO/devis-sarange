// Image d'aperçu du lien général de réception (remis par les poseurs, sans
// devis lié) : textes fixes, même charte que les liens personnalisés.
import { ImageResponse } from 'next/og';

import LinkPreviewImage, { LINK_PREVIEW_SIZE } from '@/components/LinkPreviewImage';
import { GENERIC_COMPLETION_LINK_TEXTS } from '@/lib/completion-link-preview.mjs';

export const runtime = 'nodejs';
export const size = LINK_PREVIEW_SIZE;
export const contentType = 'image/png';
export const alt = 'Votre bon SARANGE à signer en ligne';

export default async function GenericReceptionLinkImage() {
  return new ImageResponse(<LinkPreviewImage texts={GENERIC_COMPLETION_LINK_TEXTS} />, {
    ...LINK_PREVIEW_SIZE,
  });
}
