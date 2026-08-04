import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { refuseCompletionSession } from '@/lib/completion-signature-service';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    const { token } = await params;
    const body = await request.json();

    const session = await refuseCompletionSession({
      sessionId: token,
      reason: body?.reason,
    });

    return NextResponse.json(session);
  } catch (error) {
    return toRouteErrorResponse(error, 'Impossible de refuser ce bon de fin de chantier.');
  }
}
