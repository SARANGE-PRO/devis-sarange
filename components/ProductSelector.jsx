'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  LayoutGrid,
  ArrowLeftRight,
  DoorOpen,
  DoorClosed,
  Blinds,
  Plus,
  ChevronDown,
  Palette,
  Grid3X3,
  Wrench,
  ShoppingCart,
  Trash2,
  PackagePlus,
  ImagePlus,
  X,
  Pencil,
} from 'lucide-react';
import {
  CATEGORIES,
  COLOR_OPTIONS,
  VOLET_COLOR_OPTIONS,
  getPriceForMm,
  getProductType,
  calculateSurface,
  calculateItemPrice,
} from '@/lib/products';
import {
  GLAZING_OPTIONS,
  getSelectedGlazing,
  getFrameSystemForProduct,
  isGlazedProduct,
  calculateGlassAreas,
  calculateUw,
  calculateSw,
  calculateGlazingExtra,
} from '@/lib/glazing';
import MenuiserieVisual from '@/components/MenuiserieVisual';
import WasteRecycleIcon from '@/components/icons/WasteRecycleIcon';

const ICONS = { LayoutGrid, ArrowLeftRight, DoorOpen, DoorClosed, Blinds, Recycle: WasteRecycleIcon, PackagePlus };

export default function ProductSelector({ onAddToCart, cartItems = [], editingItem, onCancelEdit }) {
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0].id);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [heightMm, setHeightMm] = useState('');
  const [widthMm, setWidthMm] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [colorOption, setColorOption] = useState('blanc');
  const [petitsBois, setPetitsBois] = useState(0);
  const [includePose, setIncludePose] = useState(false);
  const [remise, setRemise] = useState(0);
  const [netMarginWanted, setNetMarginWanted] = useState(0);
  const [panneauDecoratif, setPanneauDecoratif] = useState(false);
  const [hasSousBassement, setHasSousBassement] = useState(false);
  const [sousBassementHeight, setSousBassementHeight] = useState(400);
  const [sashOptions, setSashOptions] = useState({});
  const [openingDirection, setOpeningDirection] = useState('standard');
  const [glazingId, setGlazingId] = useState('dv_4_20_4_argon_we');
  const [hasLockingHandle, setHasLockingHandle] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customImage, setCustomImage] = useState(null);

  // Advanced Color States
  const [bicoType, setBicoType] = useState('standard_7016');
  const [customColorIntText, setCustomColorIntText] = useState('');
  const [customColorExtText, setCustomColorExtText] = useState('');
  const [customColorIntHex, setCustomColorIntHex] = useState('#FFFFFF');
  const [isExtPlaxageBico, setIsExtPlaxageBico] = useState(false);

  const [color2fType, setColor2fType] = useState('standard_7016');
  const [customColor2fText, setCustomColor2fText] = useState('');
  const [customColor2fHex, setCustomColor2fHex] = useState('#4A4A4A');
  const [is2fPlaxage, setIs2fPlaxage] = useState(true);
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);

  const category = CATEGORIES.find((c) => c.id === selectedCategory);
  const product = selectedProduct
    ? category?.products.find((p) => p.id === selectedProduct)
    : null;

  const priceData = useMemo(
    () =>
      product && heightMm && widthMm
        ? getPriceForMm(product.sheet, parseInt(heightMm), parseInt(widthMm))
        : null,
    [product, heightMm, widthMm]
  );

  const unitPrice = priceData ? priceData.price : null;

  // Waste Management Special Logic
  const isWasteManagement = product?.id === 'gestion-dechets';
  const isCustomProduct = product?.id === 'custom-product';
  const totalSurface = useMemo(() => {
    return cartItems.reduce((acc, item) => {
      // Don't include other waste management lines in the calculation to avoid recursion
      if (item.productId === 'gestion-dechets') return acc;
      return acc + calculateSurface(item.widthMm, item.heightMm, item.quantity);
    }, 0);
  }, [cartItems]);

  const estimatedWeight = totalSurface * 40;
  const wastePrice = totalSurface * 4;

  const isVolet = product && product.sheet.startsWith('Volet');
  const isPorte = product && product.sheet.startsWith('Porte Entrée');
  const isGlazed = isGlazedProduct(product) || (isPorte && !panneauDecoratif);
  const colorOptions = isVolet ? VOLET_COLOR_OPTIONS : COLOR_OPTIONS;
  const currentColorOption = colorOptions.find((c) => c.id === colorOption) || colorOptions[0];
  const isColorConfigOption = (optionId) => optionId === 'bicoloration' || optionId === 'coloration-2f';
  const requiresColorConfiguration = isColorConfigOption(colorOption);

  const colorConfigurationSummary = useMemo(() => {
    if (colorOption === 'blanc') return 'Standard';

    if (colorOption === 'bicoloration') {
      if (bicoType === 'standard_7016') return 'Blanc 9016 (Int) / Gris 7016 (Ext)';
      if (bicoType === 'standard_chene') return 'Blanc 9016 (Int) / Chene dore plaxe (Ext)';

      const intText = customColorIntText.trim() || 'Interieur a definir';
      const extPrefix = isExtPlaxageBico ? 'Plaxage ' : '';
      const extText = customColorExtText.trim() || 'Exterieur a definir';
      return `${intText} / ${extPrefix}${extText}`;
    }

    if (colorOption === 'coloration-2f') {
      if (color2fType === 'standard_7016') return 'Gris (7016) 2 faces';
      if (color2fType === 'standard_chene') return 'Chene dore 2 faces';

      const prefix = is2fPlaxage ? 'Plaxage 2 faces' : 'Coloration 2 faces';
      const txt = customColor2fText.trim() || 'Couleur a definir';
      return `${prefix} : ${txt}`;
    }

    return '';
  }, [
    colorOption,
    bicoType,
    customColorIntText,
    isExtPlaxageBico,
    customColorExtText,
    color2fType,
    is2fPlaxage,
    customColor2fText,
  ]);

  // Glazing computed values
  const selectedGlazing = getSelectedGlazing(glazingId);
  const frameSystem = product ? getFrameSystemForProduct(product.sheet) : null;
  const glassAreas = useMemo(() => {
    if (!isGlazed || !heightMm || !widthMm || !frameSystem) return null;
    return calculateGlassAreas(parseInt(widthMm), parseInt(heightMm), frameSystem.frameWidthMm);
  }, [isGlazed, heightMm, widthMm, frameSystem]);

  const thermalUw = useMemo(() => {
    if (!glassAreas || !frameSystem) return null;
    return calculateUw({
      Ag: glassAreas.Ag, Af: glassAreas.Af, Aw: glassAreas.Aw,
      Lg: glassAreas.Lg, Ug: selectedGlazing.ug, Uf: frameSystem.uf,
    });
  }, [glassAreas, frameSystem, selectedGlazing]);

  const thermalSw = useMemo(() => {
    if (!glassAreas) return null;
    return calculateSw({ Ag: glassAreas.Ag, Aw: glassAreas.Aw, g: selectedGlazing.g });
  }, [glassAreas, selectedGlazing]);

  const glazingExtra = useMemo(() => {
    if (!isGlazed || !glassAreas || selectedGlazing.isBaseIncluded) return 0;
    return calculateGlazingExtra({ selectedGlassPricePerM2: selectedGlazing.purchasePricePerM2, Ag: glassAreas.Ag });
  }, [isGlazed, glassAreas, selectedGlazing]);

  const previewItem = useMemo(() => {
    if (!product || !heightMm || !widthMm || !priceData || unitPrice === null) return null;
    return {
      productId: product.id,
      sheetName: product.sheet,
      heightMm: parseInt(heightMm),
      widthMm: parseInt(widthMm),
      quantity,
      unitPrice,
      colorOption: currentColorOption,
      petitsBois: isVolet ? 0 : petitsBois,
      includePose,
      remise,
      netMarginWanted,
      panneauDecoratif: isPorte ? panneauDecoratif : false,
      hasSousBassement: !isVolet && hasSousBassement,
      sousBassementHeight: hasSousBassement ? sousBassementHeight : 0,
      sashOptions: !isVolet ? sashOptions : {},
      glazingExtra: isGlazed ? glazingExtra : 0,
      hasLockingHandle: !isVolet && !isPorte ? hasLockingHandle : false,
    };
  }, [product, heightMm, widthMm, priceData, quantity, unitPrice, currentColorOption, petitsBois, includePose, remise, netMarginWanted, panneauDecoratif, hasSousBassement, sousBassementHeight, sashOptions, glazingExtra, hasLockingHandle, isVolet, isPorte, isGlazed]);

  const previewCalc = previewItem ? calculateItemPrice(previewItem) : null;

  // Hydrate state when editingItem changes
  useEffect(() => {
    if (editingItem) {
      const cat = CATEGORIES.find(c => c.products.some(p => p.id === editingItem.productId));
      if (cat) setSelectedCategory(cat.id);
      setSelectedProduct(editingItem.productId);
      setWidthMm(editingItem.widthMm?.toString() || '');
      setHeightMm(editingItem.heightMm?.toString() || '');
      setQuantity(editingItem.quantity || 1);
      
      if (editingItem.colorOption) {
        setColorOption(editingItem.colorOption.id);
      }
      
      if (editingItem.rawColorState) {
        setBicoType(editingItem.rawColorState.bicoType || 'standard_7016');
        setCustomColorIntText(editingItem.rawColorState.customColorIntText || '');
        setCustomColorExtText(editingItem.rawColorState.customColorExtText || '');
        setCustomColorIntHex(editingItem.rawColorState.customColorIntHex || '#FFFFFF');
        setIsExtPlaxageBico(editingItem.rawColorState.isExtPlaxageBico || false);
        
        setColor2fType(editingItem.rawColorState.color2fType || 'standard_7016');
        setCustomColor2fText(editingItem.rawColorState.customColor2fText || '');
        setCustomColor2fHex(editingItem.rawColorState.customColor2fHex || '#4A4A4A');
        setIs2fPlaxage(editingItem.rawColorState.is2fPlaxage !== undefined ? editingItem.rawColorState.is2fPlaxage : true);
      }
      
      setPetitsBois(editingItem.petitsBois || 0);
      setIncludePose(editingItem.includePose || false);
      setRemise(editingItem.remise || 0);
      setNetMarginWanted(Number(editingItem.netMarginWanted || 0));
      setPanneauDecoratif(editingItem.panneauDecoratif || false);
      setHasSousBassement(editingItem.hasSousBassement || false);
      setSousBassementHeight(editingItem.sousBassementHeight || 400);
      setSashOptions(editingItem.sashOptions || {});
      setOpeningDirection(editingItem.openingDirection || 'standard');
      setHasLockingHandle(editingItem.hasLockingHandle || false);
      
      if (editingItem.glazingOption) {
        setGlazingId(editingItem.glazingOption.id);
      }
      
      if (editingItem.productId === 'custom-product') {
        setCustomLabel(editingItem.productLabel || '');
        setCustomDescription(editingItem.customDescription || '');
        setCustomPrice(editingItem.customPrice?.toString() || '');
        setCustomImage(editingItem.customImage || null);
      }
    }
  }, [editingItem]);

  useEffect(() => {
    if (!isColorModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIsColorModalOpen(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isColorModalOpen]);

  const handleColorOptionSelect = (nextOptionId) => {
    setColorOption(nextOptionId);
    setIsColorModalOpen(isColorConfigOption(nextOptionId));
  };

  const handleCategoryChange = (catId) => {
    setSelectedCategory(catId);
    setSelectedProduct(null);
    setHeightMm('');
    setWidthMm('');
    setQuantity(1);
    setColorOption('blanc');
    setPetitsBois(0);
    setIncludePose(false);
    setRemise(0);
    setNetMarginWanted(0);
    setPanneauDecoratif(false);
    setOpeningDirection('standard');
    setGlazingId('dv_4_20_4_argon_we');

    // Reset colors
    setBicoType('standard_7016');
    setCustomColorIntText('');
    setCustomColorExtText('');
    setCustomColorIntHex('#FFFFFF');
    setIsExtPlaxageBico(false);
    setColor2fType('standard_7016');
    setCustomColor2fText('');
    setCustomColor2fHex('#4A4A4A');
    setIs2fPlaxage(true);
    setIsColorModalOpen(false);
  };

  const handleProductChange = (prodId) => {
    setSelectedProduct(prodId);
    setHeightMm('');
    setWidthMm('');
    setQuantity(1);
    setColorOption('blanc');
    setPetitsBois(0);
    setIncludePose(false);
    setRemise(0);
    setNetMarginWanted(0);
    setPanneauDecoratif(false);
    setOpeningDirection('standard');
    setGlazingId('dv_4_20_4_argon_we');

    // Reset colors
    setBicoType('standard_7016');
    setCustomColorIntText('');
    setCustomColorExtText('');
    setCustomColorIntHex('#FFFFFF');
    setIsExtPlaxageBico(false);
    setColor2fType('standard_7016');
    setCustomColor2fText('');
    setCustomColor2fHex('#4A4A4A');
    setIs2fPlaxage(true);
    setIsColorModalOpen(false);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleSashOption = (index, option) => {
    setSashOptions(prev => {
      const current = prev[index] || {};
      return {
        ...prev,
        [index]: {
          ...current,
          [option]: !current[option]
        }
      };
    });
  };

  // Marketing Designation logic
  const getMarketingDesignationText = () => {
    let baseText = "";
    if (isGlazed) {
      if (product?.sheet?.includes('Coulissant')) {
        baseText = "Profilés PVC Schüco\n5 chambres d'isolation avec renforts en acier galvanisé\nSystème à double joint d’étanchéité";
      } else {
        baseText = "Profilés PVC Schüco 70mm\n5 chambres d'isolation avec renforts en acier galvanisé\nSystème à double joint d’étanchéité";
      }
      
      if (!isPorte && !isVolet) {
        if (hasLockingHandle) {
          baseText += "\nPoignée Schüco Euro Verrouillable à clé";
        } else {
          baseText += "\nPoignée Schüco Euro";
        }
      }
    }

    let finitionText = "";
    let finalSvgColor = "#FFFFFF";

    if (isVolet) {
      if (colorOption === 'blanc') {
        finitionText = "Finition : Blanc";
        finalSvgColor = "#FFFFFF";
      } else if (colorOption === 'coloration-2f') {
        if (color2fType === 'standard_7016') {
          finitionText = "Finition : Gris Anthracite RAL 7016";
          finalSvgColor = "#4A4A4A";
        } else if (color2fType === 'standard_chene') {
          finitionText = "Finition : Chêne doré";
          finalSvgColor = "#8B5A2B";
        } else {
          const txt = customColor2fText || "Non défini";
          finitionText = `Finition : ${txt}`;
          finalSvgColor = customColor2fHex;
        }
      }
    } else {
      if (colorOption === 'blanc') {
        finitionText = "Finition Blanc (Traitement exclusif anti-UV et anti-jaunissement)";
        finalSvgColor = "#FFFFFF";
      } else if (colorOption === 'bicoloration') {
        if (bicoType === 'standard_7016') {
          finitionText = "Bicoloration : Intérieur Blanc (Anti-UV) / Extérieur Gris 7016";
          finalSvgColor = "#FFFFFF";
        } else if (bicoType === 'standard_chene') {
          finitionText = "Bicoloration : Intérieur Blanc (Anti-UV) / Extérieur Plaxage Haute Résistance Chêne doré";
          finalSvgColor = "#FFFFFF";
        } else {
          const isWhiteInt = customColorIntText.toLowerCase().includes('blanc') || customColorIntText.trim() === '';
          const intText = isWhiteInt ? "Blanc (Anti-UV)" : (customColorIntText || "Non défini");
          const extPrefix = isExtPlaxageBico ? "Plaxage Haute Résistance " : "";
          const extText = customColorExtText || "Non défini";
          finitionText = `Bicoloration : Intérieur ${intText} / Extérieur ${extPrefix}${extText}`;
          finalSvgColor = isWhiteInt ? "#FFFFFF" : customColorIntHex;
        }
      } else if (colorOption === 'coloration-2f') {
        if (color2fType === 'standard_7016') {
          finitionText = "Finition Plaxage Haute Résistance 2 faces : Gris 7016";
          finalSvgColor = "#4A4A4A";
        } else if (color2fType === 'standard_chene') {
          finitionText = "Finition Plaxage Haute Résistance 2 faces : Chêne doré";
          finalSvgColor = "#8B5A2B";
        } else {
          const prefix = is2fPlaxage ? "Plaxage Haute Résistance 2 faces : " : "Coloration 2 faces : ";
          const txt = customColor2fText || "Non défini";
          finitionText = `Finition ${prefix}${txt}`;
          finalSvgColor = customColor2fHex;
        }
      }
    }

    return { marketingBase: baseText, marketingFinition: finitionText, svgColor: finalSvgColor };
  };

  const handleAddToCart = () => {
    if (!product) return;
    if (isCustomProduct && (!customLabel || !customPrice)) return;
    if (!isWasteManagement && !isCustomProduct && (!heightMm || !widthMm || !unitPrice || !priceData)) return;

    const { marketingBase, marketingFinition, svgColor } = getMarketingDesignationText();
    const itemId = editingItem ? editingItem.id : Date.now().toString();

    // Raw color state to allow exact reproduction if edited again
    const rawColorState = {
      bicoType, customColorIntText, customColorExtText, customColorIntHex, isExtPlaxageBico,
      color2fType, customColor2fText, customColor2fHex, is2fPlaxage
    };

    let item;
    if (isWasteManagement) {
      item = {
        id: itemId,
        productId: product.id,
        productLabel: product.label,
        sheetName: product.sheet,
        totalSurface,
        quantity: 1,
        unitPrice: wastePrice,
        includePose: false,
        remise: 0,
        netMarginWanted: 0,
      };
    } else if (isCustomProduct) {
      item = {
        id: itemId,
        productId: product.id,
        productLabel: customLabel,
        customDescription,
        customPrice: parseFloat(customPrice),
        customImage,
        quantity,
        unitPrice: parseFloat(customPrice),
        includePose: false, // Custom products generally don't use the standard pose grid
        remise: 0,
        netMarginWanted: 0,
      };
    } else {
      item = {
        id: itemId,
        productId: product.id,
        productLabel: product.label,
        sheetName: product.sheet,
        heightMm: parseInt(heightMm),
        widthMm: parseInt(widthMm),
        billedHeightCm: priceData.billedHeight,
        billedWidthCm: priceData.billedWidth,
        quantity,
        unitPrice,
        colorOption: currentColorOption,
        petitsBois: isVolet ? 0 : petitsBois,
        includePose,
        remise,
        netMarginWanted,
        panneauDecoratif: isPorte ? panneauDecoratif : false,
        hasSousBassement: !isVolet && hasSousBassement,
        sousBassementHeight: hasSousBassement ? sousBassementHeight : 0,
        sashOptions: !isVolet ? sashOptions : {},
        openingDirection: !isVolet ? openingDirection : 'standard',
        // Glazing data (only for glazed products)
        glazingOption: isGlazed ? selectedGlazing : null,
        glazingExtra: isGlazed ? glazingExtra : 0,
        thermalUw: isGlazed ? thermalUw : null,
        thermalSw: isGlazed ? thermalSw : null,
        // Schüco marketing designation
        marketingBase,
        marketingFinition,
        svgColor,
        hasLockingHandle: !isVolet && !isPorte ? hasLockingHandle : false,
        rawColorState,
      };
    }

    onAddToCart(item);

    // Reset selections
    setHeightMm('');
    setWidthMm('');
    setQuantity(1);
    setColorOption('blanc');
    setPetitsBois(0);
    setIncludePose(false);
    setRemise(0);
    setNetMarginWanted(0);
    setPanneauDecoratif(false);
    setHasSousBassement(false);
    setSashOptions({});
    setOpeningDirection('standard');
    setGlazingId('dv_4_20_4_argon_we');
    setIsColorModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {editingItem && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <Pencil size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-blue-900">Mode Édition</p>
              <p className="text-xs text-blue-700">Vous modifiez actuellement <strong>{editingItem.productLabel}</strong>. Validez pour enregistrer sur cette ligne de devis.</p>
            </div>
          </div>
          <button onClick={onCancelEdit} className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 pb-1">
        {CATEGORIES.map((cat) => {
          const Icon = ICONS[cat.icon];
          return (
            <button
              key={cat.id}
              onClick={() => handleCategoryChange(cat.id)}
              className={`flex items-center gap-2.5 px-5 py-3 sm:px-6 sm:py-3.5 rounded-xl text-base sm:text-sm font-bold transition-all duration-200 ${selectedCategory === cat.id
                  ? 'bg-slate-900 text-white shadow-lg ring-2 ring-slate-900/10'
                  : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50 hover:text-slate-900 shadow-sm'
                }`}
            >
              {Icon && <Icon size={18} />}
              <span className="whitespace-nowrap">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Product Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        {/* Product Type Selection */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
          <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
            Sélectionnez un modèle
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {category?.products.map((prod) => (
              <button
                key={prod.id}
                onClick={() => handleProductChange(prod.id)}
                className={`p-3 sm:p-4 rounded-2xl text-base sm:text-sm transition-all duration-200 border-2 text-center flex flex-col items-center justify-between min-h-[7rem] sm:min-h-[8rem] group ${selectedProduct === prod.id
                    ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-md shadow-orange-500/20 ring-2 ring-orange-500/10 font-black'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 shadow-sm hover:shadow-md font-bold'
                  }`}
              >
                {!prod.id.includes('gestion-dechets') && !prod.id.includes('custom') && (
                  <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 pointer-events-none mb-3 opacity-90 transition-transform duration-300 group-hover:scale-105">
                    <MenuiserieVisual 
                      sheetName={prod.sheet}
                      width={prod.sheet?.includes('Porte Entrée') ? 900 : 1200}
                      height={prod.sheet?.includes('Porte Entrée') ? 2150 : 1250}
                      options={{ 
                        colorOption: { id: 'blanc' },
                        productId: prod.id,
                      }}
                      className="w-full h-full"
                    />
                  </div>
                )}
                <span className="leading-tight">{prod.shortLabel}</span>
              </button>
            ))}
          </div>
          {product && (
            <div className="mt-5 p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <p className="text-sm font-semibold text-slate-700">
                <span className="text-slate-400 font-normal mr-1">Sélection :</span> 
                {product.label}
              </p>
            </div>
          )}
        </div>

        {/* Visual Preview */}
        {product && !isWasteManagement && !isCustomProduct && (
          <div className="px-6 pt-6 -mb-2">
            <MenuiserieVisual
              sheetName={product.sheet}
              width={widthMm || 1200}
              height={heightMm || 1250}
              /* Pass svgColor to options so that MenuiserieVisual can use it */
              options={{
                colorOption: currentColorOption,
                panneauDecoratif: isPorte ? panneauDecoratif : false,
                hasSousBassement: !isVolet && hasSousBassement,
                sousBassementHeight: sousBassementHeight,
                sashOptions: sashOptions,
                openingDirection: !isVolet ? openingDirection : 'standard',
                productId: product?.id,
                svgColor: getMarketingDesignationText().svgColor
              }}
              className="h-64 sm:h-80"
            />
          </div>
        )}

        {isWasteManagement && (
          <div className="p-8 text-center flex flex-col items-center">
            <div className="p-6 bg-green-50 rounded-full mb-4">
              <WasteRecycleIcon size={64} className="text-green-600 animate-spin-slow" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Service Environnemental</h3>
            <p className="text-sm text-slate-500 max-w-sm">
              Calcul automatique basé sur la surface totale des menuiseries du devis
              (40 kg/m² et 0,10 €/kg).
            </p>
          </div>
        )}

        {isCustomProduct && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Product Info */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nom du produit / Label</label>
                  <input
                    type="text"
                    placeholder="Ex: Porte de garage motorisée"
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm outline-none transition-all duration-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description détaillée</label>
                  <textarea
                    rows={3}
                    placeholder="Ex: Modèle Excellence, coloris Gris Anthracite, dimensions sur mesure..."
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm outline-none transition-all duration-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Prix Unitaire HT (€)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={customPrice}
                      onChange={(e) => setCustomPrice(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm outline-none transition-all duration-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Quantité</label>
                    <input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm outline-none transition-all duration-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    />
                  </div>
                </div>
              </div>

              {/* Image Upload */}
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-6 bg-slate-50 hover:bg-slate-100 transition-all group relative overflow-hidden">
                {customImage ? (
                  <div className="relative w-full h-48 sm:h-64">
                    <img src={customImage} alt="Custom product" className="w-full h-full object-contain rounded-lg shadow-md" />
                    <button
                      onClick={() => setCustomImage(null)}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center gap-3 cursor-pointer">
                    <div className="p-4 bg-white rounded-full shadow-sm text-slate-400 group-hover:text-orange-500 transition-colors">
                      <ImagePlus size={32} />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-slate-700">Ajouter une photo</p>
                      <p className="text-xs text-slate-400 mt-1">PNG, JPG jusqu&apos;à 2 Mo</p>
                    </div>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>
                )}
              </div>
            </div>

            {customPrice && (
              <div className="mt-6 p-4 bg-orange-50 rounded-xl border border-orange-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-orange-600 uppercase tracking-wide">Total HT pour cet article</p>
                  <p className="text-2xl font-black text-slate-900 tracking-tight">
                    {(parseFloat(customPrice || 0) * quantity).toFixed(2)} €
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dimensions */}
        {product && !isWasteManagement && !isCustomProduct && (
          <div className="p-6 border-b border-slate-100">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              Dimensions au millimètre
            </label>
            <div className="grid grid-cols-2 gap-4">
              {/* Width (Largeur first) */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Largeur (mm)
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder="Ex: 1200"
                  value={widthMm}
                  onChange={(e) => setWidthMm(e.target.value)}
                  className="w-full px-4 py-4 sm:py-3.5 rounded-xl border border-slate-200 bg-white text-base sm:text-sm font-semibold outline-none transition-all duration-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 hover:border-slate-300"
                />
              </div>

              {/* Height (Hauteur second) */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Hauteur (mm)
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder="Ex: 1250"
                  value={heightMm}
                  onChange={(e) => setHeightMm(e.target.value)}
                  className="w-full px-4 py-4 sm:py-3.5 rounded-xl border border-slate-200 bg-white text-base sm:text-sm font-semibold outline-none transition-all duration-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 hover:border-slate-300"
                />
              </div>
            </div>

            {/* Error or Price Display */}
            {heightMm && widthMm && !priceData && (
              <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-100">
                <p className="text-sm font-semibold text-red-600">
                  Dimensions hors abaque (hors catalogue).
                </p>
              </div>
            )}

            {previewCalc && (
              <div className="mt-4 p-4 bg-orange-50 rounded-xl border border-orange-100 flex items-center justify-between shadow-sm">
                <div>
                  <p className="text-xs font-bold text-orange-600 uppercase tracking-wide">
                    Total HT avec options associées
                  </p>
                  <p className="text-2xl font-black text-slate-900 tracking-tight">
                    {(previewCalc.totalLine + (includePose ? previewCalc.posePrice * quantity : 0)).toFixed(2)} €
                  </p>
                  {includePose && (
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                      (dont Pose {(previewCalc.posePrice * quantity).toFixed(2)} €)
                    </p>
                  )}
                </div>
                <div className="text-right flex flex-col justify-center items-end gap-1.5 h-full">
                  <p className="text-sm font-bold text-slate-700 bg-white px-3 py-1.5 rounded-lg shadow-sm border border-orange-100">
                    L {widthMm} × H {heightMm} mm
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mr-1">Qté : {quantity}</p>
                </div>
              </div>
            )}

            {/* Thermal Performance Badges */}
            {unitPrice !== null && isGlazed && thermalUw !== null && thermalSw !== null && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs font-bold text-blue-700">
                  🌡️ Uw = {thermalUw} W/m²K
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-lg text-xs font-bold text-amber-700">
                  ☀️ Sw = {thermalSw}
                </span>
                {glazingExtra > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-100 rounded-lg text-xs font-bold text-purple-700">
                    Vitrage : +{glazingExtra.toFixed(2)} € HT
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {isWasteManagement && (
          <div className="p-6 border-b border-slate-100 bg-slate-50">
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Surface Totale</p>
                <p className="text-lg font-black text-slate-900">{totalSurface.toFixed(2)} m²</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Poids Estimé</p>
                <p className="text-lg font-black text-slate-900">{estimatedWeight.toFixed(0)} kg</p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-green-50 rounded-xl border border-green-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-green-600 uppercase tracking-wide">Prix du Service HT</p>
                <p className="text-2xl font-black text-slate-900 tracking-tight">
                  {wastePrice.toFixed(2)} €
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-white bg-green-500 px-3 py-1 rounded-full">Automatique</span>
              </div>
            </div>
          </div>
        )}

        {/* Options */}
        {product && !isWasteManagement && !isCustomProduct && unitPrice !== null && (
          <div className="p-6 border-b border-slate-100 space-y-5">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
              Options
            </label>

            {/* Sens d'ouverture / Poignée / Petits Bois  (options display intact) */}
            {!isVolet && !product.sheet.includes('Fixe') && (
              <div className="space-y-3 pb-2">
                <label className="block text-sm font-semibold text-slate-700">
                  Sens d&apos;ouverture du vantail principal
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <label className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all ${openingDirection === 'standard' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}>
                    <input type="radio" value="standard" checked={openingDirection === 'standard'} onChange={(e) => setOpeningDirection(e.target.value)} className="hidden" />
                    <span className="text-base sm:text-sm font-bold">Standard</span>
                  </label>
                  <label className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all ${openingDirection === 'inverse' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}>
                    <input type="radio" value="inverse" checked={openingDirection === 'inverse'} onChange={(e) => setOpeningDirection(e.target.value)} className="hidden" />
                    <span className="text-base sm:text-sm font-bold">Inversé</span>
                  </label>
                </div>
              </div>
            )}

            {/* Glazing Options (only for glazed products, not volets/portes) */}
            {isGlazed && (
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2">
                  🔶 Vitrage
                </label>
                <div className="space-y-3">
                  {GLAZING_OPTIONS.map((glz) => {
                    const extra = glz.isBaseIncluded ? 0 : (glassAreas ? calculateGlazingExtra({ selectedGlassPricePerM2: glz.purchasePricePerM2, Ag: glassAreas.Ag }) : null);
                    return (
                      <label
                        key={glz.id}
                        className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${glazingId === glz.id
                            ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-500/10'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                      >
                        <input
                          type="radio"
                          name="glazing"
                          value={glz.id}
                          checked={glazingId === glz.id}
                          onChange={(e) => setGlazingId(e.target.value)}
                          className="w-5 h-5 accent-orange-500 shrink-0 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-base sm:text-sm font-bold text-slate-800 block">
                            {glz.shortLabel}
                          </span>
                          <span className="text-sm text-slate-500">
                            Ug={glz.ug} · g={glz.g}
                            {glz.isBaseIncluded && ' · Inclus'}
                            {!glz.isBaseIncluded && extra !== null && ` · +${extra.toFixed(2)} €`}
                          </span>
                        </div>
                        {glz.isBaseIncluded && (
                          <span className="text-xs font-bold text-green-700 bg-green-100 px-3 py-1 rounded-full shrink-0">Inclus</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Quantité
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-14 h-14 sm:w-12 sm:h-12 rounded-xl border-2 border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors text-xl font-bold"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24 sm:w-20 text-center px-2 py-3.5 sm:py-3 rounded-xl border-2 border-slate-200 text-lg sm:text-base font-black outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                />
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-14 h-14 sm:w-12 sm:h-12 rounded-xl border-2 border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors text-xl font-bold"
                >
                  +
                </button>
              </div>
            </div>

            {/* Color Options */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2">
                <Palette size={14} className="text-slate-400" />
                Coloration
              </label>
              <div className="grid grid-cols-1 gap-3">
                {colorOptions.map((opt) => {
                  const isActive = colorOption === opt.id;
                  const canConfigure = isColorConfigOption(opt.id);

                  return (
                    <div
                      key={`clean-${opt.id}`}
                      className={`rounded-xl border-2 transition-all ${isActive
                        ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-500/10'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                    >
                      <label className="flex items-start gap-4 p-4 cursor-pointer">
                        <input
                          type="radio"
                          name="color"
                          value={opt.id}
                          checked={isActive}
                          onChange={(e) => handleColorOptionSelect(e.target.value)}
                          className="w-5 h-5 mt-0.5 accent-orange-500 cursor-pointer shrink-0"
                        />
                        <div className="flex-1">
                          <span className="text-base sm:text-sm font-bold text-slate-800 block">
                            {opt.label}
                          </span>
                          <span className="text-sm text-slate-500 leading-snug mt-1 block">
                            {opt.description}
                          </span>
                        </div>
                      </label>

                      {isActive && (
                        <div className="px-4 pb-4">
                          <p className="text-xs font-semibold text-slate-500">
                            Configuration: <span className="text-slate-700">{colorConfigurationSummary}</span>
                          </p>

                          {canConfigure && (
                            <button
                              type="button"
                              onClick={() => setIsColorModalOpen(true)}
                              className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-orange-700 bg-orange-100 hover:bg-orange-200 transition-colors"
                            >
                              Configurer la coloration
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Petits Bois (not for volets) */}
            {!isVolet && (
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-1.5">
                  <Grid3X3 size={14} className="text-slate-400" />
                  Petits bois (nombre de carrés)
                </label>
                <input
                  type="number"
                  min={0}
                  value={petitsBois}
                  onChange={(e) => setPetitsBois(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-32 px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                />
                <p className="text-xs text-slate-400 mt-1">+30 € par carré après remise</p>
              </div>
            )}

            {/* Panneau Décoratif (Only for Portes) */}
            {isPorte && (
              <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:border-slate-300 transition-all">
                <input
                  type="checkbox"
                  checked={panneauDecoratif}
                  onChange={(e) => setPanneauDecoratif(e.target.checked)}
                  className="accent-orange-500 w-4 h-4"
                />
                <div className="flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                    ✨ Panneau décoratif
                  </span>
                  <span className="text-xs text-slate-400">
                    +850 € HT après remise
                  </span>
                </div>
              </label>
            )}

            {/* Locking Handle (Toutes les menuiseries sauf Portes et Volets) */}
            {!isVolet && !isPorte && (
              <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:border-slate-300 transition-all">
                <input
                  type="checkbox"
                  checked={hasLockingHandle}
                  onChange={(e) => setHasLockingHandle(e.target.checked)}
                  className="accent-orange-500 w-4 h-4"
                />
                <div className="flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                    🔐 Poignée Schüco Euro Verrouillable à clé
                  </span>
                  <span className="text-xs text-slate-400">
                    +18.75 € HT pièce avant remise
                  </span>
                </div>
              </label>
            )}

            {/* Sous-bassement (not for volets) */}
            {!isVolet && (
              <div className="space-y-3 p-3 rounded-xl border border-slate-200">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasSousBassement}
                    onChange={(e) => setHasSousBassement(e.target.checked)}
                    className="accent-orange-500 w-4 h-4"
                  />
                  <div className="flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                      🧱 Sous-bassement
                    </span>
                    <span className="text-xs text-slate-400">
                      +10 € HT après remise
                    </span>
                  </div>
                </label>

                {hasSousBassement && (
                  <div className="pl-7 space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                      <span>Hauteur : {sousBassementHeight} mm</span>
                    </div>
                    <input
                      type="range"
                      min={100}
                      max={Math.max(100, parseInt(heightMm) - 200 || 800)}
                      step={10}
                      value={sousBassementHeight}
                      onChange={(e) => setSousBassementHeight(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-orange-500"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Sash Options (OB / Ventilation) */}
            {!isVolet && !product.sheet.includes('Fixe') && (
              <div className="space-y-4">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Options par vantail
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[...Array(product.sheet.includes('2V') ? 2 : (product.sheet.includes('3V') ? 3 : (product.sheet.includes('4V') ? 4 : 1)))].map((_, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 italic">
                      <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase">Vantail {idx + 1}</p>
                      <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sashOptions[idx]?.ob || false}
                            onChange={() => toggleSashOption(idx, 'ob')}
                            className="accent-orange-500"
                          />
                          Oscillo-battant (+30€)
                        </label>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sashOptions[idx]?.vent || false}
                            onChange={() => toggleSashOption(idx, 'vent')}
                            className="accent-orange-500"
                          />
                          Grille de ventilation (+10€)
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Marge nette souhaitée (€)
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={netMarginWanted}
                onChange={(e) => setNetMarginWanted(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full sm:w-56 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
              <p className="text-xs text-slate-400 mt-1">
                Invisible pour le client. Le système compense automatiquement avant remise.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-slate-700">
                  Remise appliquée
                </label>
                <div className="text-sm font-black text-orange-600 bg-orange-100 px-2 py-0.5 rounded-md">
                  -{remise}%
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                step={1}
                value={remise}
                onChange={(e) => setRemise(parseInt(e.target.value) || 0)}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>0%</span>
                <span>Max 20%</span>
              </div>
            </div>

            {/* Pose */}
            <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:border-slate-300 transition-all">
              <input
                type="checkbox"
                checked={includePose}
                onChange={(e) => setIncludePose(e.target.checked)}
                className="accent-orange-500 w-4 h-4"
              />
              <div className="flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <Wrench size={14} className="text-slate-400" />
                  Inclure la pose
                </span>
                <span className="text-xs text-slate-400">
                  {getProductType(product?.sheet || '') === 'volet' && '100 € / unité'}
                  {getProductType(product?.sheet || '') === 'porte' && '400 € / unité'}
                  {getProductType(product?.sheet || '') === 'menuiserie' && '250 € / unité'}
                </span>
              </div>
            </label>
          </div>
        )}

        {requiresColorConfiguration && isColorModalOpen && (
          <div
            className="fixed inset-0 z-[80] bg-slate-900/45 backdrop-blur-sm p-4 sm:p-6 flex items-end sm:items-center justify-center"
            onClick={() => setIsColorModalOpen(false)}
          >
            <div
              className="w-full sm:max-w-xl max-h-[90vh] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">Configuration</p>
                  <h4 className="text-lg font-black text-slate-900">
                    {colorOption === 'bicoloration' ? 'Bicoloration' : 'Coloration 2 faces'}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsColorModalOpen(false)}
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto max-h-[calc(90vh-132px)]">
                {colorOption === 'bicoloration' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Preset</label>
                      <select
                        value={bicoType}
                        onChange={(e) => setBicoType(e.target.value)}
                        className="w-full p-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-orange-500"
                      >
                        <option value="standard_7016">Blanc 9016 (Int) / Gris 7016 (Ext)</option>
                        <option value="standard_chene">Blanc 9016 (Int) / Chene dore plaxe (Ext)</option>
                        <option value="custom">Autre bicoloration...</option>
                      </select>
                    </div>

                    {bicoType === 'custom' && (
                      <div className="p-3 border border-slate-200 rounded-xl bg-slate-50 space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Couleur interieure</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={customColorIntText}
                              onChange={(e) => setCustomColorIntText(e.target.value)}
                              placeholder="ex: Blanc 9016"
                              className="flex-1 p-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-orange-500"
                            />
                            {customColorIntText && !customColorIntText.toLowerCase().includes('blanc') && (
                              <input
                                type="color"
                                value={customColorIntHex}
                                onChange={(e) => setCustomColorIntHex(e.target.value)}
                                className="w-10 h-10 rounded cursor-pointer border border-slate-200"
                                title="Couleur pour le visuel SVG"
                              />
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Finition exterieure</label>
                          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 mb-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isExtPlaxageBico}
                              onChange={(e) => setIsExtPlaxageBico(e.target.checked)}
                              className="accent-orange-500"
                            />
                            Plaxage
                          </label>
                          <input
                            type="text"
                            value={customColorExtText}
                            onChange={(e) => setCustomColorExtText(e.target.value)}
                            placeholder="ex: Rouge 3004"
                            className="w-full p-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-orange-500"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {colorOption === 'coloration-2f' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Preset</label>
                      <select
                        value={color2fType}
                        onChange={(e) => setColor2fType(e.target.value)}
                        className="w-full p-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-orange-500"
                      >
                        <option value="standard_7016">Gris (7016) 2 faces</option>
                        <option value="standard_chene">Chene dore 2 faces</option>
                        <option value="custom">Autre coloration 2 faces...</option>
                      </select>
                    </div>

                    {color2fType === 'custom' && (
                      <div className="p-3 border border-slate-200 rounded-xl bg-slate-50 space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Type et couleur</label>
                          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 mb-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={is2fPlaxage}
                              onChange={(e) => setIs2fPlaxage(e.target.checked)}
                              className="accent-orange-500"
                            />
                            Plaxage
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={customColor2fText}
                              onChange={(e) => setCustomColor2fText(e.target.value)}
                              placeholder="ex: Noir 9005"
                              className="flex-1 p-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-orange-500"
                            />
                            <input
                              type="color"
                              value={customColor2fHex}
                              onChange={(e) => setCustomColor2fHex(e.target.value)}
                              className="w-10 h-10 rounded cursor-pointer border border-slate-200"
                              title="Couleur pour le visuel SVG"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex justify-end p-4 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setIsColorModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors"
                >
                  Valider
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add to Cart */}
        {(unitPrice !== null || isWasteManagement || isCustomProduct) && (
          <div className="p-6">
            <button
              onClick={handleAddToCart}
              disabled={isCustomProduct && (!customLabel || !customPrice)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-full transition-all duration-200 shadow-lg shadow-orange-500/30 transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <ShoppingCart size={18} />
              {isWasteManagement 
                ? (editingItem ? 'Mettre à jour le service' : 'Calculer et ajouter au devis') 
                : (isCustomProduct 
                  ? (editingItem ? 'Mettre à jour ce produit' : 'Ajouter ce produit') 
                  : (editingItem ? 'Mettre à jour le produit' : 'Ajouter au panier')
                )
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
