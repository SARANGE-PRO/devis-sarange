import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import { getAccessAdminView, updateAccessConfig } from '@/lib/access-service';

export const runtime = 'nodejs';

/** Vue d'administration (Paramètres > Accès à l'application). Administrateurs uniquement. */
export async function GET(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    return NextResponse.json(await getAccessAdminView(user));
  } catch (error) {
    return toRouteErrorResponse(error, "Impossible de lire la configuration d'accès.");
  }
}

/** Action d'administration : { action: 'add' | 'remove' | 'set-enforced', email?, role?, enforced? }. */
export async function POST(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const body = await request.json();
    return NextResponse.json(
      await updateAccessConfig(user, {
        action: body?.action,
        email: body?.email,
        role: body?.role,
        enforced: body?.enforced,
      })
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Impossible de modifier la configuration d'accès.");
  }
}
