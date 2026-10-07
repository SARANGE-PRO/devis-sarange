import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import {
  createClientFromDemande,
  getDemande,
  listDemandes,
  updateDemande,
} from '@/lib/demandes-service';
import { isAnalysisConfigured } from '@/lib/demande-analysis';

export const runtime = 'nodejs';

/**
 * Demandes de devis reçues par e-mail (page /demande). Administrateurs
 * uniquement (vérifié dans le service).
 *  - GET            → liste allégée + indicateur « analyse configurée » ;
 *  - GET ?id=…      → une demande complète (messages, analyse).
 */
export async function GET(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const id = new URL(request.url).searchParams.get('id');
    if (id) {
      return NextResponse.json({ demande: await getDemande(user, id) });
    }
    return NextResponse.json({
      demandes: await listDemandes(user),
      analysisConfigured: isAnalysisConfigured(),
    });
  } catch (error) {
    return toRouteErrorResponse(error, 'Impossible de charger les demandes.');
  }
}

/** Action : { action: 'update' | 'create-client', id, data? }. Renvoie la demande à jour. */
export async function POST(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const body = await request.json();
    const action = body?.action;

    if (action === 'update') {
      return NextResponse.json({ demande: await updateDemande(user, body?.id, body?.data) });
    }
    if (action === 'create-client') {
      const result = await createClientFromDemande(user, body?.id);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
  } catch (error) {
    return toRouteErrorResponse(error, "Impossible d'enregistrer cette modification.");
  }
}
