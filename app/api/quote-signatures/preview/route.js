import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import {
  previewQuoteDelivery,
  previewQuoteSignatureReminder,
} from '@/lib/quote-signature-service';

export const runtime = 'nodejs';

/**
 * Aperçu d'un e-mail AVANT envoi (vérification par l'utilisateur) : rien n'est
 * enregistré ni envoyé. `kind` = 'delivery' (envoi du devis, par e-mail ou pour
 * signature) ou 'reminder' (relance d'un devis à signer).
 */
export async function POST(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const body = await request.json();

    if (body?.kind === 'reminder') {
      return NextResponse.json(
        await previewQuoteSignatureReminder({
          sessionId: body?.sessionId,
          reminderLevel: body?.reminderLevel,
        })
      );
    }

    return NextResponse.json(
      await previewQuoteDelivery({
        userId: user.uid,
        quoteId: body?.quoteId,
        deliveryMode: body?.deliveryMode,
        pdfInfo: body?.pdfInfo,
        variants: body?.variants,
        customSubject: body?.customSubject,
        customMessage: body?.customMessage,
        extraAttachments: body?.extraAttachments,
        recipients: body?.recipients,
      })
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Impossible de préparer l'aperçu du mail.");
  }
}
