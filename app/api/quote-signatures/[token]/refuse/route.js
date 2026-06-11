import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { refuseQuoteSignatureSession } from '@/lib/quote-signature-service';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    const { token } = await params;
    const body = await request.json().catch(() => ({}));

    const session = await refuseQuoteSignatureSession({
      sessionId: token,
      reason: body?.reason,
    });

    return NextResponse.json(session);
  } catch (error) {
    return toRouteErrorResponse(error, 'Impossible de refuser ce devis.');
  }
}
