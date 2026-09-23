import assert from 'node:assert/strict';
import {
  ATTACHMENT_LIMITS,
  detectAttachmentType,
  formatFileSize,
  normalizeAttachmentFilename,
  validateAttachmentSelection,
} from '../lib/email-attachments.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('type reconnu par les premiers octets, jamais par l’extension', () => {
  assert.equal(detectAttachmentType(Buffer.from('%PDF-1.7 …')), 'application/pdf');
  assert.equal(detectAttachmentType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), 'image/jpeg');
  assert.equal(detectAttachmentType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png');
  // Exécutable renommé en .pdf, texte, vide : refusés.
  assert.equal(detectAttachmentType(Buffer.from('MZ\x90\x00 programme')), null);
  assert.equal(detectAttachmentType(Buffer.from('bonjour')), null);
  assert.equal(detectAttachmentType(new Uint8Array()), null);
});

run('nom de fichier sûr, extension cohérente avec le type réel', () => {
  assert.equal(normalizeAttachmentFilename('Plan cuisine.pdf', 'application/pdf'), 'Plan cuisine.pdf');
  assert.equal(normalizeAttachmentFilename('../../etc/passwd', 'application/pdf'), 'passwd.pdf');
  assert.equal(normalizeAttachmentFilename('photo façade.jpeg', 'image/jpeg'), 'photo façade.jpeg');
  assert.equal(normalizeAttachmentFilename('capture', 'image/png'), 'capture.png');
  assert.equal(normalizeAttachmentFilename('faux.pdf', 'image/jpeg'), 'faux.jpg');
  assert.equal(normalizeAttachmentFilename('', 'application/pdf'), 'piece-jointe.pdf');
  assert.ok(normalizeAttachmentFilename('a'.repeat(200) + '.pdf', 'application/pdf').length <= 84);
});

run('tailles lisibles', () => {
  assert.equal(formatFileSize(512), '512 o');
  assert.equal(formatFileSize(831_488), '812 Ko');
  assert.equal(formatFileSize(2.4 * 1024 * 1024), '2,4 Mo');
});

run('contrôle d’une sélection : nombre, taille unitaire, type, total devis compris', () => {
  const pdf = (name, size) => ({ name, size, type: 'application/pdf' });
  assert.equal(validateAttachmentSelection([pdf('a.pdf', 1000)]), null);
  assert.equal(validateAttachmentSelection([]), null);
  assert.ok(validateAttachmentSelection(Array.from({ length: 6 }, (_, i) => pdf(`${i}.pdf`, 10))).includes('Au plus 5'));
  assert.ok(validateAttachmentSelection([pdf('gros.pdf', ATTACHMENT_LIMITS.maxFileBytes + 1)]).includes('gros.pdf'));
  assert.ok(validateAttachmentSelection([{ name: 'x.zip', size: 10, type: 'application/zip' }]).includes('PDF, JPG et PNG'));
  assert.ok(
    validateAttachmentSelection([pdf('a.pdf', 7 * 1024 * 1024), pdf('b.pdf', 7 * 1024 * 1024)], {
      extraBytes: 2 * 1024 * 1024,
    }).includes('au total')
  );
});

console.log('Tous les tests des pièces jointes ont reussi.');
