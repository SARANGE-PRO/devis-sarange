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
    return toRouteErrorResponse(error, 'Impossible de charger ce devis.');
  }
}
