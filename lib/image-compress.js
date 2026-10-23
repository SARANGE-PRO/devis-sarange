// Compression des photos ajoutées à un produit hors catalogue (ou à un bloc
// texte). Une photo de téléphone brute pèse plusieurs Mo en data-URL : la
// sauvegarde cloud l'effaçait (plafond MAX_CUSTOM_IMAGE_LENGTH de
// lib/quote-cloud.js) et le brouillon local échouait sur le quota du
// navigateur. On réduit donc l'image AVANT de la mettre dans le devis, en
// descendant définition puis qualité jusqu'à passer sous le plafond.

// Marge sous les 120 000 caractères de quote-cloud.js, et un devis de 8 à 9
// photos reste sous la limite de 1 Mo d'un document Firestore.
export const CUSTOM_IMAGE_TARGET_LENGTH = 100000;

const EDGE_STEPS_PX = [1400, 1200, 1000, 850, 700, 560, 440];
const QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52];

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image illisible'));
    };
    image.src = objectUrl;
  });

const renderJpeg = (image, maxEdge, quality) => {
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  // Fond blanc : un PNG transparent passé en JPEG deviendrait noir.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
};

export const compressCustomImageFile = async (
  file,
  targetLength = CUSTOM_IMAGE_TARGET_LENGTH
) => {
  const image = await loadImage(file);
  let smallest = null;
  for (const edge of EDGE_STEPS_PX) {
    for (const quality of QUALITY_STEPS) {
      const dataUrl = renderJpeg(image, edge, quality);
      if (dataUrl.length <= targetLength) return dataUrl;
      if (!smallest || dataUrl.length < smallest.length) smallest = dataUrl;
    }
  }
  // Image extrêmement chargée : la plus légère obtenue, jamais l'originale.
  return smallest;
};
