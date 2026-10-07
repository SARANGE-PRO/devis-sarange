import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { ingestDemande } from '@/lib/demandes-service';

export const runtime = 'nodejs';

/**
 * Réception d'un fil Gmail poussé par le scan Apps Script
 * (site-sarange/google-apps-script/sarange-inbox-scan.gs). Serveur à serveur,
 * jamais depuis le navigateur : secret partagé dans l'en-tête `x-inbox-secret`
 * (INBOX_SCAN_SECRET, à défaut SITE_LEADS_SECRET déjà utilisé par /api/leads).
 *
 * Le script ne décide rien : la réponse lui dit si le fil a été retenu
 * (`stored`), avec quelle confiance, et s'il doit poser le libellé Gmail
 * « DEVIS A FAIRE » (`label`).
 */
export async function POST(request) {
  try {
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

    const body = await request.json();
    const result = await ingestDemande(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Erreur API /demandes/intake :', error);
    return toRouteErrorResponse(error, "Impossible d'enregistrer cette demande.");
  }
}
