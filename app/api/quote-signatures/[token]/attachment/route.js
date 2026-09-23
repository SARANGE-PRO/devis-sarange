import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { getQuoteSignatureAttachment } from '@/lib/quote-signature-service';

export const runtime = 'nodejs';

// Pièce jointe supplémentaire d'un envoi de devis (PDF, JPG, PNG), proposée
// au téléchargement sur la page de signature. Public, comme le PDF du devis :
// le lien porte le jeton de session.
export async function GET(request, { params }) {
  try {
    const { token } = await params;
    const index = Number.parseInt(request.nextUrl.searchParams.get('index') || '', 10);
    const attachment = await getQuoteSignatureAttachment(token, index);

    return new NextResponse(attachment.buffer, {
      headers: {
        'Content-Type': attachment.contentType,
        'Content-Disposition': `attachment; filename="${attachment.filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=0, no-store',
      },
    });
  } catch (error) {
    return toRouteErrorResponse(error, 'Impossible de charger la pièce jointe.');
  }
}
