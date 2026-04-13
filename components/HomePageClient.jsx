'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ClientForm from '@/components/ClientForm';
import ProductSelector from '@/components/ProductSelector';
import Cart from '@/components/Cart';
import QuoteSummary from '@/components/QuoteSummary';
import AppShell from '@/components/AppShell';

import { useFirebaseAuth } from '@/components/FirebaseProvider';
import { hasMeaningfulClientData } from '@/lib/client-cloud';
import { getClientById, saveClientProfile } from '@/lib/firebase/clients';
import { calculateItemPrice } from '@/lib/products';
import { generateQuotePDF } from '@/lib/pdf-generator';
import { getDefaultQuoteSettings, normalizeQuoteSettings } from '@/lib/quote-settings.mjs';
import { getQuoteById, saveQuoteDraft } from '@/lib/firebase/quotes';
import { ArrowLeft, CloudUpload, FileText, Loader2, ShoppingCart, User } from 'lucide-react';

const STEPS = [
  { number: 1, label: 'Client', icon: User },
  { number: 2, label: 'Produits', icon: ShoppingCart },
  { number: 3, label: 'Recapitulatif', icon: FileText },
];

const DEFAULT_TVA_RATE = 10;

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
  const [editingItem, setEditingItem] = useState(null);
  const [activeQuoteId, setActiveQuoteId] = useState(null);
  const [isSavingQuote, setIsSavingQuote] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [quoteLoadError, setQuoteLoadError] = useState('');
  const [pdfGenerated, setPdfGenerated] = useState(false);
  const cartRef = useRef(null);
  const [cartVisible, setCartVisible] = useState(true);

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
  const canSaveCloudQuote = Boolean(hasMeaningfulClientData(clientData) && cartItems.length > 0);

  const resetQuoteState = () => {
    setCurrentStep(1);
    setClientData(null);
    setCartItems([]);
    setTvaRate(DEFAULT_TVA_RATE);
    setQuoteSettings(getDefaultQuoteSettings());
    setEditingItem(null);
    setActiveQuoteId(null);
    setSaveMessage('');
    setSaveError('');
    setQuoteLoadError('');
    setPdfGenerated(false);
    router.replace('/');
  };

  const applySavedQuote = (quote) => {
    const payload = quote?.payload || {};

    setClientData(payload.clientData || null);
    setCartItems(Array.isArray(payload.cartItems) ? payload.cartItems : []);
    setTvaRate(
      Number.isFinite(Number(payload.tvaRate)) ? Number(payload.tvaRate) : DEFAULT_TVA_RATE
    );
    setQuoteSettings(normalizeQuoteSettings(payload.quoteSettings));
    const nextStep = Number.isFinite(Number(payload.currentStep))
      ? Number(payload.currentStep)
      : 2;
    setCurrentStep(Math.min(3, Math.max(1, nextStep)));
    setEditingItem(null);
    setActiveQuoteId(quote.id);
    setSaveMessage('');
    setSaveError('');
    setQuoteLoadError('');
    setPdfGenerated(false);
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

  const handleAddToCart = (item) => {
    setCartItems((prev) => {
      const existing = prev.findIndex((entry) => entry.id === item.id);
      if (existing >= 0) {
        const nextItems = [...prev];
        nextItems[existing] = item;
        return nextItems;
      }
      return [...prev, item];
    });
    setEditingItem(null);
    setSaveMessage('');
    setPdfGenerated(false);
  };

  const handleDuplicateItem = (itemId) => {
    const itemToDuplicate = cartItems.find((item) => item.id === itemId);
    if (!itemToDuplicate) return;

    const newItem = {
      ...itemToDuplicate,
      id: Date.now().toString(),
    };

    setCartItems((prev) => [...prev, newItem]);
    setSaveMessage('');
    setPdfGenerated(false);
  };

  const handleEditItem = (itemId) => {
    const itemToEdit = cartItems.find((item) => item.id === itemId);
    setEditingItem(itemToEdit || null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRemoveFromCart = (itemId) => {
    setCartItems((prev) => prev.filter((item) => item.id !== itemId));
    setSaveMessage('');
    setPdfGenerated(false);
  };

  const handleUpdateQuantity = (itemId, newQty) => {
    setCartItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, quantity: newQty } : item))
    );
    setSaveMessage('');
    setPdfGenerated(false);
  };

  const handleGoBack = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const handleReorderItems = (nextItems) => {
    setCartItems(nextItems);
    setSaveMessage('');
    setPdfGenerated(false);
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
        currentStep: origin === 'pdf' ? 3 : currentStep,
      });

      setActiveQuoteId(savedQuote.id);

      if (origin === 'pdf') {
        setSaveMessage(
          activeQuoteId
            ? 'PDF genere et devis mis a jour automatiquement.'
            : 'PDF genere et devis enregistre automatiquement dans "Mes devis".'
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
    if (firebaseConfigured && user && canSaveCloudQuote) {
      await persistQuoteToCloud({ origin: 'pdf' });
    }

    await generateQuotePDF(clientData, cartItems, tvaRate, quoteSettings);
    setPdfGenerated(true);
  };

  const headerActions = (
    <div className="flex items-center gap-2">
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

      {currentStep === 1 && <ClientForm onNext={handleClientNext} initialData={clientData} />}

      {currentStep === 2 && (
        <>
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
              <div className="min-w-0 lg:sticky lg:top-8">
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

      {currentStep === 3 && (
        <QuoteSummary
          clientData={clientData}
          cartItems={cartItems}
          tvaRate={tvaRate}
          setTvaRate={setTvaRate}
          quoteSettings={quoteSettings}
          setQuoteSettings={setQuoteSettings}
          onGoBack={() => setCurrentStep(2)}
          onUpdateItem={handleAddToCart}
          onGeneratePdf={() => void handleGeneratePdf()}
          onDownloadAgain={() => void handleGeneratePdf()}
          pdfGenerated={pdfGenerated}
        />
      )}
    </AppShell>
  );
}




