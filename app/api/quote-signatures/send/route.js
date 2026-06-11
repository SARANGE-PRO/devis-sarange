import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import { createAndSendQuoteDelivery } from '@/lib/quote-signature-service';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const body = await request.json();

    const result = await createAndSendQuoteDelivery({
      userId: user.uid,
      quoteId: body?.quoteId,
      deliveryMode: body?.deliveryMode,
      pdfBase64: body?.pdfBase64,
      pdfInfo: body?.pdfInfo,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Erreur API /quote-signatures/send:', error);
    return toRouteErrorResponse(error, 'Impossible d envoyer le devis.');
  }
}
