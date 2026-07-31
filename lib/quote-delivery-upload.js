// Upload des PDF de devis vers le serveur AVANT la requête d'envoi.
//
// Pourquoi : l'hébergement (Vercel) rejette toute requête dont le corps dépasse
// ~4,5 Mo (413 Content Too Large). Un devis multi-variantes embarque le PDF
// comparatif + un PDF signable PAR variante ; le tout en base64 dans un seul
// JSON dépasse vite cette limite. On téléverse donc chaque PDF séparément, en
// morceaux de 2 Mo, puis la requête d'envoi ne transporte plus que des
// identifiants d'upload (quelques Ko).

const CHUNK_BYTES = 2 * 1024 * 1024;

const arrayBufferToBase64 = (bytesOrBuffer) => {
  const bytes = new Uint8Array(bytesOrBuffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return window.btoa(binary);
};

// Identifiant opaque généré côté client : le serveur le préfixe toujours par
// l'uid authentifié, un client ne peut donc jamais lire/écraser l'upload d'un autre.
const buildUploadId = () => {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return `up_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

// Les erreurs d'infrastructure (413, 502, passerelles...) renvoient du texte
// brut ou du HTML : un `response.json()` direct lèverait "Unexpected token".
export const readJsonResponse = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const describeQuoteSendFailure = (response) =>
  response.status === 413
    ? 'Le devis est trop volumineux pour être transmis. Réessayez ; si le problème persiste, réduisez le poids des photos du devis.'
    : `Impossible d'envoyer le devis (erreur ${response.status}).`;

/**
 * Téléverse un PDF en morceaux vers /api/quote-signatures/upload et retourne
 * l'identifiant d'upload à référencer dans la requête d'envoi (`pdfUploadId`).
 */
export const uploadQuoteDeliveryPdf = async ({ idToken, arrayBuffer }) => {
  const bytes = new Uint8Array(arrayBuffer);
  const totalChunks = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES));
  const uploadId = buildUploadId();

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const chunk = bytes.subarray(chunkIndex * CHUNK_BYTES, (chunkIndex + 1) * CHUNK_BYTES);
    const response = await fetch('/api/quote-signatures/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        uploadId,
        chunkIndex,
        totalChunks,
        chunkBase64: arrayBufferToBase64(chunk),
      }),
    });

    if (!response.ok) {
      const data = await readJsonResponse(response);
      throw new Error(data?.error || describeQuoteSendFailure(response));
    }
  }

  return uploadId;
};
