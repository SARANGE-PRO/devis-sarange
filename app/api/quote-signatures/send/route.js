import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import { createAndSendQuoteDelivery } from '@/lib/quote-signature-service';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const body = await request.json();

    console.info('[POST /api/quote-signatures/send]', {
      userId: user.uid,
      quoteId: body?.quoteId,
      deliveryMode: body?.deliveryMode,
      hasPdfBase64: !!body?.pdfBase64,
      pdfInfoKeys: body?.pdfInfo ? Object.keys(body.pdfInfo) : null,
      variantsCount: Array.isArray(body?.variants) ? body.variants.length : null,
    });

    const result = await createAndSendQuoteDelivery({
      userId: user.uid,
      quoteId: body?.quoteId,
      deliveryMode: body?.deliveryMode,
      pdfBase64: body?.pdfBase64,
      pdfInfo: body?.pdfInfo,
      variants: body?.variants,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[POST /api/quote-signatures/send] Error:', {
      error: error?.message,
      stack: error?.stack,
      statusCode: error?.statusCode,
    });
    return toRouteErrorResponse(error, 'Impossible d envoyer le devis.');
  }
}
