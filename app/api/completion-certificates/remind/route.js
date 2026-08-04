import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import { sendCompletionReminder } from '@/lib/completion-signature-service';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const body = await request.json();

    const result = await sendCompletionReminder({
      userId: user.uid,
      sessionId: body?.sessionId,
      reminderLevel: body?.reminderLevel,
    });

    return NextResponse.json(result);
  } catch (error) {
    return toRouteErrorResponse(error, "Impossible d'envoyer la relance.");
  }
}
