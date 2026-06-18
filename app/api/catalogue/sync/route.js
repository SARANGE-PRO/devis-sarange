import { NextResponse } from 'next/server';

import { toRouteErrorResponse } from '@/lib/api-route-errors';
import { getFirebaseAdminDb, verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

const parseUidList = (value) =>
  (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

// Pousse la config catalogue du compte propriétaire vers les comptes de l'équipe.
// - Propriétaire autorisé : CATALOGUE_SYNC_OWNER_UID (un seul UID).
// - Destinataires : CATALOGUE_SYNC_TARGET_UIDS (UID séparés par des virgules).
// Les destinataires sont fixés côté serveur : aucun UID n'est accepté depuis le client.
export async function POST(request) {
  try {
    const user = await verifyFirebaseUserFromRequest(request);

    const ownerUid = (process.env.CATALOGUE_SYNC_OWNER_UID || '').trim();
    const targetUids = parseUidList(process.env.CATALOGUE_SYNC_TARGET_UIDS);

    if (!ownerUid || targetUids.length === 0) {
      return NextResponse.json(
        {
          error:
            "Synchronisation non configurée (CATALOGUE_SYNC_OWNER_UID / CATALOGUE_SYNC_TARGET_UIDS).",
        },
        { status: 503 }
      );
    }

    if (user.uid !== ownerUid) {
      return NextResponse.json(
        { error: "Action réservée à l'administrateur du catalogue." },
        { status: 403 }
      );
    }

    const db = getFirebaseAdminDb();
    const sourceSnap = await db.doc(`users/${ownerUid}/catalogue/config`).get();

    if (!sourceSnap.exists) {
      return NextResponse.json(
        { error: "Aucun catalogue à synchroniser : enregistrez d'abord vos réglages." },
        { status: 404 }
      );
    }

    const data = sourceSnap.data();
    const recipients = targetUids.filter((uid) => uid !== ownerUid);

    const writes = await Promise.allSettled(
      recipients.map((uid) =>
        db
          .doc(`users/${uid}/catalogue/config`)
          .set({ ...data, updatedAt: new Date() }, { merge: true })
      )
    );

    const synced = recipients.filter((_, index) => writes[index].status === 'fulfilled');
    const failed = recipients.filter((_, index) => writes[index].status === 'rejected');

    if (failed.length > 0) {
      console.error('Échecs synchronisation catalogue:', failed);
    }

    return NextResponse.json({
      total: recipients.length,
      synced: synced.length,
      failed: failed.length,
    });
  } catch (error) {
    console.error('Erreur API /catalogue/sync:', error);
    return toRouteErrorResponse(error, 'Impossible de synchroniser le catalogue.');
  }
}
