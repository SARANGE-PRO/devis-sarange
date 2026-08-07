import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import {
  buildClientRecord,
  deriveClientDocumentId,
  hasMeaningfulClientData,
  sanitizeClientData,
} from '@/lib/client-cloud';

export const runtime = 'nodejs';

/**
 * Réception des leads du site public (sarange-contact-form.gs, étape 4 de
 * doPost) : pré-remplit une fiche dans users/{SITE_LEADS_OWNER_UID}/clients
 * pour que le bureau chiffre sans ressaisir nom/téléphone/adresse.
 *
 * Appelée serveur à serveur depuis Apps Script, jamais depuis le navigateur :
 * le secret (SITE_LEADS_SECRET, à définir aussi côté Apps Script dans
 * Propriétés du script → LEADS_API_SECRET) ne doit jamais atteindre un
 * bundle client. Best-effort côté appelant — un échec ici ne bloque jamais
 * l'email au bureau, qui reste le canal garanti.
 *
 * N'écrit QUE l'identité du prospect (nom, téléphone, email, adresse) plus
 * le récapitulatif de sa demande en champs additionnels (leadJourney,
 * leadProjectSummary, leadMessage) : aucune ligne de devis n'est créée ici,
 * le rapprochement entre un item configuré sur le site et une référence du
 * catalogue devis-sarange reste un jugement humain.
 */

const splitZip = (zip) => {
  const match = String(zip || '').trim().match(/^(\d{4,5})\s+(.+)$/);
  return match ? { codePostal: match[1], ville: match[2] } : { codePostal: '', ville: String(zip || '').trim() };
};

export async function POST(request) {
  try {
    const secret = (process.env.SITE_LEADS_SECRET || '').trim();
    const ownerUid = (process.env.SITE_LEADS_OWNER_UID || '').trim();
    if (!secret || !ownerUid) {
      return NextResponse.json(
        { error: 'Réception des leads non configurée (SITE_LEADS_SECRET / SITE_LEADS_OWNER_UID).' },
        { status: 503 }
      );
    }

    const provided = request.headers.get('x-leads-secret') || '';
    if (provided !== secret) {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
    }

    const body = await request.json();
    const { codePostal, ville } = splitZip(body?.zip);

    const clientData = sanitizeClientData({
      nom: body?.name || '',
      telephone: body?.phone || '',
      email: body?.email || '',
      adresse: body?.address || '',
      codePostal,
      ville,
    });

    if (!hasMeaningfulClientData(clientData)) {
      return NextResponse.json({ error: 'Lead vide.' }, { status: 400 });
    }

    const clientId = deriveClientDocumentId(clientData);
    if (!clientId) {
      return NextResponse.json({ error: "Impossible d'identifier ce prospect." }, { status: 400 });
    }

    const record = buildClientRecord({ ...clientData, savedClientId: clientId });

    const db = getFirebaseAdminDb();
    const ref = db.doc(`users/${ownerUid}/clients/${clientId}`);
    const existing = await ref.get();

    await ref.set(
      {
        ...record,
        // Champs additionnels, hors du schéma standard sanitizeClientData :
        // Firestore les tolère, l'app existante les ignore sans erreur tant
        // qu'aucun affichage dédié n'est construit pour eux.
        leadSource: 'site-web',
        leadJourney: body?.journey || null,
        leadFormMode: body?.formMode || null,
        leadProjectSummary: body?.projectSummary || null,
        leadMessage: body?.message || null,
        updatedAt: new Date(),
        lastUsedAt: new Date(),
        ...(existing.exists ? {} : { createdAt: new Date() }),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, clientId, created: !existing.exists });
  } catch (error) {
    console.error('Erreur API /leads:', error);
    return toRouteErrorResponse(error, "Impossible d'enregistrer ce lead.");
  }
}
