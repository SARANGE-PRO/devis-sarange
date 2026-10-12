import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { getFirebaseAdminDb, resolveSiteLeadsOwnerUid } from '@/lib/firebase/admin';
import {
  buildClientRecord,
  deriveClientDocumentId,
  hasMeaningfulClientData,
  sanitizeClientData,
} from '@/lib/client-cloud';
import { buildLeadDossierLabel } from '@/lib/commission-dossiers.mjs';
import { createLeadCommissionDossier } from '@/lib/commission-service';
import { importLeadQuote } from '@/lib/lead-quote-service';

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
 * Écrit l'identité du prospect (nom, téléphone, email, adresse) plus le
 * récapitulatif de sa demande en champs additionnels (leadJourney,
 * leadProjectSummary, leadMessage). Quand la demande vient du configurateur
 * (`project` + `leadId`, Apps Script v2.8), un devis BROUILLON est créé en
 * plus dans users/{uid}/quotes avec une ligne par menuiserie
 * (lib/lead-quote-service.js) : le bureau ouvre, vérifie et envoie.
 */

// Code postal et ville : le configurateur envoie `zip` (5 chiffres) et `city`
// séparés ; les anciens formulaires un seul champ « 77550 Moissy-Cramayel ».
const resolveLocation = (body) => {
  const zip = String(body?.zip || '').trim();
  const city = String(body?.city || '').trim();
  if (/^\d{4,5}$/.test(zip)) return { codePostal: zip, ville: city };
  const match = zip.match(/^(\d{4,5})\s+(.+)$/);
  if (match) return { codePostal: match[1], ville: city || match[2] };
  return { codePostal: '', ville: city || zip };
};

export async function POST(request) {
  try {
    const secret = (process.env.SITE_LEADS_SECRET || '').trim();
    // Compte destinataire : SITE_LEADS_OWNER_UID, sinon le premier
    // administrateur de DEVIS_ADMIN_EMAILS (le bureau).
    const ownerUid = await resolveSiteLeadsOwnerUid();
    if (!secret || !ownerUid) {
      return NextResponse.json(
        { error: 'Réception des leads non configurée (SITE_LEADS_SECRET / SITE_LEADS_OWNER_UID ou DEVIS_ADMIN_EMAILS).' },
        { status: 503 }
      );
    }

    const provided = request.headers.get('x-leads-secret') || '';
    if (provided !== secret) {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
    }

    const body = await request.json();
    const { codePostal, ville } = resolveLocation(body);

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

    // Chaque demande de prix du site ouvre aussi son dossier de commission
    // (page /commissions), au statut « En attente de devis ». Idempotent
    // (identifiant lead-{clientId}) et best-effort : un échec ici ne bloque
    // jamais l'enregistrement du lead.
    try {
      await createLeadCommissionDossier({
        clientId,
        label: buildLeadDossierLabel({ nom: clientData.nom, prenom: clientData.prenom, ville: clientData.ville }),
      });
    } catch (dossierError) {
      console.error('Dossier de commission non créé pour ce lead :', dossierError);
    }

    // Demande du configurateur : le brouillon de devis avec ses lignes.
    // Best-effort aussi : la fiche client et l'email au bureau sont déjà là.
    let quote = null;
    if (Array.isArray(body?.project?.items) && body.project.items.length > 0) {
      try {
        quote = await importLeadQuote({
          ownerUid,
          clientId,
          clientData,
          project: body.project,
          leadId: body?.leadId || body?.project?.leadId || '',
        });
      } catch (quoteError) {
        console.error('Brouillon de devis non créé pour ce lead :', quoteError);
        quote = { action: 'error' };
      }
    }

    return NextResponse.json({ success: true, clientId, created: !existing.exists, quote });
  } catch (error) {
    console.error('Erreur API /leads:', error);
    return toRouteErrorResponse(error, "Impossible d'enregistrer ce lead.");
  }
}
