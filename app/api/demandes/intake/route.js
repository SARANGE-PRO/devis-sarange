import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { ingestDemande, listExclusionsSince } from '@/lib/demandes-service';

export const runtime = 'nodejs';

/**
 * Échanges serveur à serveur avec le scan Apps Script
 * (site-sarange/google-apps-script/sarange-inbox-scan.gs), jamais depuis le
 * navigateur : secret partagé dans l'en-tête `x-inbox-secret`
 * (INBOX_SCAN_SECRET, à défaut SITE_LEADS_SECRET déjà utilisé par /api/leads).
 *
 *  - POST : réception d'un fil Gmail. Le script ne décide rien : la réponse
 *    lui dit si le fil a été retenu (`stored`), avec quelle confiance, et s'il
 *    doit poser le libellé Gmail « DEVIS A FAIRE » (`label`).
 *  - GET ?exclusions=1&since=ISO : fils exclus à la main depuis cette date,
 *    pour que le script retire le libellé des fausses demandes.
 */
const authorize = (request) => {
  const secret = (process.env.INBOX_SCAN_SECRET || process.env.SITE_LEADS_SECRET || '').trim();
  if (!secret) {
    return NextResponse.json(
      { error: 'Réception des demandes non configurée (INBOX_SCAN_SECRET).' },
      { status: 503 }
    );
  }
  const provided = request.headers.get('x-inbox-secret') || '';
  if (provided !== secret) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }
  return null;
};

export async function POST(request) {
  try {
    const denied = authorize(request);
    if (denied) return denied;
    const body = await request.json();
    const result = await ingestDemande(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Erreur API /demandes/intake :', error);
    return toRouteErrorResponse(error, "Impossible d'enregistrer cette demande.");
  }
}

export async function GET(request) {
  try {
    const denied = authorize(request);
    if (denied) return denied;
    const url = new URL(request.url);
    if (url.searchParams.get('exclusions') !== '1') {
      return NextResponse.json({ error: 'Paramètre attendu : exclusions=1.' }, { status: 400 });
    }
    const exclusions = await listExclusionsSince(url.searchParams.get('since') || '');
    return NextResponse.json({ exclusions, now: new Date().toISOString() });
  } catch (error) {
    console.error('Erreur API /demandes/intake (exclusions) :', error);
    return toRouteErrorResponse(error, 'Impossible de lister les exclusions.');
  }
}
