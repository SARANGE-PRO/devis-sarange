import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import {
  createCommissionDossier,
  deleteCommissionDossier,
  importLeadCommissionDossiers,
  listCommissionDossiers,
  updateCommissionDossier,
} from '@/lib/commission-service';

export const runtime = 'nodejs';

/** Dossiers de commission (page discrète /commissions). Administrateurs uniquement. */
export async function GET(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    return NextResponse.json({ dossiers: await listCommissionDossiers(user) });
  } catch (error) {
    return toRouteErrorResponse(error, 'Impossible de charger les dossiers.');
  }
}

/**
 * Action : { action: 'create' | 'update' | 'delete' | 'import-leads', id?, data? }.
 * Renvoie la liste à jour après chaque action (volume faible, client simple).
 */
export async function POST(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const body = await request.json();
    const action = body?.action;

    let imported = null;
    if (action === 'create') {
      await createCommissionDossier(user, body?.data);
    } else if (action === 'update') {
      await updateCommissionDossier(user, body?.id, body?.data);
    } else if (action === 'delete') {
      await deleteCommissionDossier(user, body?.id);
    } else if (action === 'import-leads') {
      imported = await importLeadCommissionDossiers(user);
    } else {
      return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
    }

    return NextResponse.json({
      dossiers: await listCommissionDossiers(user),
      ...(imported ? { imported } : {}),
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Impossible d'enregistrer cette modification.");
  }
}
