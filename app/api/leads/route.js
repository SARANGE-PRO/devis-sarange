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
import { cleanLeadField, splitLeadAddress } from '@/lib/lead-address.mjs';
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
      // Trace sans la valeur : un refus se lit dans les journaux Vercel.
      console.warn(`[leads] refus 401 : secret ${provided ? 'différent' : 'absent'} (en-tête x-leads-secret)`);
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
    }

    const body = await request.json();

    // L'adresse arrive entière (libellé de l'autocomplétion du site, ou texte
    // tapé) et l'Apps Script ne relaie pas la ville : elle est reprise du
    // projet du configurateur, puis l'adresse est découpée en voie, code
    // postal et ville comme la fiche client le fait au bureau. Les
    // « Non renseigné » de l'Apps Script redeviennent des champs vides.
    const { adresse, codePostal, ville } = splitLeadAddress({
      address: body?.address,
      zip: body?.zip,
      city: body?.city || body?.project?.contact?.city,
    });

    const clientData = sanitizeClientData({
      nom: cleanLeadField(body?.name),
      telephone: cleanLeadField(body?.phone),
      email: cleanLeadField(body?.email),
      adresse,
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

    // Une ligne par lead dans les journaux Vercel : de quoi vérifier qu'une
    // demande du site est bien arrivée, et ce qu'elle a produit.
    console.log(
      `[leads] ${body?.journey || body?.formMode || 'lead'} · client ${clientId} (${existing.exists ? 'mis à jour' : 'créé'})` +
        ` · lead ${String(body?.leadId || '').slice(0, 8) || '-'} · ${Array.isArray(body?.project?.items) ? body.project.items.length : 0} ligne(s)` +
        ` · devis ${quote ? `${quote.action}${quote.quoteId ? ` ${quote.quoteId}` : ''}${quote.photoCount ? ` · ${quote.photoCount} photo(s)` : ''}${quote.reason ? ` (${quote.reason})` : ''}` : 'sans projet'}`
    );

    return NextResponse.json({ success: true, clientId, created: !existing.exists, quote });
  } catch (error) {
    console.error('Erreur API /leads:', error);
    return toRouteErrorResponse(error, "Impossible d'enregistrer ce lead.");
  }
}
