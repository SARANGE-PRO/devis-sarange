import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { stageCompletionPhoto } from '@/lib/completion-signature-service';

export const runtime = 'nodejs';

// Téléversement d'UNE photo de réserve en amont de la signature : la limite
// de ~4,5 Mo par requête s'applique ainsi PAR PHOTO et non au total. Public,
// authentifié par le token de session (flux devis) ou un uploadId opaque
// (flux générique) — voir stageCompletionPhoto pour les plafonds.
export async function POST(request) {
  try {
    const body = await request.json();

    const result = await stageCompletionPhoto({
      token: body?.token,
      uploadId: body?.uploadId,
      photoDataUrl: body?.photo,
    });

    return NextResponse.json(result);
  } catch (error) {
    return toRouteErrorResponse(error, "Impossible d'envoyer la photo.");
  }
}
