import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { resolveUserAccess, verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

/**
 * Décision d'accès pour le compte connecté, consultée par FirebaseProvider
 * juste après la connexion. Ne refuse jamais la requête elle-même (un compte
 * non autorisé doit pouvoir lire qu'il ne l'est pas) : `enforceAccess: false`.
 */
export async function GET(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request, { enforceAccess: false });
    const access = await resolveUserAccess(user, { fresh: true });
    return NextResponse.json({
      email: user.email || '',
      allowed: access.allowed,
      isAdmin: access.isAdmin,
      enforced: access.enforced,
      reason: access.reason,
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Impossible de vérifier l'accès.");
  }
}
