import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import {
  previewCompletionReminder,
  previewQuoteLinkedCompletion,
  previewReservesLift,
} from '@/lib/completion-signature-service';

export const runtime = 'nodejs';

/**
 * Aperçu d'un e-mail AVANT envoi (vérification par l'utilisateur) : rien n'est
 * enregistré ni envoyé. `kind` = 'send' (bon de fin de chantier / livraison /
 * enlèvement), 'reminder' (relance du bon) ou 'lift' (PV de levée des réserves).
 */
export async function POST(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const body = await request.json();

    if (body?.kind === 'reminder') {
      return NextResponse.json(
        await previewCompletionReminder({
          userId: user.uid,
          sessionId: body?.sessionId,
          reminderLevel: body?.reminderLevel,
        })
      );
    }

    if (body?.kind === 'lift') {
      return NextResponse.json(
        await previewReservesLift({
          userId: user.uid,
          quoteId: body?.quoteId,
          amountDue: body?.amountDue,
          paymentReference: body?.paymentReference,
          overrideEmail: body?.overrideEmail,
        })
      );
    }

    return NextResponse.json(
      await previewQuoteLinkedCompletion({
        userId: user.uid,
        quoteId: body?.quoteId,
        deliveryType: body?.deliveryType,
        overrideEmail: body?.overrideEmail,
      })
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Impossible de préparer l'aperçu du mail.");
  }
}
