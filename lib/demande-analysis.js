import 'server-only';

import Anthropic from '@anthropic-ai/sdk';

import { ANALYSIS_JSON_SCHEMA, normalizeAnalysis } from '@/lib/demandes.mjs';

/**
 * Analyse d'une demande de devis par Claude (bouton « Analyser » de la page
 * /demande). Une seule requête, sortie structurée validée par le schéma de
 * lib/demandes.mjs : pas de boucle d'agent, pas d'envoi automatique au client.
 *
 * Configuration (variables d'environnement Vercel) :
 *  - ANTHROPIC_API_KEY          obligatoire ;
 *  - DEMANDES_ANALYSIS_MODEL    facultatif, défaut claude-opus-5-5.
 *
 * Repli serveur (`fallbacks: "default"`) activé : si un filtre de sécurité
 * décline la requête, l'API la rejoue sur un autre modèle dans le même appel.
 * Si l'API refuse ce paramètre (plateforme ou version), on rejoue sans lui.
 */

export const DEFAULT_ANALYSIS_MODEL = 'claude-opus-5-5';

const createHttpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

export const isAnalysisConfigured = () => Boolean((process.env.ANTHROPIC_API_KEY || '').trim());

const SYSTEM_PROMPT = `Tu es l'assistant du bureau d'études de SARANGE, menuiserie PVC, aluminium et bois (fenêtres, portes-fenêtres, baies coulissantes, châssis fixes, portes d'entrée et de service, portes de garage, volets roulants et battants, portails, vérandas, fenêtres de toit), fourniture seule ou fourniture et pose RGE, basée à Combs-la-Ville (77) et intervenant en Île-de-France.

On te donne un fil d'e-mails reçu sur contact@sarange.fr, parfois avec des pièces jointes (plans, photos, relevés de cotes, devis concurrent, CCTP). Ta mission : dire si c'est une demande de devis et la normaliser pour que le bureau chiffre vite et sans ressaisie.

Règles :
- N'invente rien. Une information absente vaut chaîne vide, 0 ou « inconnu ». Ne déduis pas un téléphone ou une adresse qui ne figurent nulle part.
- Une ligne par produit distinct ; fusionne les produits strictement identiques en ajustant la quantité. Garde l'ordre du demandeur.
- Dimensions en millimètres (convertis les centimètres). Convention française : largeur avant hauteur. Si le texte ne permet pas de savoir laquelle est la largeur, garde l'ordre écrit et signale le doute dans le commentaire de la ligne.
- Si le demandeur ne précise pas si les cotes sont des cotes tableau (ouverture) ou de fabrication, ajoute-le dans infosManquantes.
- Lis vraiment les pièces jointes fournies : relève les cotes, modèles, références et prix qu'elles contiennent et reporte-les dans les lignes et dans piecesJointes.contenuUtile.
- Type de demandeur : « professionnel » pour une entreprise du bâtiment ou un revendeur, « architecte » pour un cabinet ou une maîtrise d'œuvre, « syndic », « bailleur » pour une agence ou un gestionnaire, « collectivité » pour une mairie, église ou association, sinon « particulier ». « inconnu » seulement si rien ne permet de trancher.
- Un remplacement de menuiseries existantes implique la dépose, sauf mention contraire.
- Les exigences thermiques (Uw, Sw) et acoustiques se reportent dans exigences, sans calcul de TVA ni d'aide : le bureau s'en charge.
- infosManquantes ne liste que ce qui empêche réellement de chiffrer. questionsAPoser : une question courte par manque.
- messageRelance : uniquement s'il manque quelque chose. Français, vouvoiement, ton cordial et direct, cinq à dix lignes, commence par « Bonjour », remercie pour la demande, pose les questions sous forme de liste, termine par « Bien cordialement, L'équipe SARANGE ». N'utilise jamais de tiret cadratin ni de tiret demi-cadratin. Pas de prix ni d'engagement de délai.
- priorite « haute » : chantier professionnel ou multi-produits, échéance annoncée, concurrent déjà consulté, demandeur qui relance. « basse » : demande vague sans cotes ni coordonnées exploitables. Sinon « normale ».
- resume : une phrase factuelle, par exemple « SMCI (pro) : 5 menuiseries PVC blanc et 6 volets roulants alu, fourniture et pose avec dépose, Champigny-sur-Marne ».
- Si le fil n'est pas une demande de devis (fournisseur, candidature, facture, démarchage), mets estDemandeDevis à false, explique-le dans resume et laisse le reste vide.`;

const formatMessageHeader = (message, index) => {
  const who = message.fromName ? `${message.fromName} <${message.from}>` : message.from;
  const when = message.date ? new Date(message.date).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : 'date inconnue';
  return `--- Message ${index + 1} · ${when} · de ${who} ---`;
};

const buildUserContent = (demande, attachments) => {
  const header = [
    `Objet : ${demande.subject || '(sans objet)'}`,
    `Expéditeur : ${demande.from.name ? `${demande.from.name} <${demande.from.email}>` : demande.from.email}`,
    `Reçu le : ${demande.receivedAt || 'inconnu'}`,
    demande.inSpam ? 'Ce fil avait été classé en courrier indésirable par Gmail.' : '',
    demande.hints?.matched?.length ? `Indices du tri automatique : ${demande.hints.matched.join(' ; ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const thread = demande.messages
    .map((message, index) => {
      const attachmentsList = message.attachments.length
        ? `\n[Pièces jointes : ${message.attachments.map((entry) => `${entry.name} (${entry.contentType}, ${entry.size} octets)`).join(' ; ')}]`
        : '';
      return `${formatMessageHeader(message, index)}\n${message.body || '(message vide)'}${attachmentsList}`;
    })
    .join('\n\n');

  const content = [
    { type: 'text', text: `${header}\n\n${thread}` },
  ];

  for (const attachment of attachments) {
    const data = attachment.buffer.toString('base64');
    if (attachment.contentType === 'application/pdf') {
      content.push({ type: 'text', text: `Pièce jointe lue ci-dessous : ${attachment.name}` });
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data },
        title: attachment.name,
      });
    } else if (/^image\/(jpeg|png|webp|gif)$/.test(attachment.contentType)) {
      content.push({ type: 'text', text: `Pièce jointe lue ci-dessous : ${attachment.name}` });
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: attachment.contentType, data },
      });
    }
  }

  content.push({
    type: 'text',
    text: 'Analyse ce fil et renseigne le schéma demandé. Les pièces jointes non fournies ci-dessus ne sont connues que par leur nom.',
  });
  return content;
};

const mapApiError = (error) => {
  if (error instanceof Anthropic.AuthenticationError) {
    return createHttpError('Clé API Anthropic refusée : vérifiez ANTHROPIC_API_KEY.', 503);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return createHttpError('Trop de demandes d’analyse pour le moment : réessayez dans une minute.', 429);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return createHttpError('Service d’analyse injoignable : réessayez.', 503);
  }
  if (error instanceof Anthropic.APIError) {
    return createHttpError(`Analyse impossible (${error.status}) : ${error.message}`, 502);
  }
  return error;
};

/**
 * @param {object} input
 * @param {object} input.demande      demande normalisée (lib/demandes.mjs)
 * @param {Array<{name:string, contentType:string, buffer:Buffer}>} input.attachments
 * @returns {Promise<{analysis: object, meta: {model: string, inputTokens: number, outputTokens: number}}>}
 */
export const analyzeDemande = async ({ demande, attachments = [] }) => {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    throw createHttpError('Analyse non configurée : renseignez ANTHROPIC_API_KEY sur Vercel.', 503);
  }
  const model = (process.env.DEMANDES_ANALYSIS_MODEL || '').trim() || DEFAULT_ANALYSIS_MODEL;
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 55_000 });

  const baseParams = {
    model,
    max_tokens: 8000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: ANALYSIS_JSON_SCHEMA },
    },
    messages: [{ role: 'user', content: buildUserContent(demande, attachments) }],
  };

  let response;
  try {
    try {
      response = await client.beta.messages.create({
        ...baseParams,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    } catch (error) {
      // Paramètre de repli refusé (plateforme, version) : même requête sans lui.
      if (!(error instanceof Anthropic.BadRequestError)) throw error;
      console.warn('Repli serveur refusé par l’API, nouvel essai sans :', error.message);
      response = await client.messages.create(baseParams);
    }
  } catch (error) {
    throw mapApiError(error);
  }

  if (response.stop_reason === 'refusal') {
    throw createHttpError(
      `L’analyse a été déclinée par le service (${response.stop_details?.category || 'raison inconnue'}).`,
      422
    );
  }
  if (response.stop_reason === 'max_tokens') {
    throw createHttpError('Analyse tronquée : fil trop long pour une seule passe.', 422);
  }

  const text = (response.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw createHttpError('Réponse d’analyse illisible : réessayez.', 502);
  }

  const usage = response.usage || {};
  return {
    analysis: normalizeAnalysis(parsed),
    meta: {
      model: response.model || model,
      inputTokens:
        (usage.input_tokens || 0) +
        (usage.cache_read_input_tokens || 0) +
        (usage.cache_creation_input_tokens || 0),
      outputTokens: usage.output_tokens || 0,
    },
  };
};
