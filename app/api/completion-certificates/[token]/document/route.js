import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { getCompletionDocument } from '@/lib/completion-signature-service';

export const runtime = 'nodejs';

export async function GET(_request, { params }) {
  try {
    const { token } = await params;
    const document = await getCompletionDocument(token);

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
