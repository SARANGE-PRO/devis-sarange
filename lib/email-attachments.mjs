/**
 * email-attachments.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Pièces jointes supplémentaires de l'e-mail d'envoi d'un devis (PDF, JPG,
 * PNG) : limites, reconnaissance du type par les premiers octets (jamais par
 * l'extension seule), noms de fichier sûrs, tailles lisibles.
 *
 * Module pur (aucun import) : testable par le runner Node, partagé par la
 * fenêtre de vérification (contrôles avant envoi) et le serveur (contrôles
 * réels).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const ATTACHMENT_LIMITS = Object.freeze({
  maxFiles: 5,
  maxFileBytes: 8 * 1024 * 1024,
  // Devis compris : les serveurs de messagerie refusent souvent au-delà de
  // 20 à 25 Mo, on garde de la marge.
  maxTotalBytes: 15 * 1024 * 1024,
});

export const ATTACHMENT_CONTENT_TYPES = Object.freeze(['application/pdf', 'image/jpeg', 'image/png']);

// Valeur de l'attribut `accept` du sélecteur de fichiers.
export const ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

const EXTENSION_BY_TYPE = Object.freeze({
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
});

/** Type réel d'un fichier d'après ses premiers octets, ou null s'il n'est pas accepté. */
export const detectAttachmentType = (bytes) => {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) {
    return 'application/pdf';
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return 'image/png';
  }
  return null;
};

/**
 * Nom de fichier sûr (sans chemin ni caractère spécial), borné, avec
 * l'extension qui correspond au type réel.
 */
export const normalizeAttachmentFilename = (name, contentType) => {
  let base = String(name || '')
    .split(/[\\/]/)
    .pop()
    .replace(/[^\p{L}\p{N} ._()-]/gu, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  if (!base) base = 'piece-jointe';

  const extension = EXTENSION_BY_TYPE[contentType];
  if (extension) {
    const lower = base.toLowerCase();
    const hasExtension =
      lower.endsWith(extension) || (extension === '.jpg' && lower.endsWith('.jpeg'));
    if (!hasExtension) base = `${base.replace(/\.[a-z0-9]{2,5}$/i, '')}${extension}`;
  }

  return base;
};

/** Taille lisible : « 812 Ko », « 2,4 Mo ». */
export const formatFileSize = (bytes) => {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
};

/**
 * Contrôle d'une sélection de fichiers AVANT téléversement (nombre, tailles,
 * types déclarés). `extraBytes` = poids déjà pris par le PDF du devis.
 * @returns {string|null} message d'erreur, ou null si tout est acceptable
 */
export const validateAttachmentSelection = (files, { extraBytes = 0 } = {}) => {
  const list = Array.isArray(files) ? files : [];

  if (list.length > ATTACHMENT_LIMITS.maxFiles) {
    return `Au plus ${ATTACHMENT_LIMITS.maxFiles} pièces jointes par envoi.`;
  }

  const tooBig = list.find((file) => Number(file?.size) > ATTACHMENT_LIMITS.maxFileBytes);
  if (tooBig) {
    return `« ${tooBig.name} » dépasse ${formatFileSize(ATTACHMENT_LIMITS.maxFileBytes)}.`;
  }

  const badType = list.find((file) => file?.type && !ATTACHMENT_CONTENT_TYPES.includes(file.type));
  if (badType) {
    return `« ${badType.name} » : seuls les PDF, JPG et PNG sont acceptés.`;
  }

  const total = list.reduce((sum, file) => sum + (Number(file?.size) || 0), 0) + (Number(extraBytes) || 0);
  if (total > ATTACHMENT_LIMITS.maxTotalBytes) {
    return `Devis compris, les pièces jointes dépassent ${formatFileSize(ATTACHMENT_LIMITS.maxTotalBytes)} au total.`;
  }

  return null;
};
