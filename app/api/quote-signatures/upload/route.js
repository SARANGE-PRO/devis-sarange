import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import { stageQuoteDeliveryPdfChunk } from '@/lib/quote-signature-service';

export const runtime = 'nodejs';

// Réceptionne UN morceau (≤ ~2 Mo) d'un PDF de devis et le met en zone de
// transit Firebase Storage. L'hébergement limite chaque requête à ~4,5 Mo :
// les PDF partent donc en plusieurs morceaux, puis /send les référence via
// `pdfUploadId` au lieu de transporter le base64 complet.
export async function POST(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const body = await request.json();

    const result = await stageQuoteDeliveryPdfChunk({
      userId: user.uid,
      uploadId: body?.uploadId,
      chunkIndex: body?.chunkIndex,
      totalChunks: body?.totalChunks,
      chunkBase64: body?.chunkBase64,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[POST /api/quote-signatures/upload] Error:', {
      error: error?.message,
      statusCode: error?.statusCode,
    });
    return toRouteErrorResponse(error, "Impossible de préparer l'envoi du devis.");
  }
}
