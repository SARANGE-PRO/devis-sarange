import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import { sendCompletionEmail } from '@/lib/completion-signature-service';

export const runtime = 'nodejs';

/**
 * Envoi du mail initial d'un bon DÉJÀ créé (lien copié, mail perdu...) :
 * même lien, aucune nouvelle session.
 */
export async function POST(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const body = await request.json();

    const result = await sendCompletionEmail({
      userId: user.uid,
      sessionId: body?.sessionId,
      recipients: body?.recipients,
    });

    return NextResponse.json(result);
  } catch (error) {
    return toRouteErrorResponse(error, "Impossible d'envoyer le bon par e-mail.");
  }
}
