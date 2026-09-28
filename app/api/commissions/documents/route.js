import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import {
  addCommissionDocument,
  getCommissionDocument,
  listCommissionDossiers,
  removeCommissionDocument,
} from '@/lib/commission-service';

export const runtime = 'nodejs';

/** Téléchargement d'un document joint : ?dossierId=...&documentId=... */
export async function GET(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const dossierId = request.nextUrl.searchParams.get('dossierId') || '';
    const documentId = request.nextUrl.searchParams.get('documentId') || '';
    const document = await getCommissionDocument(user, { dossierId, documentId });

    return new NextResponse(document.buffer, {
      headers: {
        'Content-Type': document.contentType,
        // Toujours en pièce jointe : un fichier téléversé ne doit jamais
        // s'exécuter dans le contexte de l'application.
        'Content-Disposition': `attachment; filename="${document.filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=0, no-store',
      },
    });
  } catch (error) {
    return toRouteErrorResponse(error, 'Impossible de charger ce document.');
  }
}

/**
 * Action : { action: 'add', dossierId, filename, contentType, dataBase64 }
 *       ou { action: 'remove', dossierId, documentId }.
 * Un fichier par requête, 3 Mo maximum (limite hébergeur ~4,5 Mo/requête).
 */
export async function POST(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const body = await request.json();
    const action = body?.action;

    if (action === 'add') {
      await addCommissionDocument(user, {
        dossierId: body?.dossierId,
        filename: body?.filename,
        contentType: body?.contentType,
        dataBase64: body?.dataBase64,
      });
    } else if (action === 'remove') {
      await removeCommissionDocument(user, {
        dossierId: body?.dossierId,
        documentId: body?.documentId,
      });
    } else {
      return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
    }

    return NextResponse.json({ dossiers: await listCommissionDossiers(user) });
  } catch (error) {
    return toRouteErrorResponse(error, "Impossible d'enregistrer ce document.");
  }
}
