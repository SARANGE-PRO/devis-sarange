import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { signCompletionSession } from '@/lib/completion-signature-service';

export const runtime = 'nodejs';

const getClientIp = (request) =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  request.headers.get('x-real-ip') ||
  '';

export async function POST(request, { params }) {
  try {
    const { token } = await params;
    const body = await request.json();

    const session = await signCompletionSession({
      sessionId: token,
      reserves: body?.reserves,
      reservePhotos: body?.reservePhotos,
      ratings: body?.ratings,
      signatureDataUrl: body?.signatureDataUrl,
      signerName: body?.signerName,
      confirmed: body?.confirmed === true,
      signerIp: getClientIp(request),
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json(session);
  } catch (error) {
    return toRouteErrorResponse(error, 'Impossible de signer ce bon de fin de chantier.');
  }
}
