import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import {
  createClientFromDemande,
  excludeDemande,
  getBlocklist,
  getDemande,
  listDemandes,
  removeFromBlocklist,
  updateDemande,
} from '@/lib/demandes-service';
import { getAnalysisProvider } from '@/lib/demande-analysis';

export const runtime = 'nodejs';

/**
 * Demandes de devis reçues par e-mail (page /demande). Administrateurs
 * uniquement (vérifié dans le service).
 *  - GET            → liste allégée, expéditeurs exclus, fournisseur d'analyse IA ;
 *  - GET ?id=…      → une demande complète (messages, analyse).
 */
export async function GET(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const id = new URL(request.url).searchParams.get('id');
    if (id) {
      return NextResponse.json({ demande: await getDemande(user, id) });
    }
    const analysisProvider = getAnalysisProvider();
    return NextResponse.json({
      demandes: await listDemandes(user),
      blocklist: await getBlocklist(user),
      analysisConfigured: Boolean(analysisProvider.provider),
      analysisProvider: analysisProvider.label,
    });
  } catch (error) {
    return toRouteErrorResponse(error, 'Impossible de charger les demandes.');
  }
}

/**
 * Actions : { action, id?, data? }
 *  - update           : data { status?, notes? }                → { demande }
 *  - create-client    :                                        → { clientId, created, demande }
 *  - exclude          : data { blockSender?, blockDomain? }     → { demande, blocklist }
 *  - blocklist-remove : data { email? | domain? }               → { blocklist }
 */
export async function POST(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const body = await request.json();
    const action = body?.action;

    if (action === 'update') {
      return NextResponse.json({ demande: await updateDemande(user, body?.id, body?.data) });
    }
    if (action === 'create-client') {
      return NextResponse.json(await createClientFromDemande(user, body?.id));
    }
    if (action === 'exclude') {
      return NextResponse.json(await excludeDemande(user, body?.id, body?.data || {}));
    }
    if (action === 'blocklist-remove') {
      return NextResponse.json({ blocklist: await removeFromBlocklist(user, body?.data || {}) });
    }
    return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
  } catch (error) {
    return toRouteErrorResponse(error, "Impossible d'enregistrer cette modification.");
  }
}
