import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import { lookupOfficialVatNumber } from '@/lib/vat-lookup';
import {
  VAT_LOOKUP_OUTCOMES,
  buildVatPatchFromLookup,
  describeVatLookupSources,
} from '@/lib/vat-verification.mjs';

export const runtime = 'nodejs';
// Consultations en chaîne avec relances (index DGFiP puis VIES) : le délai par
// défaut de dix secondes des fonctions Vercel serait trop court.
export const maxDuration = 60;

/**
 * Vérification du n° de TVA intracommunautaire d'un client auprès des sources
 * officielles (DGFiP puis VIES). Retourne les champs à enregistrer sur la fiche
 * client : un numéro non confirmé reste marqué CALCULATED_UNVERIFIED.
 */
export async function GET(request) {
  try {
    await verifyFirebaseUserFromRequest(request);

    const { searchParams } = new URL(request.url);
    const siren = searchParams.get('siren') || '';
    const vatNumber = searchParams.get('vatNumber') || '';

    const lookup = await lookupOfficialVatNumber({ siren, vatNumber });
    const checkedAt = new Date().toISOString();
    const detail = describeVatLookupSources(lookup.sources);

    // Trace serveur : c'est elle qui permet de diagnostiquer une panne de
    // source depuis les journaux Vercel.
    if (lookup.outcome === VAT_LOOKUP_OUTCOMES.UNAVAILABLE) {
      console.warn(`[tva/verify] Sources officielles injoignables (${detail})`);
    } else if (lookup.outcome === VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP) {
      console.info(`[tva/verify] SIREN ${siren} absent de l’extraction DGFiP (${detail})`);
    }

    return NextResponse.json({
      outcome: lookup.outcome,
      source: lookup.source,
      publishedAt: lookup.publishedAt || '',
      checkedAt,
      sources: lookup.sources,
      detail,
      patch: buildVatPatchFromLookup({
        ...lookup,
        siren,
        checkedAt,
        declaredNumber: vatNumber,
      }),
    });
  } catch (error) {
    return toRouteErrorResponse(error, 'Impossible de vérifier le numéro de TVA.');
  }
}
