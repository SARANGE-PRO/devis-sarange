'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ClientForm from '@/components/ClientForm';
import ProductSelector from '@/components/ProductSelector';
import Cart from '@/components/Cart';
import QuoteSummary from '@/components/QuoteSummary';
import VariantBar from '@/components/VariantBar';
import AppShell from '@/components/AppShell';

import { useFirebaseAuth } from '@/components/FirebaseProvider';
import { hasMeaningfulClientData } from '@/lib/client-cloud';
import { getClientById, saveClientProfile } from '@/lib/firebase/clients';
import {
  calculateItemPrice,
  calculateWasteManagementForItems,
  createCatalogServiceCartItem,
  getItemPricingSummary,
  getProductById,
} from '@/lib/products';
import {
  buildMultiVariantQuotePdfDocument,
  buildQuotePdfDocument,
  generateMultiVariantQuotePDF,
  generateQuotePDF,
} from '@/lib/pdf-generator';
import { generateDesignation } from '@/lib/designation-generator';
import { getDefaultQuoteSettings, normalizeQuoteSettings } from '@/lib/quote-settings.mjs';
import { buildPanelSelections } from '@/lib/panel-selections.mjs';
import { MAX_VARIANTS } from '@/lib/quote-cloud';
import { getQuoteById, saveQuoteDraft } from '@/lib/firebase/quotes';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  FilePlus2,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  RotateCcw,
  ShoppingCart,
  X,
  User,
} from 'lucide-react';

const STEPS = [
  { number: 1, label: 'Client', icon: User },
  { number: 2, label: 'Produits', icon: ShoppingCart },
  { number: 3, label: 'Recapitulatif', icon: FileText },
];

const DEFAULT_TVA_RATE = 10;
const WASTE_MANAGEMENT_PRODUCT_ID = 'gestion-dechets';
const TECHNICAL_MEASUREMENT_PRODUCT_ID = 'metrage-technique-validation';
const DRAFT_STORAGE_KEY = 'sarange:quote-draft:v1';

// Supprime le brouillon local (anti-perte) du localStorage.
const clearLocalDraft = () => {
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // localStorage indisponible (mode privé, quota) — sans gravité.
  }
};

const createCartItemId = (prefix = 'item') =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const createVariantId = () =>
  `var-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;

const variantLetter = (index) => String.fromCharCode(65 + index);

const createWasteManagementCartItem = (cartItems = []) => {
  const product = getProductById(WASTE_MANAGEMENT_PRODUCT_ID);
  const wasteCalculation = calculateWasteManagementForItems(cartItems);

  return {
    id: createCartItemId('dechets'),
    productId: WASTE_MANAGEMENT_PRODUCT_ID,
    productLabel: product?.label || 'Gestion des déchets',
    sheetName: product?.sheet || 'Gestion Déchets',
    totalSurface: wasteCalculation.totalSurface,
    totalWeight: wasteCalculation.totalWeight,
    totalWastePrice: wasteCalculation.totalWastePrice,
    quantity: 1,
    unitPrice: wasteCalculation.totalWastePrice,
    includePose: false,
    remise: 0,
    netMarginWanted: 0,
    netDiscountWanted: 0,
  };
};

const normalizeCartItemsForQuote = (items = []) => {
  const sourceItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const regularItems = sourceItems.filter(
    (item) =>
      item.productId !== TECHNICAL_MEASUREMENT_PRODUCT_ID &&
      item.productId !== WASTE_MANAGEMENT_PRODUCT_ID
  );
  const existingMeasurement = sourceItems.find(
    (item) => item.productId === TECHNICAL_MEASUREMENT_PRODUCT_ID
  );
  const existingWaste = sourceItems.find(
    (item) => item.productId === WASTE_MANAGEMENT_PRODUCT_ID
  );

  const trailingItems = [];

  if (existingMeasurement) {
    const measurementItem = createCatalogServiceCartItem(
      TECHNICAL_MEASUREMENT_PRODUCT_ID,
      {
        id: existingMeasurement.id || createCartItemId('metrage'),
        // Métrage FACTURÉ : on préserve le prix saisi (0 = offert, historique).
        priceHt: Number(existingMeasurement.unitPrice || 0),
      }
    );

    if (measurementItem) {
      trailingItems.push({
        ...measurementItem,
        tvaRate: existingMeasurement.tvaRate,
      });
    }
  }

  if (existingWaste) {
    const wasteItem = createWasteManagementCartItem(regularItems);
    trailingItems.push({
      ...wasteItem,
      id: existingWaste.id || wasteItem.id,
      tvaRate: existingWaste.tvaRate,
    });
  }

  return [...regularItems, ...trailingItems];
};

const arrayBufferToBase64 = (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return window.btoa(binary);
};

const normalizeDesignationText = (value = '') =>
  String(value)
    .split('\n')
    .filter((line) => {
      const trimmedLine = line.trim();
      return !trimmedLine.startsWith('Remise :') && !trimmedLine.startsWith('Avant remise');
    })
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();

const buildGeneratedDesignationSignature = (item) => {
  if (
    !item ||
    item.productId === 'gestion-dechets' ||
    item.productId === 'custom-product' ||
    item.productId === 'text-only'
  ) {
    return '';
  }

  try {
    const comparableItem = { ...item, customDescription: '' };
    const calc = calculateItemPrice(comparableItem);
    const pricing = getItemPricingSummary(comparableItem, calc);
    return normalizeDesignationText(generateDesignation(comparableItem, calc, pricing) || '');
  } catch {
    return '';
  }
};

const shouldKeepManualDesignation = (previousItem, nextItem) => {
  if (!previousItem?.customDescription || nextItem?.customDescriptionManual === true) {
    return false;
  }

  const previousSignature = buildGeneratedDesignationSignature(previousItem);
  const nextSignature = buildGeneratedDesignationSignature(nextItem);

  return Boolean(previousSignature && previousSignature === nextSignature);
};

const QUOTE_SUCCESS_COPY = {
  pdf: {
    eyebrow: 'Devis genere',
    title: 'Votre PDF a bien ete telecharge.',
    describe: (name) =>
      `Le devis ${name ? `de ${name} ` : ''}est pret. Vous pouvez repartir sur un nouveau dossier ou revenir a votre espace devis.`,
  },
  email: {
    eyebrow: 'Devis envoye',
    title: 'Le devis a bien ete envoye par email.',
    describe: (name) =>
      `Le devis ${name ? `de ${name} ` : ''}a ete transmis au client par email. Vous pouvez enchainer sur un nouveau devis.`,
  },
  signature: {
    eyebrow: 'Devis envoye pour signature',
    title: 'Le devis a bien ete envoye pour signature.',
    describe: (name) =>
      `${name || 'Le client'} a recu son lien de signature. Vous pouvez enchainer sur un nouveau devis.`,
  },
};

function QuoteGenerationSuccess({
  clientName,
  mode = 'pdf',
  isCloudAvailable,
  onCreateNewQuote,
  onOpenSavedQuotes,
  onReturnToSummary,
}) {
  const copy = QUOTE_SUCCESS_COPY[mode] || QUOTE_SUCCESS_COPY.pdf;
  return (
    <div className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-emerald-200 bg-white shadow-2xl shadow-emerald-950/10">
      <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.22),_transparent_55%),linear-gradient(135deg,#f0fdf4_0%,#ffffff_60%)] px-6 py-10 sm:px-10">
        <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="relative">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
            <CheckCircle2 size={30} />
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.28em] text-emerald-600">
            {copy.eyebrow}
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            {copy.title}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            {copy.describe(clientName)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 bg-slate-50/70 px-6 py-6 sm:grid-cols-3 sm:px-10">
        <button
          type="button"
          onClick={onCreateNewQuote}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600"
        >
          <RotateCcw size={16} />
          Creer un nouveau devis
        </button>
        <button
          type="button"
          onClick={onReturnToSummary}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <FileText size={16} />
          Revenir au recapitulatif
        </button>
        {isCloudAvailable ? (
          <button
            type="button"
            onClick={onOpenSavedQuotes}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
          >
            <FolderOpen size={16} />
            Ouvrir mes devis
          </button>
        ) : (
          <button
            type="button"
            onClick={onCreateNewQuote}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Retour a l accueil
          </button>
        )}
      </div>
    </div>
  );
}

function PoseSafetyAlert({ missingItems, onAddMissing, onDismiss }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <AlertTriangle size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-amber-950">
            Pose détectée
          </p>
          <p className="mt-1 break-words text-xs leading-5 text-amber-900">
            Il manque : {missingItems.map((item) => item.label).join(' et ')}.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg p-1.5 text-amber-700 transition hover:bg-amber-100"
          aria-label="Ne pas ajouter ces services"
        >
          <X size={15} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAddMissing}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-700"
        >
          <Plus size={14} />
          Ajouter au devis
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center justify-center rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100"
        >
          Ne pas ajouter
        </button>
      </div>
    </div>
  );
}

export default function HomePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, initializing: authInitializing, isConfigured: firebaseConfigured } =
    useFirebaseAuth();

  const [currentStep, setCurrentStep] = useState(1);
  const [clientData, setClientData] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const [tvaRate, setTvaRate] = useState(DEFAULT_TVA_RATE);
  const [quoteSettings, setQuoteSettings] = useState(() => getDefaultQuoteSettings());
  const [quoteReference, setQuoteReference] = useState('');
  const [draftRestored, setDraftRestored] = useState(false);
  // Variantes de configuration. La variante ACTIVE est éditée via le tampon vif
  // (cartItems / tvaRate / quoteSettings) ; `variants` mémorise toutes les variantes.
  const [variantsMode, setVariantsMode] = useState(false);
  const [variants, setVariants] = useState([]);
  const [activeVariantId, setActiveVariantId] = useState('');
  const [variantNotice, setVariantNotice] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [activeQuoteId, setActiveQuoteId] = useState(null);
  const [isSavingQuote, setIsSavingQuote] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [quoteLoadError, setQuoteLoadError] = useState('');
  const [pdfGenerated, setPdfGenerated] = useState(false);
  const [generationSuccess, setGenerationSuccess] = useState(null);
  const [deliveryAction, setDeliveryAction] = useState('');
  const [deliveryMessage, setDeliveryMessage] = useState('');
  const [deliveryError, setDeliveryError] = useState('');
  const cartRef = useRef(null);
  const [cartVisible, setCartVisible] = useState(true);
  const [dismissedPoseSafetyKey, setDismissedPoseSafetyKey] = useState('');

  // Floating cart bar totals
  const cartBarTotals = useMemo(() => {
    let totalHT = 0;
    cartItems.forEach((item) => {
      const calc = calculateItemPrice(item);
      totalHT += calc.totalLine;
      if (item.includePose) totalHT += calc.posePrice * item.quantity;
    });
    const totalTTC = Math.round(totalHT * (1 + tvaRate / 100) * 100) / 100;
    return { totalHT: Math.round(totalHT * 100) / 100, totalTTC };
  }, [cartItems, tvaRate]);

  // Variantes « matérialisées » : la variante active reflète le tampon vif en cours
  // d'édition (cartItems/tvaRate/quoteSettings), les autres leur snapshot mémorisé.
  const materializedVariants = useMemo(() => {
    if (!variantsMode) return [];
    return variants.map((variant) =>
      variant.id === activeVariantId
        ? { ...variant, cartItems, tvaRate, quoteSettings }
        : variant
    );
  }, [variantsMode, variants, activeVariantId, cartItems, tvaRate, quoteSettings]);

  const poseSafety = useMemo(() => {
    const hasPose = cartItems.some((item) => Boolean(item.includePose));
    const hasWasteManagement = cartItems.some(
      (item) => item.productId === WASTE_MANAGEMENT_PRODUCT_ID
    );
    const hasTechnicalMeasurement = cartItems.some(
      (item) => item.productId === TECHNICAL_MEASUREMENT_PRODUCT_ID
    );
    const missing = [];

    if (hasPose && !hasTechnicalMeasurement) {
      missing.push({
        id: TECHNICAL_MEASUREMENT_PRODUCT_ID,
        label: 'Métrage technique offert',
      });
    }

    if (hasPose && !hasWasteManagement) {
      missing.push({
        id: WASTE_MANAGEMENT_PRODUCT_ID,
        label: 'Gestion des déchets',
      });
    }

    const signature = hasPose
      ? [
          cartItems
            .filter((item) => Boolean(item.includePose))
            .map((item) => `${item.id}:${item.productId}:${item.quantity || 1}`)
            .join('|'),
          `metrage:${hasTechnicalMeasurement ? 'yes' : 'no'}`,
          `dechets:${hasWasteManagement ? 'yes' : 'no'}`,
        ].join('|')
      : '';

    return {
      hasPose,
      hasWasteManagement,
      hasTechnicalMeasurement,
      missing,
      signature,
    };
  }, [cartItems]);

  const shouldShowPoseSafety =
    poseSafety.hasPose &&
    poseSafety.missing.length > 0 &&
    poseSafety.signature !== dismissedPoseSafetyKey;

  // Observe cart visibility for floating bar
  useEffect(() => {
    if (!cartRef.current) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setCartVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(cartRef.current);
    return () => observer.disconnect();
  }, [currentStep]);

  const scrollToCart = () => {
    cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const requestedQuoteId = searchParams.get('quote');
  const requestedClientId = searchParams.get('client');

  // ── Anti-perte : restauration d'un brouillon local au montage ──────────────
  // Uniquement pour un nouveau devis (pas de devis/fiche cloud demandé dans l'URL).
  const draftRestoreAttemptedRef = useRef(false);
  useEffect(() => {
    if (draftRestoreAttemptedRef.current) return;
    draftRestoreAttemptedRef.current = true;
    if (requestedQuoteId || requestedClientId) return;

    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      const restoredItems = Array.isArray(draft?.cartItems) ? draft.cartItems : [];
      const hasContent =
        restoredItems.length > 0 || hasMeaningfulClientData(draft?.clientData);
      if (!hasContent) {
        clearLocalDraft();
        return;
      }

      if (draft.clientData) setClientData(draft.clientData);
      if (restoredItems.length > 0) {
        setCartItems(normalizeCartItemsForQuote(restoredItems));
      }
      if (Number.isFinite(Number(draft.tvaRate))) setTvaRate(Number(draft.tvaRate));
      if (draft.quoteSettings) setQuoteSettings(normalizeQuoteSettings(draft.quoteSettings));
      if (typeof draft.quoteReference === 'string') setQuoteReference(draft.quoteReference);
      if (
        draft.variantsMode === true &&
        Array.isArray(draft.variants) &&
        draft.variants.length > 0
      ) {
        setVariantsMode(true);
        setVariants(draft.variants);
        setActiveVariantId(
          draft.variants.some((variant) => variant.id === draft.activeVariantId)
            ? draft.activeVariantId
            : draft.variants[0].id
        );
      }
      if (Number.isFinite(Number(draft.currentStep))) {
        setCurrentStep(Math.min(3, Math.max(1, Number(draft.currentStep))));
      }
      setDraftRestored(true);
    } catch {
      clearLocalDraft();
    }
  }, [requestedQuoteId, requestedClientId]);

  // ── Anti-perte : sauvegarde automatique (debounce 1 s) ─────────────────────
  // On ne sauvegarde qu'un nouveau devis non encore enregistré en base (activeQuoteId nul).
  useEffect(() => {
    if (activeQuoteId) return undefined;
    const hasContent = cartItems.length > 0 || hasMeaningfulClientData(clientData);
    if (!hasContent) return undefined;

    const handle = setTimeout(() => {
      try {
        window.localStorage.setItem(
          DRAFT_STORAGE_KEY,
          JSON.stringify({
            clientData,
            cartItems,
            tvaRate,
            quoteSettings,
            quoteReference,
            currentStep,
            variantsMode,
            variants: materializedVariants,
            activeVariantId,
            savedAt: Date.now(),
          })
        );
      } catch {
        // localStorage indisponible / quota dépassé — on ignore silencieusement.
      }
    }, 1000);

    return () => clearTimeout(handle);
  }, [
    activeQuoteId,
    clientData,
    cartItems,
    tvaRate,
    quoteSettings,
    quoteReference,
    currentStep,
    variantsMode,
    materializedVariants,
    activeVariantId,
  ]);

  const handleDiscardDraft = () => {
    clearLocalDraft();
    setDraftRestored(false);
    resetQuoteState();
  };
  const canSaveCloudQuote = Boolean(hasMeaningfulClientData(clientData) && cartItems.length > 0);
  const canSendQuoteDirectly = Boolean(firebaseConfigured && user && canSaveCloudQuote && clientData?.email);
  const directSendHint = !clientData?.email
    ? "Ajoutez l'email du client pour envoyer le devis."
    : !firebaseConfigured
      ? 'Connexion cloud indisponible pour le moment.'
      : !user
        ? 'Connectez-vous pour envoyer le devis au client.'
        : '';

  const resetGenerationState = () => {
    setPdfGenerated(false);
    setGenerationSuccess(null);
    setDeliveryAction('');
    setDeliveryMessage('');
    setDeliveryError('');
  };

  const resetQuoteState = () => {
    setCurrentStep(1);
    setClientData(null);
    setCartItems([]);
    setTvaRate(DEFAULT_TVA_RATE);
    setQuoteSettings(getDefaultQuoteSettings());
    setQuoteReference('');
    setVariantsMode(false);
    setVariants([]);
    setActiveVariantId('');
    setVariantNotice('');
    setEditingItem(null);
    setActiveQuoteId(null);
    setSaveMessage('');
    setSaveError('');
    setQuoteLoadError('');
    setDraftRestored(false);
    clearLocalDraft();
    resetGenerationState();
    router.replace('/');
  };

  // Ferme le devis courant et repart à zéro. Confirme si du travail risque
  // d'être perdu (panier non vidé). Après un envoi/enregistrement, on enchaîne
  // directement.
  const handleStartNewQuote = () => {
    // On confirme seulement si du travail non enregistré risque d'être perdu :
    // un devis déjà enregistré (activeQuoteId) ou tout juste envoyé/généré
    // (generationSuccess) peut être fermé directement.
    const hasUnsavedWork = cartItems.length > 0 && !activeQuoteId && !generationSuccess;
    if (hasUnsavedWork) {
      const confirmed =
        typeof window === 'undefined' ||
        window.confirm(
          'Fermer ce devis et démarrer un nouveau devis ? Les modifications non enregistrées seront perdues.'
        );
      if (!confirmed) return;
    }
    resetQuoteState();
  };

  const getQuotePdfOptions = (quote) => {
    const workflow = quote?.signatureWorkflow || {};

    return {
      // Le numéro figé sur le devis (racine) fait FOI ; le workflow n'est qu'un repli
      // historique (il peut rester sur l'ancien numéro après une modification).
      quoteNumber: quote?.quoteNumber || workflow.quoteNumber || undefined,
      issueDate: quote?.quoteIssuedAt || workflow.issueDate || undefined,
      reference:
        quote?.referenceDevis ||
        quote?.payload?.reference ||
        quoteReference ||
        undefined,
    };
  };

  const applySavedQuote = (quote) => {
    const payload = quote?.payload || {};

    setClientData(payload.clientData || null);
    setQuoteReference(
      quote?.referenceDevis ||
        payload.reference ||
        payload.clientData?.referenceDevis ||
        ''
    );

    const hasVariants =
      payload.variantsMode === true &&
      Array.isArray(payload.variants) &&
      payload.variants.length > 0;

    if (hasVariants) {
      const active =
        payload.variants.find((variant) => variant.id === payload.activeVariantId) ||
        payload.variants[0];
      setVariantsMode(true);
      setVariants(payload.variants);
      setActiveVariantId(active.id);
      loadVariantIntoBuffer(active);
    } else {
      setVariantsMode(false);
      setVariants([]);
      setActiveVariantId('');
      setCartItems(
        normalizeCartItemsForQuote(Array.isArray(payload.cartItems) ? payload.cartItems : [])
      );
      setTvaRate(
        Number.isFinite(Number(payload.tvaRate)) ? Number(payload.tvaRate) : DEFAULT_TVA_RATE
      );
      setQuoteSettings(normalizeQuoteSettings(payload.quoteSettings));
    }
    const nextStep = Number.isFinite(Number(payload.currentStep))
      ? Number(payload.currentStep)
      : 2;
    setCurrentStep(Math.min(3, Math.max(1, nextStep)));
    setEditingItem(null);
    setActiveQuoteId(quote.id);
    setSaveMessage('');
    setSaveError('');
    setQuoteLoadError('');
    resetGenerationState();
  };

  useEffect(() => {
    if (!firebaseConfigured || authInitializing || !requestedQuoteId) return;

    if (!user) {
      setQuoteLoadError('Connectez-vous dans "Mes devis" pour charger ce devis cloud.');
      return;
    }

    if (requestedQuoteId === activeQuoteId) return;

    let cancelled = false;

    const loadQuote = async () => {
      setIsLoadingQuote(true);
      setQuoteLoadError('');

      try {
        const savedQuote = await getQuoteById({
          userId: user.uid,
          quoteId: requestedQuoteId,
        });

        if (cancelled) return;

        if (!savedQuote) {
          setQuoteLoadError('Ce devis est introuvable ou ne vous appartient pas.');
          return;
        }

        applySavedQuote(savedQuote);
      } catch (error) {
        if (!cancelled) {
          setQuoteLoadError(error.message || 'Impossible de charger ce devis cloud.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingQuote(false);
        }
      }
    };

    void loadQuote();

    return () => {
      cancelled = true;
    };
  }, [activeQuoteId, authInitializing, firebaseConfigured, requestedQuoteId, user]);

  useEffect(() => {
    if (!firebaseConfigured || authInitializing || !requestedClientId || requestedQuoteId) return;

    if (!user) {
      setQuoteLoadError('Connectez-vous pour charger cette fiche client depuis le cloud.');
      return;
    }

    if (requestedClientId === clientData?.savedClientId) return;

    let cancelled = false;

    const loadClient = async () => {
      setQuoteLoadError('');

      try {
        const savedClient = await getClientById({
          userId: user.uid,
          clientId: requestedClientId,
        });

        if (cancelled) return;

        if (!savedClient) {
          setQuoteLoadError('Cette fiche client est introuvable ou ne vous appartient pas.');
          return;
        }

        setClientData(savedClient.payload || null);
        setCurrentStep(1);
      } catch (error) {
        if (!cancelled) {
          setQuoteLoadError(error.message || 'Impossible de charger cette fiche client.');
        }
      }
    };

    void loadClient();

    return () => {
      cancelled = true;
    };
  }, [
    authInitializing,
    clientData?.savedClientId,
    firebaseConfigured,
    requestedClientId,
    requestedQuoteId,
    user,
  ]);

  const handleClientNext = (data) => {
    setClientData(data);
    setCurrentStep(2);
  };

  const updateCartItems = (updater) => {
    setCartItems((previousItems) =>
      normalizeCartItemsForQuote(
        typeof updater === 'function' ? updater(previousItems) : updater
      )
    );
  };

  const handleAddToCart = (item) => {
    updateCartItems((prev) => {
      const existing = prev.findIndex((entry) => entry.id === item.id);
      if (existing >= 0) {
        const nextItems = [...prev];
        const previousItem = nextItems[existing];
        nextItems[existing] = shouldKeepManualDesignation(previousItem, item)
          ? {
              ...item,
              customDescription: previousItem.customDescription,
              customDescriptionManual: true,
            }
          : item;
        return nextItems;
      }
      return [...prev, item];
    });
    setEditingItem(null);
    setSaveMessage('');
    resetGenerationState();
  };

  const handleAddMissingPoseServices = () => {
    updateCartItems((prev) => {
      const additions = [];
      const hasTechnicalMeasurement = prev.some(
        (item) => item.productId === TECHNICAL_MEASUREMENT_PRODUCT_ID
      );
      const hasWasteManagement = prev.some(
        (item) => item.productId === WASTE_MANAGEMENT_PRODUCT_ID
      );

      if (!hasTechnicalMeasurement) {
        const measurementItem = createCatalogServiceCartItem(
          TECHNICAL_MEASUREMENT_PRODUCT_ID,
          { id: createCartItemId('metrage') }
        );
        if (measurementItem) {
          additions.push(measurementItem);
        }
      }

      if (!hasWasteManagement) {
        additions.push(createWasteManagementCartItem(prev));
      }

      return additions.length > 0 ? [...prev, ...additions] : prev;
    });
    setDismissedPoseSafetyKey('');
    setSaveMessage('');
    resetGenerationState();
  };

  const handleDismissPoseSafety = () => {
    setDismissedPoseSafetyKey(poseSafety.signature);
  };

  const handleDuplicateItem = (itemId) => {
    const itemToDuplicate = cartItems.find((item) => item.id === itemId);
    if (!itemToDuplicate) return;

    const newItem = {
      ...itemToDuplicate,
      id: Date.now().toString(),
    };

    updateCartItems((prev) => [...prev, newItem]);
    setSaveMessage('');
    resetGenerationState();
  };

  const handleEditItem = (itemId) => {
    const itemToEdit = cartItems.find((item) => item.id === itemId);
    setEditingItem(itemToEdit || null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRemoveFromCart = (itemId) => {
    updateCartItems((prev) => prev.filter((item) => item.id !== itemId));
    setSaveMessage('');
    resetGenerationState();
  };

  const handleUpdateQuantity = (itemId, newQty) => {
    updateCartItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, quantity: newQty } : item))
    );
    setSaveMessage('');
    resetGenerationState();
  };

  const handleGoBack = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const handleReorderItems = (nextItems) => {
    updateCartItems(nextItems);
    setSaveMessage('');
    resetGenerationState();
  };

  // ── Variantes de configuration ────────────────────────────────────────────
  // Charge le snapshot d'une variante dans le tampon vif (édition).
  const loadVariantIntoBuffer = (variant) => {
    setCartItems(normalizeCartItemsForQuote(Array.isArray(variant?.cartItems) ? variant.cartItems : []));
    setTvaRate(Number.isFinite(Number(variant?.tvaRate)) ? Number(variant.tvaRate) : DEFAULT_TVA_RATE);
    setQuoteSettings(normalizeQuoteSettings(variant?.quoteSettings));
    setEditingItem(null);
  };

  const handleEnableVariants = () => {
    if (variantsMode) return;
    const id = createVariantId();
    setVariants([{ id, name: 'Variante A', summary: '', cartItems, tvaRate, quoteSettings }]);
    setActiveVariantId(id);
    setVariantsMode(true);
    setVariantNotice('');
    setSaveMessage('');
    resetGenerationState();
  };

  const handleSelectVariant = (id) => {
    if (!variantsMode || id === activeVariantId) return;
    const committed = materializedVariants;
    const target = committed.find((variant) => variant.id === id);
    if (!target) return;
    setVariants(committed); // fige l'édition courante avant de changer de variante
    setActiveVariantId(id);
    loadVariantIntoBuffer(target);
    setVariantNotice('');
  };

  const handleAddVariant = () => {
    const committed = materializedVariants;
    if (committed.length >= MAX_VARIANTS) {
      setVariantNotice(`Limite de ${MAX_VARIANTS} variantes atteinte.`);
      return;
    }
    const source =
      committed.find((variant) => variant.id === activeVariantId) || committed[0];
    const id = createVariantId();
    const newVariant = {
      id,
      name: `Variante ${variantLetter(committed.length)}`,
      summary: '',
      // Duplication : on clone la config courante pour n'ajuster que l'option qui change.
      cartItems: (source?.cartItems || []).map((item) => ({ ...item })),
      tvaRate: source?.tvaRate ?? tvaRate,
      quoteSettings: source?.quoteSettings ?? quoteSettings,
    };
    setVariants([...committed, newVariant]);
    setActiveVariantId(id);
    loadVariantIntoBuffer(newVariant);
    setVariantNotice('');
    setSaveMessage('');
    resetGenerationState();
  };

  const handleRenameVariant = (id, name) => {
    setVariants((previous) =>
      previous.map((variant) => (variant.id === id ? { ...variant, name } : variant))
    );
  };

  const handleReorderVariant = (id, direction) => {
    const committed = materializedVariants;
    const index = committed.findIndex((variant) => variant.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= committed.length) return;
    const next = [...committed];
    [next[index], next[target]] = [next[target], next[index]];
    setVariants(next);
  };

  const handleDeleteVariant = (id) => {
    const committed = materializedVariants;
    if (committed.length <= 1) return; // interdit de supprimer la dernière
    if (!window.confirm('Supprimer cette variante ?')) return;

    const remaining = committed.filter((variant) => variant.id !== id);

    if (remaining.length === 1) {
      // Repasse en mono-option : la variante restante redevient le devis classique.
      const only = remaining[0];
      setVariantsMode(false);
      setVariants([]);
      setActiveVariantId('');
      loadVariantIntoBuffer(only);
      setSaveMessage('');
      resetGenerationState();
      return;
    }

    let nextActiveId = activeVariantId;
    if (id === activeVariantId) {
      nextActiveId = remaining[0].id;
      loadVariantIntoBuffer(remaining[0]);
    }
    setVariants(remaining);
    setActiveVariantId(nextActiveId);
    setSaveMessage('');
    resetGenerationState();
  };

  const persistQuoteToCloud = async ({ origin = 'manual' } = {}) => {
    if (!firebaseConfigured) {
      if (origin === 'manual') {
        setSaveError('Connexion cloud indisponible pour le moment.');
      }
      return null;
    }

    if (!user) {
      if (origin === 'manual') {
        setSaveError('Connectez-vous dans "Mes devis" avant d’enregistrer votre devis.');
      }
      return null;
    }

    if (!canSaveCloudQuote) {
      if (origin === 'manual') {
        setSaveError('Ajoutez au moins un article et renseignez le client avant d’enregistrer.');
      }
      return null;
    }

    setIsSavingQuote(true);
    setSaveError('');
    if (origin === 'manual') {
      setSaveMessage('');
    }

    try {
      const savedClient = await saveClientProfile({
        userId: user.uid,
        clientData,
      });
      const nextClientData = savedClient?.payload || clientData;

      setClientData(nextClientData);

      const savedQuote = await saveQuoteDraft({
        userId: user.uid,
        quoteId: activeQuoteId,
        title: undefined,
        clientData: nextClientData,
        cartItems,
        tvaRate,
        quoteSettings,
        reference: quoteReference,
        variantsMode,
        variants: materializedVariants,
        activeVariantId,
        currentStep: ['pdf', 'delivery'].includes(origin) ? 3 : currentStep,
        // L'envoi (re)crée une session côté serveur juste après cette sauvegarde :
        // ne pas invalider la signature ici (sinon « devis modifié » + lien inactif).
        skipSignatureInvalidation: origin === 'delivery',
      });

      setActiveQuoteId(savedQuote.id);
      // Le devis est désormais persisté en base : le brouillon local n'a plus lieu d'être.
      clearLocalDraft();
      setDraftRestored(false);

      if (origin === 'pdf') {
        setSaveMessage(
          activeQuoteId
            ? 'PDF genere et devis mis a jour automatiquement.'
            : 'PDF genere et devis enregistre automatiquement dans "Mes devis".'
        );
      } else if (origin === 'delivery') {
        setSaveMessage(
          activeQuoteId
            ? 'Devis mis à jour avant envoi.'
            : 'Devis enregistré dans "Mes devis" avant envoi.'
        );
      } else {
        setSaveMessage(
          activeQuoteId
            ? 'Devis et fiche client mis a jour.'
            : 'Devis enregistre dans "Mes devis" et client memorise.'
        );
      }

      router.replace(`/?quote=${savedQuote.id}`);
      return savedQuote;
    } catch (error) {
      setSaveError(
        origin === 'pdf'
          ? error.message || 'PDF genere, mais la sauvegarde cloud a echoue.'
          : error.message || 'Impossible d’enregistrer ce devis.'
      );
      return null;
    } finally {
      setIsSavingQuote(false);
    }
  };

  const handleSaveQuote = async () => {
    await persistQuoteToCloud({ origin: 'manual' });
  };

  const handleGeneratePdf = async () => {
    setSaveError('');

    try {
      let savedQuote = null;
      if (firebaseConfigured && user && canSaveCloudQuote) {
        savedQuote = await persistQuoteToCloud({ origin: 'pdf' });
      }

      // On réutilise le numéro FIGÉ du devis sauvegardé (numéro + date d'émission)
      // pour que le PDF téléchargé porte le même numéro que celui envoyé au client.
      const pdfOptions = savedQuote
        ? getQuotePdfOptions(savedQuote)
        : { reference: quoteReference };

      if (variantsMode && materializedVariants.length > 1) {
        await generateMultiVariantQuotePDF(clientData, materializedVariants, pdfOptions);
      } else {
        await generateQuotePDF(clientData, cartItems, tvaRate, quoteSettings, pdfOptions);
      }
      setPdfGenerated(true);
      setGenerationSuccess({
        clientName:
          savedQuote?.clientName ||
          [clientData?.prenom, clientData?.nom].filter(Boolean).join(' ').trim() ||
          'votre client',
      });
    } catch (error) {
      setSaveError(error?.message || 'Impossible de generer le PDF.');
    }
  };

  const handleSendQuoteDelivery = async (deliveryMode) => {
    setSaveError('');
    setDeliveryError('');
    setDeliveryMessage('');

    if (!firebaseConfigured) {
      setDeliveryError('Connexion cloud indisponible pour le moment.');
      return;
    }

    if (!user) {
      setDeliveryError('Connectez-vous dans "Mes devis" avant d’envoyer un devis.');
      return;
    }

    if (!canSaveCloudQuote) {
      setDeliveryError('Ajoutez au moins un article et renseignez le client avant l’envoi.');
      return;
    }

    const recipientEmail = clientData?.email;
    if (!recipientEmail) {
      setDeliveryError("Ajoutez un email client avant d'envoyer ce devis.");
      return;
    }

    setDeliveryAction(deliveryMode);

    try {
      const savedQuote = await persistQuoteToCloud({ origin: 'delivery' });
      if (!savedQuote?.id) {
        throw new Error("Impossible d'enregistrer le devis avant l'envoi.");
      }

      let pdfDocument;
      let variantsPayload = null;

      if (variantsMode && materializedVariants.length > 1) {
        // Multi-variantes : PDF comparatif (vue client) + PDF mono signable par variante,
        // générés depuis l'état LOCAL complet (images incluses).
        pdfDocument = await buildMultiVariantQuotePdfDocument(
          savedQuote.payload?.clientData || clientData || null,
          materializedVariants,
          getQuotePdfOptions(savedQuote)
        );
        variantsPayload = (pdfDocument.variantDocuments || [])
          .map((variant) => {
            // On joint les réglages/TVA/pose de la variante (état local) pour que le
            // serveur recalcule l'acompte EXACT de la configuration choisie à la signature.
            const source = materializedVariants.find((entry) => entry.id === variant.id);
            if (!source) return null;
            return {
              id: variant.id,
              name: variant.name,
              totalHT: variant.totalHT,
              totalTTC: variant.totalTTC,
              tvaRate: source.tvaRate,
              quoteSettings: source.quoteSettings,
              hasMeasurementVisit:
                Array.isArray(source.cartItems) &&
                source.cartItems.some((item) => item?.includePose === true),
              // Portes à panneau décoratif PROPRES à cette variante (couleurs spécifiques).
              panelSelections: buildPanelSelections(source.cartItems),
              filename: variant.filename,
              signatureAnchors: variant.signatureAnchors,
              pdfBase64: arrayBufferToBase64(variant.arrayBuffer),
            };
          })
          .filter(Boolean);
      } else {
        // Mono : on réinjecte les images locales (le cloud strippe les data-URLs trop lourdes).
        const savedCartItems = savedQuote.payload?.cartItems || cartItems || [];
        const mergedCartItems = savedCartItems.map((savedItem) => {
          const localItem = cartItems.find((ci) => ci.id === savedItem.id);
          if (localItem?.customImage && !savedItem.customImage) {
            return { ...savedItem, customImage: localItem.customImage };
          }
          return savedItem;
        });

        pdfDocument = await buildQuotePdfDocument(
          savedQuote.payload?.clientData || clientData || null,
          mergedCartItems,
          savedQuote.payload?.tvaRate ?? tvaRate ?? DEFAULT_TVA_RATE,
          savedQuote.payload?.quoteSettings || quoteSettings || null,
          getQuotePdfOptions(savedQuote)
        );
      }

      const idToken = await user.getIdToken();
      const response = await fetch('/api/quote-signatures/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          quoteId: savedQuote.id,
          deliveryMode,
          pdfBase64: arrayBufferToBase64(pdfDocument.arrayBuffer),
          pdfInfo: {
            filename: pdfDocument.filename,
            quoteNumber: pdfDocument.quoteNumber,
            issueDate: pdfDocument.issueDate,
            totalHT: pdfDocument.totals?.totalHT || 0,
            totalTTC: pdfDocument.totals?.totalTTC || 0,
            quantityWithPose: pdfDocument.totals?.quantityWithPose || 0,
            tvaRate: pdfDocument.tvaRate,
            signatureAnchors: pdfDocument.signatureAnchors,
          },
          ...(variantsPayload ? { variants: variantsPayload } : {}),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Impossible d'envoyer le devis.");
      }

      setDeliveryMessage(
        deliveryMode === 'signature'
          ? 'Le devis a été envoyé au client avec son lien de signature.'
          : 'Le devis a été envoyé au client par email.'
      );
      // Écran de fin : permet de fermer ce devis et d'enchaîner sur le suivant.
      setGenerationSuccess({
        mode: deliveryMode === 'signature' ? 'signature' : 'email',
        clientName:
          savedQuote?.clientName ||
          [clientData?.prenom, clientData?.nom].filter(Boolean).join(' ').trim() ||
          'votre client',
      });
    } catch (error) {
      setDeliveryError(error?.message || "Impossible d'envoyer le devis.");
    } finally {
      setDeliveryAction('');
    }
  };

  const hasQuoteInProgress = Boolean(
    clientData || cartItems.length > 0 || activeQuoteId
  );

  const headerActions = (
    <div className="flex items-center gap-2">
      {hasQuoteInProgress && (
        <button
          onClick={handleStartNewQuote}
          className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900"
          title="Fermer ce devis et en démarrer un nouveau"
        >
          <FilePlus2 size={16} />
          <span className="hidden sm:inline">Nouveau devis</span>
        </button>
      )}
      {firebaseConfigured && user && canSaveCloudQuote && (
        <button
          onClick={() => void handleSaveQuote()}
          disabled={isSavingQuote}
          className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Enregistrer le brouillon"
        >
          {isSavingQuote ? (
            <Loader2 size={16} className="animate-spin text-orange-500" />
          ) : (
            <CloudUpload size={16} className={saveMessage ? 'text-green-500' : ''} />
          )}
          <span className="hidden sm:inline">
            {isSavingQuote ? '...' : saveMessage ? 'Enregistre' : 'Enregistrer'}
          </span>
        </button>
      )}
      {currentStep > 1 && (
        <button
          onClick={handleGoBack}
          className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Retour</span>
        </button>
      )}
    </div>
  );

  const variantBar = (
    <div className="mx-auto w-full max-w-6xl">
      <VariantBar
        variantsMode={variantsMode}
        variants={materializedVariants}
        activeVariantId={activeVariantId}
        maxVariants={MAX_VARIANTS}
        onEnable={handleEnableVariants}
        onSelect={handleSelectVariant}
        onAdd={handleAddVariant}
        onRename={handleRenameVariant}
        onDelete={handleDeleteVariant}
        onReorder={handleReorderVariant}
      />
      {variantNotice && (
        <p className="mb-3 -mt-2 px-1 text-xs font-semibold text-amber-600">{variantNotice}</p>
      )}
    </div>
  );

  return (
    <AppShell
      title="Nouveau Devis"
      actions={headerActions}
    >
      {(quoteLoadError || saveError || (saveMessage && isSavingQuote === false)) && (
        <div className="mx-auto mb-4 max-w-3xl px-4 sm:px-0">
          {quoteLoadError && (
            <div className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-600 border border-red-100">
              {quoteLoadError}
            </div>
          )}
          {saveError && !quoteLoadError && (
            <div className="rounded-xl bg-orange-50 p-3 text-sm font-semibold text-orange-600 border border-orange-100">
              {saveError}
            </div>
          )}
        </div>
      )}

      {isLoadingQuote && (
        <div className="mx-auto mb-8 max-w-6xl rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">
          Chargement du devis cloud...
        </div>
      )}

      {draftRestored && !activeQuoteId && (
        <div className="mx-auto mb-4 max-w-3xl px-4 sm:px-0">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50 px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-orange-700">
              <RotateCcw size={15} className="shrink-0" />
              <span className="truncate">Brouillon récupéré.</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-orange-700 transition hover:bg-orange-100"
              >
                Effacer et recommencer
              </button>
              <button
                type="button"
                onClick={() => setDraftRestored(false)}
                className="rounded-lg p-1.5 text-orange-400 transition hover:bg-orange-100 hover:text-orange-600"
                aria-label="Masquer"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto mb-5 flex max-w-3xl items-center justify-center gap-1 sm:mb-8 sm:gap-2">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = step.number === currentStep;
          const isCompleted = step.number < currentStep;

          return (
            <div key={step.number} className="flex items-center gap-1 sm:gap-2">
              <div
                className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-all sm:gap-2 sm:px-4 ${
                  isActive
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                    : isCompleted
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-400'
                }`}
                onClick={() => {
                  if (isCompleted) setCurrentStep(step.number);
                }}
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{step.label}</span>
              </div>
              {index < STEPS.length - 1 && (
                <div className={`h-px w-3 sm:w-6 ${isCompleted ? 'bg-green-300' : 'bg-slate-200'}`} />
              )}
            </div>
          );
        })}
      </div>

      {currentStep === 1 && (
        <ClientForm
          onNext={handleClientNext}
          initialData={clientData}
          reference={quoteReference}
          onReferenceChange={setQuoteReference}
        />
      )}

      {currentStep === 2 && (
        <>
          {variantBar}
          <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-6 sm:gap-8 lg:grid-cols-5">
            {editingItem && (
              <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm lg:hidden" />
            )}
            <div
              className={`min-w-0 lg:col-span-3 ${
                editingItem
                  ? 'fixed inset-0 z-50 overflow-y-auto bg-white px-4 pb-6 pt-16 lg:static lg:z-auto lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0'
                  : ''
              }`}
            >
              <ProductSelector
                onAddToCart={handleAddToCart}
                cartItems={cartItems}
                editingItem={editingItem}
                onCancelEdit={() => setEditingItem(null)}
              />
            </div>

            <div ref={cartRef} id="cart-section" className="min-w-0 lg:col-span-2">
              <div className="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
                {shouldShowPoseSafety && (
                  <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <AlertTriangle size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-amber-950">
                          Pose détectée
                        </p>
                        <p className="mt-1 break-words text-xs leading-5 text-amber-900">
                          Il manque : {poseSafety.missing.map((item) => item.label).join(' et ')}.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleDismissPoseSafety}
                        className="rounded-lg p-1.5 text-amber-700 transition hover:bg-amber-100"
                        aria-label="Ne pas ajouter ces services"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleAddMissingPoseServices}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-700"
                      >
                        <Plus size={14} />
                        Ajouter au devis
                      </button>
                      <button
                        type="button"
                        onClick={handleDismissPoseSafety}
                        className="inline-flex items-center justify-center rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100"
                      >
                        Ne pas ajouter
                      </button>
                    </div>
                  </div>
                )}
                <Cart
                  items={cartItems}
                  tvaRate={tvaRate}
                  setTvaRate={setTvaRate}
                  onRemove={handleRemoveFromCart}
                  onDuplicate={handleDuplicateItem}
                  onEdit={handleEditItem}
                  onUpdateQuantity={handleUpdateQuantity}
                  onReorder={handleReorderItems}
                  onNext={() => setCurrentStep(3)}
                  editingItemId={editingItem?.id}
                />
              </div>
            </div>
          </div>

          {/* Floating cart bar — mobile only, when cart is scrolled out of view */}
          {cartItems.length > 0 && !cartVisible && (
            <div className="fixed bottom-16 left-0 right-0 z-30 px-3 lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
              <button
                type="button"
                onClick={scrollToCart}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl shadow-slate-900/10"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-white">
                    <ShoppingCart size={16} />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-900">
                      {cartItems.length} article{cartItems.length > 1 ? 's' : ''}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {cartBarTotals.totalTTC.toFixed(2)} € TTC
                    </p>
                  </div>
                </div>
                <span className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white">
                  Voir panier
                </span>
              </button>
            </div>
          )}
        </>
      )}

      {currentStep === 3 && generationSuccess && (
        <QuoteGenerationSuccess
          clientName={generationSuccess.clientName}
          mode={generationSuccess.mode}
          isCloudAvailable={Boolean(firebaseConfigured && user)}
          onCreateNewQuote={resetQuoteState}
          onOpenSavedQuotes={() => router.push('/devis')}
          onReturnToSummary={() => setGenerationSuccess(null)}
        />
      )}

      {currentStep === 3 && !generationSuccess && (
        <>
          {variantBar}
          <QuoteSummary
          clientData={clientData}
          cartItems={cartItems}
          tvaRate={tvaRate}
          setTvaRate={setTvaRate}
          quoteSettings={quoteSettings}
          setQuoteSettings={setQuoteSettings}
          onGoBack={() => setCurrentStep(2)}
          onUpdateItem={handleAddToCart}
          onGeneratePdf={handleGeneratePdf}
          onDownloadAgain={handleGeneratePdf}
          pdfGenerated={pdfGenerated}
          onSendQuote={() => void handleSendQuoteDelivery('email')}
          onSendQuoteForSignature={() => void handleSendQuoteDelivery('signature')}
          isSendingDelivery={Boolean(deliveryAction)}
          activeDeliveryMode={deliveryAction}
          deliveryMessage={deliveryMessage}
          deliveryError={deliveryError}
          canSendQuoteDirectly={canSendQuoteDirectly}
          directSendHint={directSendHint}
          poseSafety={shouldShowPoseSafety ? poseSafety : null}
          onAddMissingPoseServices={handleAddMissingPoseServices}
          onDismissPoseSafety={handleDismissPoseSafety}
        />
        </>
      )}
    </AppShell>
  );
}




