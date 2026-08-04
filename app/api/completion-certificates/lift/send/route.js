import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import { createAndSendReservesLift } from '@/lib/completion-signature-service';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const body = await request.json();

    const result = await createAndSendReservesLift({
      userId: user.uid,
      quoteId: body?.quoteId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return toRouteErrorResponse(error, "Impossible d'envoyer le PV de levée des réserves.");
  }
}
