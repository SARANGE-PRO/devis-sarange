import { NextResponse } from 'next/server';

import { verifyFirebaseUserFromRequest } from '@/lib/firebase/admin';
import { listLeadPhotos, normalizeLeadId, signLeadPhotos, stageLeadPhoto } from '@/lib/lead-photo-service';

export const runtime = 'nodejs';

/**
 * Photos du configurateur du site.
 *
 * POST (public, appelé depuis le navigateur du visiteur, sur www.sarange.fr) :
 * UNE photo par requête, en multipart (`photo`, `leadId`, `photoId`, `name`,
 * `width`, `height`), envoyée dès la prise. Réponse `{ uploadId, count }`.
 * Le site et l'app n'étant pas sur le même domaine, les réponses portent les
 * en-têtes CORS pour les origines du site seulement.
 *
 * GET (utilisateur de l'app, jeton Firebase) : les photos d'un projet avec
 * une URL de lecture signée d'une heure, pour les afficher sous les lignes
 * du brouillon de devis (components/LeadPhotoStrip.jsx).
 */

const ALLOWED_ORIGINS = [
  /^https:\/\/(www\.)?sarange\.fr$/,
  /^https:\/\/site-sarange(-[a-z0-9-]+)?\.vercel\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
];

const corsHeaders = (request) => {
  const origin = request.headers.get('origin') || '';
  if (!ALLOWED_ORIGINS.some((pattern) => pattern.test(origin))) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

const jsonWithCors = (request, body, status = 200) =>
  NextResponse.json(body, { status, headers: corsHeaders(request) });

const errorWithCors = (request, error, fallback) =>
  jsonWithCors(
    request,
    { error: error?.message || fallback },
    Number.isInteger(error?.statusCode) ? error.statusCode : 500
  );

export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get('photo');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return jsonWithCors(request, { error: 'Photo manquante.' }, 400);
    }
    const result = await stageLeadPhoto({
      leadId: form.get('leadId'),
      buffer: Buffer.from(await file.arrayBuffer()),
      name: form.get('name') || file.name || '',
      width: form.get('width'),
      height: form.get('height'),
      photoId: form.get('photoId'),
    });
    return jsonWithCors(request, result);
  } catch (error) {
    console.error('[leads/photos] dépôt refusé :', error?.message || error);
    return errorWithCors(request, error, "Impossible d'envoyer la photo.");
  }
}

export async function GET(request) {
  try {
    await verifyFirebaseUserFromRequest(request);
    const leadId = normalizeLeadId(new URL(request.url).searchParams.get('leadId'));
    if (!leadId) return NextResponse.json({ error: 'Identifiant de projet invalide.' }, { status: 400 });
    const photos = await signLeadPhotos(await listLeadPhotos(leadId));
    return NextResponse.json({
      leadId,
      photos: photos.map(({ uploadId, name, photoId, width, height, size, createdAt, url }) => ({
        uploadId, name, photoId, width, height, size, createdAt, url,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'Impossible de lire les photos.' },
      { status: Number.isInteger(error?.statusCode) ? error.statusCode : 401 }
    );
  }
}
