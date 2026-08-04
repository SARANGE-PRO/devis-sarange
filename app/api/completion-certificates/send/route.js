import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import { createAndSendQuoteLinkedCompletion } from '@/lib/completion-signature-service';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const body = await request.json();

    const result = await createAndSendQuoteLinkedCompletion({
      userId: user.uid,
      quoteId: body?.quoteId,
      acompteRecu: body?.acompteRecu,
      invoiceReference: body?.invoiceReference,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[POST /api/completion-certificates/send] Error:', {
      error: error?.message,
      statusCode: error?.statusCode,
    });
    return toRouteErrorResponse(error, "Impossible d'envoyer le bon de fin de chantier.");
  }
}
