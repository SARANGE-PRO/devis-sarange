import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { submitGenericCompletion } from '@/lib/completion-signature-service';

export const runtime = 'nodejs';

// Public, sans authentification : c'est le lien fixe donné aux poseurs, sur
// le même principe que /reception/[token] mais sans devis d'origine (voir
// lib/completion-signature-service.js pour le détail du flux en un seul
// appel).
const getClientIp = (request) =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  request.headers.get('x-real-ip') ||
  '';

export async function POST(request) {
  try {
    const body = await request.json();

    const result = await submitGenericCompletion({
      nom: body?.nom,
      prenom: body?.prenom,
      email: body?.email,
      adresse: body?.adresse,
      ville: body?.ville,
      telephone: body?.telephone,
      quoteReference: body?.quoteReference,
      reserves: body?.reserves,
      reservePhotos: body?.reservePhotos,
      photoUploadId: body?.photoUploadId,
      ratings: body?.ratings,
      signatureDataUrl: body?.signatureDataUrl,
      signerIp: getClientIp(request),
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[POST /api/completion-certificates/generic] Error:', {
      error: error?.message,
      statusCode: error?.statusCode,
    });
    return toRouteErrorResponse(error, "Impossible d'enregistrer le bon de fin de chantier.");
  }
}
