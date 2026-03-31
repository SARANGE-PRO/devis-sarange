'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ClientForm from '@/components/ClientForm';
import ProductSelector from '@/components/ProductSelector';
import Cart from '@/components/Cart';
import QuoteSummary from '@/components/QuoteSummary';
import AppShell from '@/components/AppShell';
import QuoteCloudPanel from '@/components/QuoteCloudPanel';
import { useFirebaseAuth } from '@/components/FirebaseProvider';
import { generateQuotePDF } from '@/lib/pdf-generator';
import { getQuoteById, saveQuoteDraft } from '@/lib/firebase/quotes';
import {
  ArrowLeft,
  FileDown,
  FileText,
  ShoppingCart,
  User,
} from 'lucide-react';

const STEPS = [
  { number: 1, label: 'Client', icon: User },
  { number: 2, label: 'Produits', icon: ShoppingCart },
  { number: 3, label: 'Recapitulatif', icon: FileText },
  { number: 4, label: 'PDF', icon: FileDown },
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
  const [editingItem, setEditingItem] = useState(null);
  const [activeQuoteId, setActiveQuoteId] = useState(null);
  const [quoteTitle, setQuoteTitle] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [isSavingQuote, setIsSavingQuote] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [quoteLoadError, setQuoteLoadError] = useState('');

  const requestedQuoteId = searchParams.get('quote');
  const canSaveCloudQuote = Boolean(clientData && cartItems.length > 0);

  const resetQuoteState = () => {
    setCurrentStep(1);
    setClientData(null);
    setCartItems([]);
    setTvaRate(DEFAULT_TVA_RATE);
    setEditingItem(null);
    setActiveQuoteId(null);
    setQuoteTitle('');
    setLastSavedAt(null);
    setSaveMessage('');
    setSaveError('');
    setQuoteLoadError('');
    router.replace('/');
  };

  const applySavedQuote = (quote) => {
    const payload = quote?.payload || {};

    setClientData(payload.clientData || null);
    setCartItems(Array.isArray(payload.cartItems) ? payload.cartItems : []);
    setTvaRate(
      Number.isFinite(Number(payload.tvaRate)) ? Number(payload.tvaRate) : DEFAULT_TVA_RATE
    );
    setCurrentStep(
      Number.isFinite(Number(payload.currentStep)) ? Number(payload.currentStep) : 2
    );
    setEditingItem(null);
    setActiveQuoteId(quote.id);
    setQuoteTitle(quote.title || '');
    setLastSavedAt(
      typeof quote.updatedAt?.toDate === 'function' ? quote.updatedAt.toDate() : quote.updatedAt
    );
    setSaveMessage('');
    setSaveError('');
    setQuoteLoadError('');
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
  };

  const handleEditItem = (itemId) => {
    const itemToEdit = cartItems.find((item) => item.id === itemId);
    setEditingItem(itemToEdit || null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRemoveFromCart = (itemId) => {
    setCartItems((prev) => prev.filter((item) => item.id !== itemId));
    setSaveMessage('');
  };

  const handleUpdateQuantity = (itemId, newQty) => {
    setCartItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, quantity: newQty } : item))
    );
    setSaveMessage('');
  };

  const handleGoBack = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const handleSaveQuote = async () => {
    if (!firebaseConfigured) {
      setSaveError("Firebase n'est pas encore configure dans ce projet.");
      return;
    }

    if (!user) {
      setSaveError('Connectez-vous dans "Mes devis" avant d’enregistrer votre devis.');
      return;
    }

    if (!canSaveCloudQuote) {
      setSaveError('Ajoutez au moins un article et renseignez le client avant d’enregistrer.');
      return;
    }

    setIsSavingQuote(true);
    setSaveError('');
    setSaveMessage('');

    try {
      const savedQuote = await saveQuoteDraft({
        userId: user.uid,
        quoteId: activeQuoteId,
        title: quoteTitle,
        clientData,
        cartItems,
        tvaRate,
        currentStep,
      });

      setActiveQuoteId(savedQuote.id);
      setQuoteTitle(savedQuote.title || quoteTitle);
      setLastSavedAt(
        typeof savedQuote.updatedAt?.toDate === 'function'
          ? savedQuote.updatedAt.toDate()
          : savedQuote.updatedAt
      );
      setSaveMessage(
        activeQuoteId ? 'Devis cloud mis a jour.' : 'Devis enregistre dans "Mes devis".'
      );
      router.replace(`/?quote=${savedQuote.id}`);
    } catch (error) {
      setSaveError(error.message || 'Impossible d’enregistrer ce devis.');
    } finally {
      setIsSavingQuote(false);
    }
  };

  const backButton =
    currentStep > 1 ? (
      <button
        onClick={handleGoBack}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-700"
      >
        <ArrowLeft size={14} />
        Retour
      </button>
    ) : null;

  return (
    <AppShell
      title="Nouveau Devis"
      subtitle="Creez un devis professionnel, sauvegarde localement et dans votre espace cloud."
      actions={backButton}
    >
      {(currentStep > 1 || clientData || cartItems.length > 0 || activeQuoteId || quoteLoadError) && (
        <div className="mx-auto mb-8 max-w-6xl">
          <QuoteCloudPanel
            user={user}
            authInitializing={authInitializing}
            quoteTitle={quoteTitle}
            onQuoteTitleChange={setQuoteTitle}
            onSave={() => void handleSaveQuote()}
            onStartNew={resetQuoteState}
            activeQuoteId={activeQuoteId}
            isSaving={isSavingQuote}
            canSave={canSaveCloudQuote}
            saveMessage={saveMessage}
            saveError={saveError}
            lastSavedAt={lastSavedAt}
            quoteLoadError={quoteLoadError}
          />
        </div>
      )}

      {isLoadingQuote && (
        <div className="mx-auto mb-8 max-w-6xl rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">
          Chargement du devis cloud...
        </div>
      )}

      <div className="mx-auto mb-8 flex max-w-3xl items-center gap-2">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = step.number === currentStep;
          const isCompleted = step.number < currentStep;

          return (
            <div key={step.number} className="flex items-center gap-2">
              <div
                className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all ${
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
                <div className={`h-px w-6 ${isCompleted ? 'bg-green-300' : 'bg-slate-200'}`} />
              )}
            </div>
          );
        })}
      </div>

      {currentStep === 1 && <ClientForm onNext={handleClientNext} initialData={clientData} />}

      {currentStep === 2 && (
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ProductSelector
              onAddToCart={handleAddToCart}
              cartItems={cartItems}
              editingItem={editingItem}
              onCancelEdit={() => setEditingItem(null)}
            />
          </div>

          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-8">
              <Cart
                items={cartItems}
                tvaRate={tvaRate}
                setTvaRate={setTvaRate}
                onRemove={handleRemoveFromCart}
                onDuplicate={handleDuplicateItem}
                onEdit={handleEditItem}
                onUpdateQuantity={handleUpdateQuantity}
                onNext={() => setCurrentStep(3)}
                editingItemId={editingItem?.id}
              />
            </div>
          </div>
        </div>
      )}

      {currentStep === 3 && (
        <QuoteSummary
          clientData={clientData}
          cartItems={cartItems}
          tvaRate={tvaRate}
          setTvaRate={setTvaRate}
          onGoBack={() => setCurrentStep(2)}
          onUpdateItem={handleAddToCart}
          onNext={() => {
            setCurrentStep(4);
            void generateQuotePDF(clientData, cartItems, tvaRate);
          }}
        />
      )}

      {currentStep === 4 && (
        <div className="mx-auto max-w-3xl py-20 text-center animate-in zoom-in duration-500">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-green-100 text-green-600 shadow-xl shadow-green-500/20">
            <FileDown size={48} />
          </div>
          <h3 className="mb-3 text-3xl font-black tracking-tight text-slate-900">
            C&apos;est pret !
          </h3>
          <p className="mx-auto mb-10 max-w-md text-lg text-slate-500">
            Votre devis professionnel a ete genere avec toutes les mentions legales et CGV.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              onClick={() => void generateQuotePDF(clientData, cartItems, tvaRate)}
              className="flex w-full items-center justify-center gap-3 rounded-full bg-orange-500 px-10 py-4 font-black text-white shadow-xl shadow-orange-500/40 transition-all duration-300 hover:-translate-y-1 hover:bg-orange-600 sm:w-auto"
            >
              <FileDown size={20} />
              Telecharger a nouveau
            </button>
            <button
              onClick={resetQuoteState}
              className="w-full rounded-full border-2 border-slate-100 bg-white px-10 py-4 font-bold text-slate-600 transition-all hover:bg-slate-50 sm:w-auto"
            >
              Nouveau devis
            </button>
          </div>

          <button
            onClick={() => setCurrentStep(3)}
            className="mt-12 text-sm font-bold text-slate-400 transition-colors hover:text-slate-600"
          >
            ← Retour au recapitulatif
          </button>
        </div>
      )}
    </AppShell>
  );
}
