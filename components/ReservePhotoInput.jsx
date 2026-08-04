'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';

// Compression côté client AVANT tout envoi. Chaque photo partant dans SA
// propre requête (staging /photo-upload), la limite ~4,5 Mo par requête
// s'applique par photo : on peut se permettre une meilleure définition que
// si tout voyageait dans le corps de la signature.
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.78;

const compressImageFile = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, MAX_EDGE_PX / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image illisible'));
    };
    image.src = objectUrl;
  });

/**
 * Ajout de photos à un signalement de réserve : bouton appareil photo,
 * vignettes supprimables. Chaque photo est TÉLÉVERSÉE IMMÉDIATEMENT en
 * staging (une requête par photo) ; en cas d'échec réseau elle est
 * conservée localement et repartira dans le corps de la signature (chemin
 * de secours, plafonné plus bas côté serveur).
 *
 * `photos` : [{ dataUrl, uploaded }] — `uploadContext` : { token } pour le
 * flux lié à un devis, ou { uploadId, onUploadId } pour le flux générique
 * (l'identifiant est créé par le serveur à la première photo).
 */
export default function ReservePhotoInput({ photos = [], onChange, max = 3, uploadContext = null }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const stagePhoto = async (dataUrl) => {
    if (!uploadContext) return false;
    try {
      const response = await fetch('/api/completion-certificates/photo-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: uploadContext.token || undefined,
          uploadId: uploadContext.uploadId || undefined,
          photo: dataUrl,
        }),
      });
      if (!response.ok) return false;
      const data = await response.json().catch(() => ({}));
      if (data?.uploadId && uploadContext.onUploadId) uploadContext.onUploadId(data.uploadId);
      return true;
    } catch {
      return false;
    }
  };

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    const remaining = Math.max(0, max - photos.length);
    if (!remaining) return;

    setUploading(true);
    const next = [...photos];
    for (const file of files.slice(0, remaining)) {
      try {
        const dataUrl = await compressImageFile(file);
        const uploaded = await stagePhoto(dataUrl);
        next.push({ dataUrl, uploaded });
      } catch {
        // Fichier illisible : ignoré silencieusement, les autres passent.
      }
    }
    setUploading(false);
    onChange?.(next);
  };

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((photo, index) => (
          <div key={index} className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.dataUrl} alt={`Photo ${index + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange?.(photos.filter((_, i) => i !== index))}
              aria-label="Supprimer la photo"
              className="absolute right-0.5 top-0.5 rounded-full bg-slate-900/70 p-0.5 text-white"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        {photos.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 transition-colors hover:border-orange-300 hover:text-orange-500 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
            <span className="text-[9px] font-bold">{uploading ? 'Envoi…' : 'Photo'}</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleFiles}
        className="hidden"
      />
    </div>
  );
}
