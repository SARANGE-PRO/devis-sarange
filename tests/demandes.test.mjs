import assert from 'node:assert/strict';
import {
  ANALYSIS_JSON_SCHEMA,
  DEMANDE_STATUSES,
  LINE_CATEGORIES,
  MAX_ATTACHMENT_BYTES,
  MAX_MESSAGE_BODY_LENGTH,
  MIN_SCORE_FOR_LABEL,
  MIN_SCORE_TO_STORE,
  buildClientDataFromDemande,
  buildDemandeSummary,
  confidenceFromScore,
  describeIntake,
  extractDimensions,
  extractPhones,
  extractPostalCity,
  isPublicMailboxDomain,
  isSenderBlocked,
  normalizeAnalysis,
  normalizeBlocklist,
  normalizeDemande,
  normalizeDemandeStatus,
  sanitizeIntakePayload,
  scoreDemande,
  stripQuotedReply,
  toDemandeListItem,
  toGeminiResponseSchema,
} from '../lib/demandes.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

// Trois demandes réelles (anonymisées) reçues en septembre/octobre 2026.
const SMCI = {
  subject: 'Demande de chiffrage PRO – Menuiseries PVC + 6 volets roulants – Champigny-sur-Marne',
  fromEmail: 'contact@entreprise-exemple.fr',
  body: `Bonjour,

Nous sommes la société SMCI, entreprise de bâtiment basée à Corbeil-Essonnes, et souhaitons obtenir votre meilleur tarif professionnel pour un chantier situé au 17 rue Ferdinand Buisson, 94500 Champigny-sur-Marne.

Merci de nous chiffrer en fourniture + pose, dépose totale de l'existant :
- 1 fenêtre PVC blanc 2 vantaux : 1200 x 1200 mm, double vitrage dépoli.
- 3 portes-fenêtres PVC blanc 2 vantaux : 1400 x 2300 mm.
- 1 porte d'entrée PVC blanc : 940 x 2250 mm, serrure 5 points, seuil aluminium PMR.
- 6 volets roulants aluminium électriques : 2000 x 2270 mm.

Cordialement,
SMCI
1 Boulevard John Kennedy
91100 Corbeil-Essonnes`,
};

const PATANE = {
  subject: 'Demande de devis – 6 fenêtres PVC– Uw ≤ 1,30 / Sw ≤ 0,42 : merci par avance',
  fromEmail: 'cliente@exemple.fr',
  body: `Bonjour,

Je souhaite obtenir un devis pour la fourniture de 6 fenêtres PVC avec les caractéristiques suivantes :
   - 2 fenêtres : largeur 1100 mm × hauteur 1300 mm
   - 4 fenêtres : largeur 1100 mm × hauteur 1000 mm
   - 2 vantaux par fenêtre, 1 vantail oscillo-battant
   - Double vitrage feuilleté, Uw ≤ 1,30 W/m²K maximum

Cordialement,
Valérie P.`,
};

const PORTE_ALU = {
  subject: 'Demande de Devis',
  fromEmail: 'contact@menuiserie-exemple.com',
  body: `Bonjour pouvez-vous s'il vous plaît m'effectuer un chiffrage pour une porte alu

Quantité : 1
920 X 2160
ral 7016

Merci`,
};

run('statuts : les 5 attendus, défaut « nouvelle »', () => {
  assert.deepEqual(
    DEMANDE_STATUSES.map((status) => status.value),
    ['nouvelle', 'a-chiffrer', 'devis-envoye', 'sans-suite', 'exclue']
  );
  assert.equal(normalizeDemandeStatus('A-CHIFFRER'), 'a-chiffrer');
  assert.equal(normalizeDemandeStatus('inconnu'), 'nouvelle');
});

run('expéditeurs exclus : adresse, domaine, domaine parent ; messageries publiques', () => {
  const blocklist = normalizeBlocklist({
    emails: [' Stan@Exemple.com ', 'stan@exemple.com', 'pas-une-adresse'],
    domains: ['@Schueco.com', 'schueco.com', 'sansPoint'],
  });
  assert.deepEqual(blocklist, { emails: ['stan@exemple.com'], domains: ['schueco.com'] });
  assert.equal(isSenderBlocked('STAN@exemple.com', blocklist), true);
  assert.equal(isSenderBlocked('autre@exemple.com', blocklist), false);
  assert.equal(isSenderBlocked('c.lancelin@schueco.com', blocklist), true);
  assert.equal(isSenderBlocked('x@mail.schueco.com', blocklist), true, 'sous-domaine');
  assert.equal(isSenderBlocked('x@notschueco.com', blocklist), false);
  assert.equal(isSenderBlocked('', blocklist), false);
  assert.equal(isPublicMailboxDomain('Gmail.com'), true);
  assert.equal(isPublicMailboxDomain('idfmenuiserie.com'), false);
});

run('confiance : seuils cohérents avec le stockage et le libellé', () => {
  assert.equal(confidenceFromScore(MIN_SCORE_FOR_LABEL), 'haute');
  assert.equal(confidenceFromScore(MIN_SCORE_FOR_LABEL - 1), 'moyenne');
  assert.equal(confidenceFromScore(MIN_SCORE_TO_STORE), 'basse');
  assert.equal(confidenceFromScore('n/a'), 'basse');
});

run('extraction : cotes dans les formes courantes', () => {
  assert.deepEqual(extractDimensions('920 X 2160 et 1200x1200 mm, 1100 mm × hauteur 1300 mm'), [
    '920 x 2160',
    '1200 x 1200',
    '1100 x 1300',
  ]);
  assert.deepEqual(extractDimensions('aucune cote ici, 3 x plus vite'), []);
});

run('extraction : téléphones et lieu', () => {
  assert.deepEqual(extractPhones('appelez le 06 62 68 90 84 ou +33 7 80 07 19 64'), [
    '0662689084',
    '+33780071964',
  ]);
  assert.deepEqual(extractPostalCity('chantier au 17 rue Buisson, 94500 Champigny-sur-Marne merci'), {
    postalCode: '94500',
    city: 'Champigny-sur-Marne',
  });
  assert.deepEqual(extractPostalCity('fenêtre 92000 x 1200'), { postalCode: '', city: '' });
});

run('citations : la réponse précédente est retirée', () => {
  const text = `Je vous confirme que c'est une porte d'entrée.
Merci

Le mer. 7 oct. 2026 à 09:06, SARANGE PRO <contact@sarange.fr> a écrit :

> Bonjour;
> porte d'entrée ou porte de service ?`;
  assert.equal(stripQuotedReply(text), "Je vous confirme que c'est une porte d'entrée.\nMerci");
  assert.equal(stripQuotedReply('> tout cité\n> rien à garder'), '');
});

run('score : trois vraies demandes sont en confiance haute (libellé Gmail)', () => {
  for (const sample of [SMCI, PATANE, PORTE_ALU]) {
    const result = scoreDemande(sample);
    assert.equal(result.confidence, 'haute', `${sample.subject} → ${result.score} ${result.matched.join(' / ')}`);
    assert.equal(result.shouldLabel, true);
  }
  const smci = scoreDemande(SMCI);
  assert.ok(smci.dimensions.includes('1200 x 1200'));
  assert.ok(smci.products.includes('volet roulant'));
  assert.equal(smci.postalCode, '94500');
});

run('score : bruit connu non stocké (banque, démarchage, automate)', () => {
  const banque = scoreDemande({
    subject: 'BRED - Confirmation de votre virement instantané - 631.87 EUR',
    fromEmail: 'confirmation-BRED@bred.fr',
    body: 'Chère Cliente, Cher Client, nous vous informons que le virement a été exécuté.',
  });
  assert.equal(banque.shouldStore, false, `banque → ${banque.score}`);

  const demarchage = scoreDemande({
    subject: 'Proposition de partenariat – Pose et installation',
    fromEmail: 'commercial@exemple.com',
    body: "Bonjour, je me permets de vous contacter afin de vous proposer les services de notre société pour vos chantiers de pose de menuiseries.",
  });
  assert.equal(demarchage.shouldStore, false, `démarchage → ${demarchage.score}`);

  const avis = scoreDemande({
    subject: 'FREDERIC a laissé un avis sur SARANGE',
    fromEmail: 'businessprofile-noreply@google.com',
    body: 'Accédez aux avis et répondez à vos clients dès maintenant.',
  });
  assert.equal(avis.shouldStore, false, `avis → ${avis.score}`);
});

run('score : vendeur qui parle de fenêtres reste au plus « à vérifier »', () => {
  const vendeur = scoreDemande({
    subject: 'Fourniture de fenêtres PVC / aluminium tarifs professionnels',
    fromEmail: 'stan@exemple.com',
    body: 'Bonjour, je travaille avec un important fabricant de fenêtres et nous vous proposons des tarifs professionnels sur la fourniture.',
  });
  assert.equal(vendeur.shouldLabel, false, `vendeur → ${vendeur.score}`);
});

run('intake : validation, troncature et budget des pièces jointes', () => {
  assert.throws(() => sanitizeIntakePayload({}), /threadId/);
  assert.throws(() => sanitizeIntakePayload({ threadId: 'abc', messages: [] }), /exploitable/);

  const bigBase64 = 'A'.repeat(Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 400);
  const payload = sanitizeIntakePayload({
    threadId: '  1a11171737cba17c ',
    permalink: 'javascript:alert(1)',
    subject: PORTE_ALU.subject,
    inSpam: 'true',
    messages: [
      {
        id: 'm1',
        date: '2026-10-06T13:40:11Z',
        from: 'Contact@Menuiserie-Exemple.com',
        fromName: 'Yasser O.',
        body: `${PORTE_ALU.body}\n\n${'x'.repeat(MAX_MESSAGE_BODY_LENGTH + 500)}`,
        attachments: [
          { name: 'plan.pdf', contentType: 'application/pdf', size: 1200, dataBase64: 'JVBERi0=' },
          { name: 'trop-gros.pdf', contentType: 'application/pdf', size: 9_000_000, dataBase64: bigBase64 },
          { name: 'archive.zip', contentType: 'application/zip', size: 10, dataBase64: 'UEsDBA==' },
        ],
      },
    ],
  });
  assert.equal(payload.threadId, '1a11171737cba17c');
  assert.equal(payload.permalink, 'https://mail.google.com/mail/u/0/#all/1a11171737cba17c');
  assert.equal(payload.inSpam, true);
  assert.equal(payload.messages[0].from, 'contact@menuiserie-exemple.com');
  assert.equal(payload.messages[0].body.length, MAX_MESSAGE_BODY_LENGTH);
  const [plan, tropGros, archive] = payload.messages[0].attachments;
  assert.equal(plan.dataBase64, 'JVBERi0=');
  assert.equal(tropGros.dataBase64, '', 'au-dessus du plafond : métadonnées seules');
  assert.equal(archive.dataBase64, '', 'type non lisible : métadonnées seules');
  assert.equal(archive.analyzable, false);

  const described = describeIntake(payload);
  assert.equal(described.from.domain, 'menuiserie-exemple.com');
  assert.equal(described.attachmentCount, 3);
  assert.equal(described.hints.confidence, 'haute');
  assert.equal(described.shouldLabel, true);
  assert.equal(described.receivedAt, '2026-10-06T13:40:11.000Z');
});

run('schéma d’analyse : objets fermés et toutes propriétés requises (exigence API)', () => {
  const visit = (schema, path) => {
    if (schema.type === 'object') {
      assert.equal(schema.additionalProperties, false, `${path}: additionalProperties`);
      assert.deepEqual(schema.required, Object.keys(schema.properties), `${path}: required`);
      for (const [key, child] of Object.entries(schema.properties)) visit(child, `${path}.${key}`);
    } else if (schema.type === 'array') {
      visit(schema.items, `${path}[]`);
    } else {
      assert.ok(['string', 'integer', 'number', 'boolean'].includes(schema.type), `${path}: type`);
    }
    assert.equal('minimum' in schema || 'maxLength' in schema, false, `${path}: contrainte non supportée`);
  };
  visit(ANALYSIS_JSON_SCHEMA, 'analysis');
});

run('schéma d’analyse : variante Gemini sans additionalProperties, ordre des propriétés conservé', () => {
  const gemini = toGeminiResponseSchema(ANALYSIS_JSON_SCHEMA);
  const visit = (schema, path) => {
    assert.equal('additionalProperties' in schema, false, `${path}: additionalProperties restant`);
    if (schema.type === 'object') {
      assert.deepEqual(schema.propertyOrdering, Object.keys(schema.properties), `${path}: ordre`);
      assert.deepEqual(schema.required, Object.keys(schema.properties), `${path}: required`);
      for (const [key, child] of Object.entries(schema.properties)) visit(child, `${path}.${key}`);
    } else if (schema.type === 'array') {
      visit(schema.items, `${path}[]`);
    }
  };
  visit(gemini, 'gemini');
  assert.deepEqual(gemini.properties.lignes.items.properties.categorie.enum, [...LINE_CATEGORIES]);
  // Le schéma d'origine n'est pas modifié.
  assert.equal(ANALYSIS_JSON_SCHEMA.additionalProperties, false);
});

run('analyse : normalisation tolérante et fiche client dérivée', () => {
  const analysis = normalizeAnalysis({
    estDemandeDevis: true,
    confiance: 140,
    resume: 'Remplacement de 6 fenêtres PVC blanc, fourniture seule.',
    demandeur: { type: 'particulier', nom: 'Patanè', prenom: 'Valérie', email: 'Cliente@Exemple.fr' },
    chantier: { ville: 'Brunoy', codePostal: '91800' },
    prestation: 'fourniture-seule',
    lignes: [{ quantite: '2', categorie: 'fenetre', materiau: 'pvc', largeurMm: '1100', hauteurMm: 1300, options: ['OB', 'OB', ''] }, { categorie: 'inconnue' }],
    exigences: { uwMax: '1,30', swMax: 0.42 },
    priorite: 'urgente',
  });
  assert.equal(analysis.confiance, 100);
  assert.equal(analysis.lignes.length, 2);
  assert.deepEqual(analysis.lignes[0].options, ['OB']);
  assert.equal(analysis.lignes[0].quantite, 2);
  assert.equal(analysis.lignes[1].categorie, 'autre');
  assert.equal(analysis.lignes[1].quantite, 1);
  assert.equal(analysis.exigences.uwMax, 1.3);
  assert.equal(analysis.priorite, 'normale');
  assert.equal(analysis.demandeur.email, 'cliente@exemple.fr');

  const client = buildClientDataFromDemande({
    from: { name: 'Valérie Patanè', email: 'cliente@exemple.fr' },
    hints: { phones: ['0612345678'], postalCode: '77380', city: 'Combs-la-Ville' },
    analysis,
  });
  assert.equal(client.clientType, 'particulier');
  assert.equal(client.nom, 'Patanè');
  assert.equal(client.prenom, 'Valérie');
  assert.equal(client.telephone, '0612345678', 'téléphone absent de l’analyse : indice du scan');
  assert.equal(client.ville, 'Brunoy', 'le chantier de l’analyse prime sur l’indice');

  const sansAnalyse = buildClientDataFromDemande({
    from: { name: 'Yasser Ouradi', email: 'contact@menuiserie-exemple.com' },
    hints: { phones: [], postalCode: '', city: '' },
    analysis: null,
  });
  assert.deepEqual([sansAnalyse.prenom, sansAnalyse.nom, sansAnalyse.email], ['Yasser', 'Ouradi', 'contact@menuiserie-exemple.com']);

  const pro = buildClientDataFromDemande({
    from: { name: 'SMCI', email: 'contact@entreprise-exemple.fr' },
    analysis: normalizeAnalysis({ demandeur: { type: 'professionnel', societe: 'SMCI', nom: 'Dupont' } }),
  });
  assert.equal(pro.clientType, 'professionnel');
  assert.equal(pro.nom, 'SMCI');
  assert.equal(pro.prenom, '');
});

run('liste : résumé et nom d’affichage sans analyse, puis avec', () => {
  const demande = normalizeDemande({
    id: 't1',
    subject: 'Demande de Devis',
    from: { name: 'Yasser Ouradi', email: 'contact@menuiserie-exemple.com' },
    hints: { score: 10, products: ['porte', 'menuiserie'], dimensions: ['920 x 2160'] },
    attachmentCount: 2,
    messages: [{ body: 'corps', attachments: [{ name: 'a.pdf', path: '', analyzable: true }] }],
  });
  assert.equal(demande.hints.confidence, 'haute');
  assert.equal(demande.messages[0].attachments[0].analyzable, false, 'sans chemin Storage : non analysable');
  assert.equal(buildDemandeSummary(demande), 'porte, menuiserie · 1 cote · 2 pièces jointes');
  const item = toDemandeListItem(demande);
  assert.equal(item.displayName, 'Yasser Ouradi');
  assert.deepEqual(item.messages, []);
  assert.equal(item.analyzed, false);

  const analysed = toDemandeListItem({
    ...demande,
    analysis: { resume: 'Une porte alu RAL 7016.', demandeur: { type: 'professionnel', societe: 'IDF Menuiserie' }, chantier: { ville: 'Melun' } },
  });
  assert.equal(analysed.summary, 'Une porte alu RAL 7016.');
  assert.equal(analysed.displayName, 'IDF Menuiserie');
  assert.equal(analysed.city, 'Melun');
});

console.log('Tests demandes : OK');
