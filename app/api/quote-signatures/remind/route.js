import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import { sendQuoteSignatureReminder } from '@/lib/quote-signature-service';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    await verifyFirebaseUserFromRequest(request);
    const body = await request.json();

    const result = await sendQuoteSignatureReminder({
      sessionId: body?.sessionId,
      reminderLevel: body?.reminderLevel,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Erreur API /quote-signatures/remind:', error);
    return toRouteErrorResponse(error, "Impossible d'envoyer la relance.");
  }
}
