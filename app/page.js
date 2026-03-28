'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import ClientForm from '@/components/ClientForm';
import ProductSelector from '@/components/ProductSelector';
import Cart from '@/components/Cart';
import QuoteSummary from '@/components/QuoteSummary';
import { generateQuotePDF } from '@/lib/pdf-generator';
import {
  User,
  ShoppingCart,
  FileText,
  FileDown,
  ArrowLeft,
  Menu,
} from 'lucide-react';

const STEPS = [
  { number: 1, label: 'Client', icon: User },
  { number: 2, label: 'Produits', icon: ShoppingCart },
  { number: 3, label: 'Récapitulatif', icon: FileText },
  { number: 4, label: 'PDF', icon: FileDown },
];

export default function Home() {
  const [currentStep, setCurrentStep] = useState(1);
  const [clientData, setClientData] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const [tvaRate, setTvaRate] = useState(10); // Default TVA 10%
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Step 1: Client form submission
  const handleClientNext = (data) => {
    setClientData(data);
    setCurrentStep(2);
  };

  // Step 2: Cart management
  const handleAddToCart = (item) => {
    setCartItems((prev) => {
      const existing = prev.findIndex(i => i.id === item.id);
      if (existing >= 0) {
        const copy = [...prev];
        copy[existing] = item;
        return copy;
      }
      return [...prev, item];
    });
    setEditingItem(null);
  };

  const handleDuplicateItem = (itemId) => {
    const itemToDuplicate = cartItems.find(i => i.id === itemId);
    if (itemToDuplicate) {
      const newItem = {
        ...itemToDuplicate,
        id: Date.now().toString(),
      };
      setCartItems((prev) => [...prev, newItem]);
    }
  };

  const handleEditItem = (itemId) => {
    const itemToEdit = cartItems.find(i => i.id === itemId);
    setEditingItem(itemToEdit || null);
    // Smooth scroll to top for mobile
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRemoveFromCart = (itemId) => {
    setCartItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleUpdateQuantity = (itemId, newQty) => {
    setCartItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, quantity: newQty } : item
      )
    );
  };

  const handleCartNext = () => {
    setCurrentStep(3);
  };

  const handleGoBack = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  return (
    <div className="min-h-screen relative bg-slate-50">
      {/* Mobile Top Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-40 flex items-center justify-between px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center shrink-0">
            <span className="text-white font-black text-sm">
              S<span className="text-orange-500">.</span>
            </span>
          </div>
          <span className="font-bold text-slate-900 text-lg">Devis Sarange</span>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 -mr-2 text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg focus:outline-none transition-colors"
        >
          <Menu size={24} />
        </button>
      </div>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="lg:pl-64 min-h-screen pt-16 lg:pt-0">
        <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                Nouveau Devis
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Créez un devis professionnel en quelques étapes
              </p>
            </div>
            {currentStep > 1 && (
              <button
                onClick={handleGoBack}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition-all"
              >
                <ArrowLeft size={14} />
                Retour
              </button>
            )}
          </div>

          {/* Step Indicator */}
          <div className="flex items-center gap-2 mb-8 max-w-3xl mx-auto">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const isActive = step.number === currentStep;
              const isCompleted = step.number < currentStep;
              return (
                <div key={step.number} className="flex items-center gap-2">
                  <div
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
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
                  {i < STEPS.length - 1 && (
                    <div
                      className={`w-6 h-px ${
                        isCompleted ? 'bg-green-300' : 'bg-slate-200'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Step Content */}
          {currentStep === 1 && (
            <ClientForm onNext={handleClientNext} />
          )}

          {currentStep === 2 && (
            <div className="grid lg:grid-cols-5 gap-8 max-w-6xl mx-auto">
              {/* Product Selector - 3 cols */}
              <div className="lg:col-span-3">
                <ProductSelector 
                  onAddToCart={handleAddToCart} 
                  cartItems={cartItems} 
                  editingItem={editingItem}
                  onCancelEdit={() => setEditingItem(null)}
                />
              </div>

              {/* Cart - 2 cols */}
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
                    onNext={handleCartNext}
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
              onNext={() => {
                setCurrentStep(4);
                void generateQuotePDF(clientData, cartItems, tvaRate);
              }} 
            />
          )}

          {currentStep === 4 && (
            <div className="max-w-3xl mx-auto text-center py-20 animate-in zoom-in duration-500">
              <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-500/20">
                <FileDown size={48} />
              </div>
              <h3 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">C&apos;est prêt !</h3>
              <p className="text-slate-500 text-lg mb-10 max-w-md mx-auto">
                Votre devis professionnel a été généré avec toutes les mentions légales et CGV. 
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => void generateQuotePDF(clientData, cartItems, tvaRate)}
                  className="w-full sm:w-auto flex items-center justify-center gap-3 px-10 py-4 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-full transition-all duration-300 shadow-xl shadow-orange-500/40 hover:-translate-y-1"
                >
                  <FileDown size={20} />
                  Télécharger à nouveau
                </button>
                <button
                  onClick={() => {
                    setCartItems([]);
                    setCurrentStep(1);
                  }}
                  className="w-full sm:w-auto px-10 py-4 text-slate-600 font-bold bg-white border-2 border-slate-100 rounded-full hover:bg-slate-50 transition-all"
                >
                  Nouveau devis
                </button>
              </div>

              <button
                onClick={() => setCurrentStep(3)}
                className="mt-12 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
              >
                ← Retour au récapitulatif
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
