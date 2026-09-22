import assert from 'node:assert/strict';
import { htmlToPlainText } from '../lib/email-plain-text.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('structure conservée : titres, paragraphes, listes, tableaux', () => {
  const html = `<!DOCTYPE html><html><head><title>x</title><style>p{color:red}</style></head><body>
    <h2>Bonjour <strong>Jean Dupont</strong>,</h2>
    <p>Veuillez trouver ci-joint votre devis <strong>n°262341234</strong>.</p>
    <ul><li>Fabrication sur-mesure</li><li>Tarifs en direct</li></ul>
    <table><tr><td>Total</td><td>2 810,58 €</td></tr></table>
    <p>À bientôt,<br>L'équipe SARANGE</p>
  </body></html>`;

  const text = htmlToPlainText(html);
  assert.equal(
    text,
    [
      'Bonjour Jean Dupont,',
      '',
      'Veuillez trouver ci-joint votre devis n°262341234.',
      '',
      '• Fabrication sur-mesure',
      '• Tarifs en direct',
      '',
      'Total 2 810,58 €',
      '',
      'À bientôt,',
      "L'équipe SARANGE",
    ].join('\n')
  );
});

run('pré-en-tête masqué, commentaires et scripts retirés', () => {
  const html = `<!-- gabarit --><div style="display: none; max-height: 0px; overflow: hidden;">Aperçu caché&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <script>alert(1)</script><p>Visible</p>`;
  assert.equal(htmlToPlainText(html), 'Visible');
});

run('entités HTML décodées (nommées et numériques)', () => {
  assert.equal(
    htmlToPlainText('<p>R&eacute;sum&eacute; &amp; suite &laquo;&nbsp;ok&nbsp;&raquo; &#8364; &#x27;a&#x27;</p>'),
    "Résumé & suite « ok » € 'a'"
  );
  // Entité inconnue : conservée telle quelle plutôt que perdue.
  assert.equal(htmlToPlainText('<p>&inconnue;</p>'), '&inconnue;');
});

run('liens : le texte du bouton reste, jamais de balise résiduelle', () => {
  const text = htmlToPlainText(
    '<a href="https://devis.sarange.fr/signature/abc" style="x">🖋️ Consulter ou signer mon devis</a>'
  );
  assert.equal(text, '🖋️ Consulter ou signer mon devis');
  assert.ok(!text.includes('<'));
});

run('entrées vides ou non textuelles', () => {
  assert.equal(htmlToPlainText(''), '');
  assert.equal(htmlToPlainText(null), '');
  assert.equal(htmlToPlainText(undefined), '');
});

console.log('Tous les tests de conversion des e-mails en texte ont reussi.');
