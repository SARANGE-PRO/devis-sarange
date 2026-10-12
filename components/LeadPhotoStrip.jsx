'use client';

import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';

import { useFirebaseAuth } from '@/components/FirebaseProvider';

/**
 * Vignettes des photos qu'un visiteur a jointes à sa demande sur le site,
 * sous la ligne du brouillon de devis (bloc « Demande du site » du panier).
 * Les URLs signées viennent de GET /api/leads/photos, une fois par projet et
 * par session : plusieurs lignes du même devis partagent la même lecture.
 */

const photosByLead = new Map();

const loadLeadPhotos = (user, leadId) => {
  if (!photosByLead.has(leadId)) {
    const promise = (async () => {
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/leads/photos?leadId=${encodeURIComponent(leadId)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      return Array.isArray(payload?.photos) ? payload.photos : [];
    })().catch((error) => {
      photosByLead.delete(leadId);
      console.error('[LeadPhotoStrip] photos illisibles :', error);
      return [];
    });
    photosByLead.set(leadId, promise);
  }
  return photosByLead.get(leadId);
};

/**
 * @param {{leadId: string, uploadIds?: string[]|null}} props
 *   `uploadIds` restreint aux photos de cette ligne ; absent, toutes les photos
 *   du projet (demande sans correspondance ligne par ligne).
 */
export default function LeadPhotoStrip({ leadId, uploadIds = null }) {
  const { user } = useFirebaseAuth();
  const [photos, setPhotos] = useState(null);

  useEffect(() => {
    if (!user || !leadId) return undefined;
    let alive = true;
    loadLeadPhotos(user, leadId).then((list) => {
      if (alive) setPhotos(list);
    });
    return () => {
      alive = false;
    };
  }, [user, leadId]);

  if (!photos) return null;
  const shown = Array.isArray(uploadIds) ? photos.filter((photo) => uploadIds.includes(photo.uploadId)) : photos;
  if (!shown.length) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <Camera size={12} className="text-amber-700" aria-hidden="true" />
      {shown.map((photo) => (
        <a
          key={photo.uploadId}
          href={photo.url}
          target="_blank"
          rel="noopener noreferrer"
          title={photo.name || 'Photo envoyée depuis le site'}
          className="block h-14 w-14 overflow-hidden rounded-md bg-white ring-1 ring-amber-200 transition-shadow hover:ring-2 hover:ring-amber-400"
        >
          {/* URL signée Storage, temporaire : hors du périmètre de next/image (pas de domaine à autoriser pour une heure). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt={photo.name || 'Photo envoyée depuis le site'} className="h-full w-full object-cover" loading="lazy" />
        </a>
      ))}
    </div>
  );
}
