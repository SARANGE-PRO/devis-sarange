import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { getQuoteSignatureSession } from '@/lib/quote-signature-service';

export const runtime = 'nodejs';

export async function GET(_request, { params }) {
  try {
    const { token } = await params;
    const session = await getQuoteSignatureSession(token);
    return NextResponse.json(session);
  } catch (error) {
    console.error('[GET /api/quote-signatures/[token]]', {
      token: params?.token,
      error: error?.message,
      stack: error?.stack,
      statusCode: error?.statusCode,
    });
    return toRouteErrorResponse(error, 'Impossible de charger ce devis.');
  }
}
