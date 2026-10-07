import 'server-only';

import Anthropic from '@anthropic-ai/sdk';

import { ANALYSIS_JSON_SCHEMA, normalizeAnalysis, toGeminiResponseSchema } from '@/lib/demandes.mjs';

/**
 * Analyse d'une demande de devis par un modèle de langage (bouton « Analyser
 * avec l'IA » de la page /demande). Une seule requête, sortie structurée
 * validée par le schéma de lib/demandes.mjs : pas de boucle d'agent, pas
 * d'envoi automatique au client.
 *
 * Deux fournisseurs, choisis d'après les variables d'environnement Vercel :
 *  - Gemini (Google AI Studio), palier GRATUIT, prioritaire : GEMINI_API_KEY,
 *    GEMINI_MODEL facultatif (sinon le modèle Flash stable le plus récent
 *    est découvert via l'API). Pour un compte situé dans l'Espace économique
 *    européen, Google applique les conditions du palier payant : les données
 *    ne servent pas à entraîner ses modèles.
 *  - Claude (API Anthropic), payant à l'usage : ANTHROPIC_API_KEY,
 *    DEMANDES_ANALYSIS_MODEL facultatif (défaut claude-opus-5-5). Repli
 *    serveur `fallbacks: "default"` activé.
 *  - DEMANDES_ANALYSIS_PROVIDER = gemini | anthropic force le choix quand les
 *    deux clés existent.
 */

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 55_000;

const createHttpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const readEnv = (name) => (process.env[name] || '').trim();

const PROVIDER_LABELS = {
  gemini: 'Gemini (palier gratuit Google)',
  anthropic: 'Claude (API Anthropic)',
};

/** Fournisseur actif : { provider: 'gemini' | 'anthropic' | '', label }. */
export const getAnalysisProvider = () => {
  const forced = readEnv('DEMANDES_ANALYSIS_PROVIDER').toLowerCase();
  const hasGemini = Boolean(readEnv('GEMINI_API_KEY'));
  const hasAnthropic = Boolean(readEnv('ANTHROPIC_API_KEY'));
  let provider = '';
  if (forced === 'anthropic' && hasAnthropic) provider = 'anthropic';
  else if (forced === 'gemini' && hasGemini) provider = 'gemini';
  else if (hasGemini) provider = 'gemini';
  else if (hasAnthropic) provider = 'anthropic';
  return { provider, label: PROVIDER_LABELS[provider] || '' };
};

export const isAnalysisConfigured = () => Boolean(getAnalysisProvider().provider);

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
- Si le fil n'est pas une demande de devis (fournisseur, candidature, facture, démarchage), mets estDemandeDevis à false, explique-le dans resume et laisse le reste vide.
- Réponds uniquement avec le JSON demandé, sans commentaire autour.`;

const CLOSING_INSTRUCTION =
  'Analyse ce fil et renseigne le schéma demandé. Les pièces jointes non fournies ci-dessus ne sont connues que par leur nom.';

const formatMessageHeader = (message, index) => {
  const who = message.fromName ? `${message.fromName} <${message.from}>` : message.from;
  const when = message.date
    ? new Date(message.date).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
    : 'date inconnue';
  return `--- Message ${index + 1} · ${when} · de ${who} ---`;
};

/** Texte commun aux deux fournisseurs : en-tête, indices du tri, fil complet. */
const buildPromptText = (demande) => {
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
        ? `\n[Pièces jointes : ${message.attachments
            .map((entry) => `${entry.name} (${entry.contentType}, ${entry.size} octets)`)
            .join(' ; ')}]`
        : '';
      return `${formatMessageHeader(message, index)}\n${message.body || '(message vide)'}${attachmentsList}`;
    })
    .join('\n\n');

  return `${header}\n\n${thread}`;
};

const isReadableAttachment = (attachment) =>
  /^(application\/pdf|image\/(jpeg|png|webp|gif))$/.test(attachment.contentType);

const parseJsonOutput = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    // Certains modèles entourent le JSON d'une clôture ``` malgré la consigne.
    const match = String(text || '').match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // tombe dans l'erreur ci-dessous
      }
    }
    throw createHttpError('Réponse d’analyse illisible : réessayez.', 502);
  }
};

// ---------------------------------------------------------------------------
// Gemini (Google AI Studio), palier gratuit
// ---------------------------------------------------------------------------

const GEMINI_PROBE_TIMEOUT_MS = 6_000;
const GEMINI_MODEL_CACHE_TTL_MS = 60 * 60 * 1000;
let geminiModelCache = { apiKey: '', models: [], expiresAt: 0 };

const geminiVersionOf = (name) => Number.parseFloat(String(name).split('-')[1]) || 0;

const fetchWithTimeout = async (url, init, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

/** Un modèle est « réactif » s'il répond 200 à un prompt minuscule sous 6 s. */
const probeGeminiModel = async (apiKey, model) => {
  try {
    const response = await fetchWithTimeout(
      `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Réponds uniquement par le mot OK.' }] }],
          generationConfig: { maxOutputTokens: 64 },
        }),
      },
      GEMINI_PROBE_TIMEOUT_MS
    );
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Modèles Gemini utilisables, du plus capable au plus modeste : GEMINI_MODEL
 * seul si défini ; sinon, parmi les Flash stables listés par l'API (les
 * identifiants changent souvent), ceux qui RÉPONDENT vraiment. Le palier
 * gratuit sature ou met en file d'attente certains modèles récents pendant
 * des minutes : la version la plus haute n'est pas forcément la bonne, d'où
 * ce sondage en parallèle, mémorisé une heure par instance.
 */
const resolveGeminiModels = async (apiKey) => {
  const forced = readEnv('GEMINI_MODEL');
  if (forced) return [forced];
  if (geminiModelCache.models.length && geminiModelCache.apiKey === apiKey && geminiModelCache.expiresAt > Date.now()) {
    return geminiModelCache.models;
  }

  let flash = [];
  let lite = [];
  try {
    const response = await fetchWithTimeout(
      `${GEMINI_API_BASE}/models?pageSize=200&key=${encodeURIComponent(apiKey)}`,
      {},
      GEMINI_PROBE_TIMEOUT_MS
    );
    if (response.ok) {
      const payload = await response.json();
      const names = (payload.models || [])
        .filter((entry) => (entry.supportedGenerationMethods || []).includes('generateContent'))
        .map((entry) => String(entry.name || '').replace(/^models\//, ''));
      const byVersionDesc = (a, b) => geminiVersionOf(b) - geminiVersionOf(a);
      flash = names.filter((name) => /^gemini-\d+(\.\d+)?-flash$/.test(name)).sort(byVersionDesc).slice(0, 4);
      lite = names.filter((name) => /^gemini-\d+(\.\d+)?-flash-lite$/.test(name)).sort(byVersionDesc).slice(0, 2);
    }
  } catch (error) {
    console.warn('Liste des modèles Gemini indisponible :', error?.message || error);
  }

  const candidates = [...flash, ...lite];
  const healthy = [];
  if (candidates.length) {
    const results = await Promise.all(candidates.map((model) => probeGeminiModel(apiKey, model)));
    candidates.forEach((model, index) => {
      if (results[index]) healthy.push(model);
    });
  }
  const models = healthy.length ? healthy : [GEMINI_FALLBACK_MODEL];
  geminiModelCache = { apiKey, models, expiresAt: Date.now() + GEMINI_MODEL_CACHE_TTL_MS };
  console.info('Modèles Gemini réactifs :', models.join(', '));
  return models;
};

// Budget total d'une analyse Gemini (la route Vercel est limitée à 60 s, le
// sondage des modèles en prend jusqu'à 6) et durée minimale pour tenter un
// modèle de plus.
const GEMINI_TOTAL_BUDGET_MS = 45_000;
const GEMINI_MIN_ATTEMPT_MS = 8_000;

const analyzeWithGemini = async ({ demande, attachments, apiKey }) => {
  const models = await resolveGeminiModels(apiKey);
  const deadline = Date.now() + GEMINI_TOTAL_BUDGET_MS;
  let lastError = null;
  for (let index = 0; index < models.length; index += 1) {
    const remaining = deadline - Date.now();
    if (index > 0 && remaining < GEMINI_MIN_ATTEMPT_MS) break;
    try {
      return await callGemini({
        demande,
        attachments,
        apiKey,
        model: models[index],
        timeoutMs: Math.max(GEMINI_MIN_ATTEMPT_MS, Math.min(remaining, 40_000)),
      });
    } catch (error) {
      lastError = error;
      // Saturation, quota ou délai dépassé : on passe au modèle suivant tant
      // qu'il reste du budget ; toute autre erreur est définitive.
      const retryable = [429, 503].includes(error?.statusCode);
      if (!retryable || index === models.length - 1) throw error;
      console.warn(`Gemini ${models[index]} indisponible (${error.message}), essai avec ${models[index + 1]}.`);
    }
  }
  throw lastError;
};

const callGemini = async ({ demande, attachments, apiKey, model, timeoutMs }) => {
  const parts = [{ text: buildPromptText(demande) }];
  for (const attachment of attachments) {
    if (!isReadableAttachment(attachment)) continue;
    parts.push({ text: `Pièce jointe lue ci-dessous : ${attachment.name}` });
    parts.push({
      inlineData: { mimeType: attachment.contentType, data: attachment.buffer.toString('base64') },
    });
  }
  parts.push({ text: CLOSING_INSTRUCTION });

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: toGeminiResponseSchema(ANALYSIS_JSON_SCHEMA),
      temperature: 0.2,
      maxOutputTokens: 16384,
    },
  };

  let response;
  try {
    response = await fetchWithTimeout(
      `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      timeoutMs || REQUEST_TIMEOUT_MS - 10_000
    );
  } catch (error) {
    throw createHttpError(
      error?.name === 'AbortError'
        ? `Analyse trop longue avec ${model} (délai dépassé) : réessayez.`
        : 'Service Gemini injoignable : réessayez.',
      503
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `HTTP ${response.status}`;
    if (response.status === 429) {
      throw createHttpError(
        'Quota gratuit Gemini atteint pour le moment : réessayez dans une minute, ou demain si le quota du jour est épuisé.',
        429
      );
    }
    if (response.status === 503) {
      throw createHttpError(`Modèle Gemini ${model} saturé : réessayez dans un instant.`, 503);
    }
    if (response.status === 404) {
      throw createHttpError(`Modèle Gemini introuvable (${model}) : définissez GEMINI_MODEL sur Vercel.`, 503);
    }
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw createHttpError(`Clé Gemini refusée ou requête invalide : ${message}`, 503);
    }
    throw createHttpError(`Analyse impossible (Gemini ${response.status}) : ${message}`, 502);
  }

  if (payload.promptFeedback?.blockReason) {
    throw createHttpError(`Analyse bloquée par Gemini (${payload.promptFeedback.blockReason}).`, 422);
  }
  const candidate = payload.candidates?.[0];
  if (!candidate) throw createHttpError('Réponse Gemini vide : réessayez.', 502);
  if (candidate.finishReason === 'MAX_TOKENS') {
    throw createHttpError('Analyse tronquée : fil trop long pour une seule passe.', 422);
  }
  if (candidate.finishReason && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(candidate.finishReason)) {
    throw createHttpError(`Analyse interrompue par Gemini (${candidate.finishReason}).`, 422);
  }

  const text = (candidate.content?.parts || []).map((part) => part.text || '').join('');
  const usage = payload.usageMetadata || {};
  return {
    analysis: normalizeAnalysis(parseJsonOutput(text)),
    meta: {
      provider: 'gemini',
      model,
      inputTokens: usage.promptTokenCount || 0,
      outputTokens: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0),
    },
  };
};

// ---------------------------------------------------------------------------
// Claude (API Anthropic), payant à l'usage
// ---------------------------------------------------------------------------

const buildAnthropicContent = (demande, attachments) => {
  const content = [{ type: 'text', text: buildPromptText(demande) }];
  for (const attachment of attachments) {
    if (!isReadableAttachment(attachment)) continue;
    const data = attachment.buffer.toString('base64');
    content.push({ type: 'text', text: `Pièce jointe lue ci-dessous : ${attachment.name}` });
    if (attachment.contentType === 'application/pdf') {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data },
        title: attachment.name,
      });
    } else {
      content.push({ type: 'image', source: { type: 'base64', media_type: attachment.contentType, data } });
    }
  }
  content.push({ type: 'text', text: CLOSING_INSTRUCTION });
  return content;
};

const mapAnthropicError = (error) => {
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

const analyzeWithAnthropic = async ({ demande, attachments, apiKey }) => {
  const model = readEnv('DEMANDES_ANALYSIS_MODEL') || DEFAULT_ANTHROPIC_MODEL;
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: REQUEST_TIMEOUT_MS });

  const baseParams = {
    model,
    max_tokens: 8000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: ANALYSIS_JSON_SCHEMA },
    },
    messages: [{ role: 'user', content: buildAnthropicContent(demande, attachments) }],
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
    throw mapAnthropicError(error);
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
  const usage = response.usage || {};
  return {
    analysis: normalizeAnalysis(parseJsonOutput(text)),
    meta: {
      provider: 'anthropic',
      model: response.model || model,
      inputTokens:
        (usage.input_tokens || 0) +
        (usage.cache_read_input_tokens || 0) +
        (usage.cache_creation_input_tokens || 0),
      outputTokens: usage.output_tokens || 0,
    },
  };
};

// ---------------------------------------------------------------------------

/**
 * @param {object} input
 * @param {object} input.demande      demande normalisée (lib/demandes.mjs)
 * @param {Array<{name:string, contentType:string, buffer:Buffer}>} input.attachments
 * @returns {Promise<{analysis: object, meta: {provider: string, model: string, inputTokens: number, outputTokens: number}}>}
 */
export const analyzeDemande = async ({ demande, attachments = [] }) => {
  const { provider } = getAnalysisProvider();
  if (!provider) {
    throw createHttpError(
      'Analyse non configurée : renseignez GEMINI_API_KEY (gratuit) ou ANTHROPIC_API_KEY sur Vercel.',
      503
    );
  }
  if (provider === 'gemini') {
    return analyzeWithGemini({ demande, attachments, apiKey: readEnv('GEMINI_API_KEY') });
  }
  return analyzeWithAnthropic({ demande, attachments, apiKey: readEnv('ANTHROPIC_API_KEY') });
};
