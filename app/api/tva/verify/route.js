import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import { lookupOfficialVatNumber } from '@/lib/vat-lookup';
import { buildVatPatchFromLookup } from '@/lib/vat-verification.mjs';

export const runtime = 'nodejs';

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

    return NextResponse.json({
      outcome: lookup.outcome,
      source: lookup.source,
      publishedAt: lookup.publishedAt || '',
      checkedAt,
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
