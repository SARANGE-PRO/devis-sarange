import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import { analyzeDemande } from '@/lib/demande-analysis';
import { getDemande, loadAnalyzableAttachments, saveDemandeAnalysis } from '@/lib/demandes-service';

export const runtime = 'nodejs';
// L'appel au modèle prend couramment 15 à 40 s : au-delà des 10 s par défaut.
export const maxDuration = 60;

/**
 * Bouton « Analyser avec Claude » : { id }. Lit la demande et ses pièces
 * jointes lisibles, appelle le modèle une fois, enregistre le résultat
 * normalisé et renvoie la demande complète. Administrateurs uniquement.
 */
export async function POST(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);
    const body = await request.json();
    const demande = await getDemande(user, body?.id);
    const attachments = await loadAnalyzableAttachments(demande);
    const { analysis, meta } = await analyzeDemande({ demande, attachments });
    const updated = await saveDemandeAnalysis(user, demande.id, { analysis, meta });
    return NextResponse.json({ demande: updated });
  } catch (error) {
    console.error('Erreur API /demandes/analyze :', error);
    return toRouteErrorResponse(error, "L'analyse a échoué.");
  }
}
