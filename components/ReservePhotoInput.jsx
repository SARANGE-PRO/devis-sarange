'use client';

import { useRef } from 'react';
import { Camera, X } from 'lucide-react';

// Compression côté client AVANT tout envoi : le corps de requête serverless
// est limité à ~4,5 Mo, une photo de téléphone en fait 3 à 12. Recadrage à
// 1280 px max et JPEG qualité 0,7 → ~150-400 Ko par photo.
const MAX_EDGE_PX = 1280;
const JPEG_QUALITY = 0.7;

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
 * vignettes supprimables. `photos` est un tableau de dataURL JPEG compressées,
 * prêt à voyager dans le corps JSON de la signature.
 */
export default function ReservePhotoInput({ photos = [], onChange, max = 2 }) {
  const inputRef = useRef(null);

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    const remaining = Math.max(0, max - photos.length);
    const next = [...photos];
    for (const file of files.slice(0, remaining)) {
      try {
        next.push(await compressImageFile(file));
      } catch {
        // Fichier illisible : ignoré silencieusement, les autres passent.
      }
    }
    onChange?.(next);
  };

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((dataUrl, index) => (
          <div key={index} className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={dataUrl} alt={`Photo ${index + 1}`} className="h-full w-full object-cover" />
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
            className="inline-flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 transition-colors hover:border-orange-300 hover:text-orange-500"
          >
            <Camera size={18} />
            <span className="text-[9px] font-bold">Photo</span>
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
