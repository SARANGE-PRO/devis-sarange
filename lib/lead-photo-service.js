import 'server-only';

import crypto from 'node:crypto';

import { getFirebaseAdminStorage, isFirebaseAdminConfigured } from '@/lib/firebase/admin';

/**
 * Photos du configurateur du site. SERVEUR UNIQUEMENT (Admin SDK).
 *
 * Le site compresse chaque photo dans le téléphone (1600 px, JPEG) et
 * l'envoie DÈS LA PRISE, photo par photo, à la route publique
 * POST /api/leads/photos, sous l'identifiant du projet (`leadId`, généré dans
 * le téléphone) : la limite de ~4,5 Mo par requête s'applique ainsi par
 * photo, et une photo qui échoue n'empêche jamais la demande. Les fichiers
 * vivent dans Firebase Storage sous `configurateur-photos/{leadId}/`, et le
 * brouillon de devis les retrouve par ce même `leadId` (lib/lead-quote-
 * service.js), avec ou sans la correspondance ligne par ligne que le script
 * Google relaie dans `project_json`.
 *
 * La route est publique (comme le script Google) : taille, type réel du
 * fichier (signature binaire), nombre par projet et forme du `leadId` sont
 * contrôlés ici.
 */

export const LEAD_PHOTOS_ROOT = 'configurateur-photos';
export const MAX_LEAD_PHOTOS = 30;
export const MAX_LEAD_PHOTO_BYTES = 2_500_000;
export const LEAD_PHOTO_URL_TTL_MS = 60 * 60 * 1000;

const LEAD_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const UPLOAD_ID_PATTERN = /^lp_[a-f0-9]{32}$/;

const createHttpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const ensureServerConfig = () => {
  if (!isFirebaseAdminConfigured()) {
    throw createHttpError('Stockage des photos non configuré.', 503);
  }
};

export const normalizeLeadId = (value) => {
  const leadId = String(value || '').trim();
  return LEAD_ID_PATTERN.test(leadId) ? leadId : '';
};

/** Type d'image d'après la signature binaire, jamais d'après l'en-tête annoncé. */
export const sniffImageType = (buffer) => {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { contentType: 'image/jpeg', extension: 'jpg' };
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return { contentType: 'image/png', extension: 'png' };
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { contentType: 'image/webp', extension: 'webp' };
  return null;
};

const leadPrefix = (leadId) => `${LEAD_PHOTOS_ROOT}/${leadId}/`;
const toInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};
const text = (value, max) => String(value ?? '').trim().slice(0, max);

/**
 * Enregistre UNE photo d'un projet du configurateur.
 * @param {{leadId: string, buffer: Buffer, name?: string, width?: number|string, height?: number|string, photoId?: string}} input
 * @returns {Promise<{uploadId: string, count: number}>}
 */
export const stageLeadPhoto = async ({ leadId, buffer, name = '', width = 0, height = 0, photoId = '' }) => {
  ensureServerConfig();
  const normalizedLeadId = normalizeLeadId(leadId);
  if (!normalizedLeadId) throw createHttpError('Identifiant de projet invalide.', 400);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw createHttpError('Photo vide.', 400);
  if (buffer.length > MAX_LEAD_PHOTO_BYTES) throw createHttpError('Photo trop lourde (2,5 Mo maximum).', 413);
  const type = sniffImageType(buffer);
  if (!type) throw createHttpError('Format de photo non reconnu (JPEG, PNG ou WebP).', 415);

  const bucket = getFirebaseAdminStorage().bucket();
  const prefix = leadPrefix(normalizedLeadId);
  const [existing] = await bucket.getFiles({ prefix });
  if (existing.length >= MAX_LEAD_PHOTOS) {
    throw createHttpError(`Nombre maximum de photos atteint (${MAX_LEAD_PHOTOS}).`, 400);
  }

  const uploadId = `lp_${crypto.randomBytes(16).toString('hex')}`;
  await bucket.file(`${prefix}${uploadId}.${type.extension}`).save(buffer, {
    resumable: false,
    metadata: {
      contentType: type.contentType,
      cacheControl: 'private, max-age=0, no-store',
      metadata: {
        leadId: normalizedLeadId,
        photoId: text(photoId, 60),
        name: text(name, 120),
        width: String(toInt(width)),
        height: String(toInt(height)),
      },
    },
  });

  return { uploadId, count: existing.length + 1 };
};

/**
 * Les photos déjà reçues pour un projet, dans l'ordre d'arrivée.
 * @returns {Promise<Array<{uploadId: string, path: string, contentType: string, name: string, photoId: string, width: number, height: number, size: number, createdAt: string}>>}
 */
export const listLeadPhotos = async (leadId) => {
  const normalizedLeadId = normalizeLeadId(leadId);
  if (!normalizedLeadId || !isFirebaseAdminConfigured()) return [];
  const bucket = getFirebaseAdminStorage().bucket();
  const [files] = await bucket.getFiles({ prefix: leadPrefix(normalizedLeadId) });
  return files
    .map((file) => {
      const base = String(file.name).split('/').pop() || '';
      const uploadId = base.replace(/\.[a-z0-9]+$/i, '');
      if (!UPLOAD_ID_PATTERN.test(uploadId)) return null;
      const meta = file.metadata || {};
      const custom = meta.metadata || {};
      return {
        uploadId,
        path: file.name,
        contentType: meta.contentType || 'image/jpeg',
        name: text(custom.name, 120),
        photoId: text(custom.photoId, 60),
        width: toInt(custom.width),
        height: toInt(custom.height),
        size: toInt(meta.size),
        createdAt: meta.timeCreated || '',
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
};

/** Les mêmes photos avec une URL de lecture signée (une heure), pour l'app. */
export const signLeadPhotos = async (photos) => {
  const bucket = getFirebaseAdminStorage().bucket();
  const expires = Date.now() + LEAD_PHOTO_URL_TTL_MS;
  const out = [];
  for (const photo of photos) {
    try {
      const [url] = await bucket.file(photo.path).getSignedUrl({ version: 'v4', action: 'read', expires });
      out.push({ ...photo, url });
    } catch (error) {
      console.error(`[leads/photos] URL signée impossible pour ${photo.path} :`, error);
    }
  }
  return out;
};
