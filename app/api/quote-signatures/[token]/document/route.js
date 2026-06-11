import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { getQuoteSignatureDocument } from '@/lib/quote-signature-service';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const { token } = await params;
    const type = request.nextUrl.searchParams.get('type') || 'original';
    const document = await getQuoteSignatureDocument(token, type);

    return new NextResponse(document.buffer, {
      headers: {
        'Content-Type': document.contentType,
        'Content-Disposition': `inline; filename="${document.filename}"`,
        'Cache-Control': 'private, max-age=0, no-store',
      },
    });
  } catch (error) {
    return toRouteErrorResponse(error, 'Impossible de charger le document.');
  }
}
