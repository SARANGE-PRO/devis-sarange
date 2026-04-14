'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  LayoutGrid,
  ArrowLeftRight,
  ChevronDown,
  DoorOpen,
  DoorClosed,
  Blinds,
  Plus,
  Palette,
  Grid3X3,
  Wrench,
  Trash2,
  PackagePlus,
  ImagePlus,
  X,
  Pencil,
  ShoppingCart,
} from 'lucide-react';
import {
  CATEGORIES,
  COMPOSITE_MODULE_TYPES,
  COLOR_OPTIONS,
  VOLET_COLOR_OPTIONS,
  createCompositeComposition,
  createCompositeModule,
  createDefaultColorState,
  getCompositeDimensions,
  getCompositeModuleCount,
  getItemThermalMetrics,
  getCompositePricing,
  getPriceForMm,
  getProductById,
  getProductCategory,
  getProductType,
  getPosePriceForType,
  calculateSurface,
  calculateItemPrice,
  normalizeCompositeComposition,
  formatCompositeModules,
  WASTE_FACTORS,
  WASTE_PRICE_PER_KG,
} from '@/lib/products';
import {
  GLAZING_OPTIONS,
  calculateGlazingAndPanelExtras,
  getSelectedGlazing,
  getFrameSystemForProduct,
  isGlazedProduct,
  calculateGlassAreas,
  calculateGlazingExtra,
} from '@/lib/glazing';
import MenuiserieVisual from '@/components/MenuiserieVisual';
import WasteRecycleIcon from '@/components/icons/WasteRecycleIcon';

const ICONS = {
  LayoutGrid,
  ArrowLeftRight,
  DoorOpen,
  DoorClosed,
  Blinds,
  Recycle: WasteRecycleIcon,
  PackagePlus,
};

const createCartItemId = () => Date.now().toString();
const createUid = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const NUMERIC_INPUT_PROPS = { inputMode: 'numeric', pattern: '[0-9]*' };
const DECIMAL_INPUT_PROPS = { inputMode: 'decimal' };
const normalizePetitsBoisValue = (value) =>
  Math.max(0, Number.parseInt(value, 10) || 0);
const buildPetitsBoisState = (source = {}) => ({
  petitsBoisH: normalizePetitsBoisValue(source.petitsBoisH),
  petitsBoisV: normalizePetitsBoisValue(
    source.petitsBoisV ?? (source.petitsBoisH == null ? source.petitsBois : 0)
  ),
});

const createSimpleConfig = (overrides = {}) => ({
  widthMm: '',
  heightMm: '',
  colorOptionId: 'blanc',
  rawColorState: createDefaultColorState(),
  petitsBoisH: 0,
  petitsBoisV: 0,
  panneauDecoratif: false,
  hasSousBassement: false,
  sousBassementHeight: 400,
  sashOptions: {},
  openingDirection: 'standard',
  glazingId: 'dv_4_20_4_argon_we',
  hasLockingHandle: false,
  ...overrides,
  ...buildPetitsBoisState(overrides),
  rawColorState: createDefaultColorState(overrides.rawColorState),
});

const createCompositeBuilderState = () => {
  const initialComposition = createCompositeComposition();
  return {
    composition: initialComposition,
    selectedModuleId: initialComposition[0].modules[0].id,
  };
};

const isColorConfigOption = (value) =>
  value === 'bicoloration' || value === 'coloration-2f';

const parsePositiveInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const EMPTY_FILLING_PRICING = {
  glazingExtra: 0,
  sousBassementTraversePrice: 0,
  sousBassementPanelExtra: 0,
  totalExtra: 0,
};

const buildFillingSelectionMeta = ({
  product,
  isEligible = false,
  widthMm,
  heightMm,
  glazingId,
  hasSousBassement = false,
  sousBassementHeight = 0,
  colorOptionId = 'blanc',
}) => {
  if (!product || (!isEligible && !isGlazedProduct(product))) {
    return {
      frameSystem: null,
      glassAreas: null,
      selectedGlazing: getSelectedGlazing(glazingId),
      selectedPricing: EMPTY_FILLING_PRICING,
      options: [],
      thermalEligible: false,
    };
  }

  const frameSystem = getFrameSystemForProduct(product.sheet);
  const parsedWidth = parsePositiveInt(widthMm);
  const parsedHeight = parsePositiveInt(heightMm);
  const glassAreas =
    parsedWidth && parsedHeight
      ? calculateGlassAreas(parsedWidth, parsedHeight, frameSystem.frameWidthMm)
      : null;

  const buildPricing = (nextGlazingId) =>
    glassAreas
      ? calculateGlazingAndPanelExtras({
          selectedGlazing: nextGlazingId,
          glassAreas,
          widthMm: parsedWidth,
          hasSousBassement,
          sousBassementHeightMm: sousBassementHeight,
          colorOptionId,
        })
      : EMPTY_FILLING_PRICING;

  const selectedGlazing = getSelectedGlazing(glazingId);
  const selectedPricing = buildPricing(selectedGlazing);
  const options = GLAZING_OPTIONS.map((glazing) => ({
    glazing,
    pricing: buildPricing(glazing),
  }));

  return {
    frameSystem,
    glassAreas,
    selectedGlazing,
    selectedPricing,
    options,
    thermalEligible:
      Boolean(glassAreas) &&
      selectedGlazing?.isThermalDataAvailable !== false &&
      !hasSousBassement,
  };
};

const formatFillingOptionLabel = (glazing, pricing) =>
  pricing?.totalExtra > 0
    ? `${glazing.shortLabel} (+${pricing.totalExtra.toFixed(2)} EUR)`
    : `${glazing.shortLabel} (Inclus)`;

const getFillingOptionDetails = (glazing, pricing) => {
  const details = [];

  if (glazing?.isOpaqueFilling) {
    details.push('Remplissage opaque');
  } else if (
    glazing?.ug !== null &&
    glazing?.ug !== undefined &&
    glazing?.g !== null &&
    glazing?.g !== undefined
  ) {
    details.push(`Ug=${glazing.ug} | g=${glazing.g}`);
  }

  if (glazing?.thicknessMm) {
    details.push(`Ep. ${glazing.thicknessMm} mm`);
  }

  details.push(
    pricing?.totalExtra > 0 ? `+${pricing.totalExtra.toFixed(2)} EUR` : 'Inclus'
  );

  return details.join(' | ');
};

const getSoubassementPricingDetails = (pricing) => {
  const details = [];

  if (pricing?.sousBassementTraversePrice > 0) {
    details.push(`Traverse ${pricing.sousBassementTraversePrice.toFixed(2)} EUR`);
  }

  if (pricing?.sousBassementPanelExtra > 0) {
    details.push(`Panneau ${pricing.sousBassementPanelExtra.toFixed(2)} EUR`);
  }

  return details.join(' | ');
};

const getSashCount = (sheetName = '') => {
  if (!sheetName || sheetName.includes('Fixe') || sheetName.startsWith('Volet')) {
    return 0;
  }
  if (sheetName.includes('4V')) return 4;
  if (sheetName.includes('3V')) return 3;
  if (sheetName.includes('2V')) return 2;
  if (sheetName.includes('Coulissant')) return 2;
  return 1;
};

const getColorSummary = (colorOptionId, colorState) => {
  if (colorOptionId === 'blanc') return 'Standard';

  if (colorOptionId === 'bicoloration') {
    if (colorState.bicoType === 'standard_7016') {
      return 'Blanc 9016 (int) / Gris 7016 (ext)';
    }
    if (colorState.bicoType === 'standard_chene') {
      return 'Blanc 9016 (int) / Chene dore plaxe (ext)';
    }

    const inside = colorState.customColorIntText.trim() || 'Interieur a definir';
    const outsidePrefix = colorState.isExtPlaxageBico ? 'Plaxage ' : '';
    const outside = colorState.customColorExtText.trim() || 'Exterieur a definir';
    return `${inside} / ${outsidePrefix}${outside}`;
  }

  if (colorOptionId === 'coloration-2f') {
    if (colorState.color2fType === 'standard_7016') return 'Gris 7016 2 faces';
    if (colorState.color2fType === 'standard_chene') return 'Chene dore 2 faces';

    const prefix = colorState.is2fPlaxage ? 'Plaxage 2 faces' : 'Coloration 2 faces';
    const label = colorState.customColor2fText.trim() || 'Couleur a definir';
    return `${prefix} : ${label}`;
  }

  return '';
};

const getMarketingDetails = ({
  product,
  colorOptionId,
  colorState,
  hasLockingHandle,
  panneauDecoratif,
}) => {
  if (!product) {
    return { marketingBase: '', marketingFinition: '', svgColor: '#FFFFFF' };
  }

  const isVolet = product.sheet.startsWith('Volet');
  const isPorte = product.sheet.startsWith('Porte Entr');
  let marketingBase = '';

  if (!isVolet) {
    marketingBase = product.sheet.includes('Coulissant')
      ? "Profiles PVC Schuco\n5 chambres d'isolation avec renforts acier galvanise\nSysteme a double joint d'etancheite"
      : "Profiles PVC Schuco 70 mm\n5 chambres d'isolation avec renforts acier galvanise\nSysteme a double joint d'etancheite";

    if (!isPorte) {
      marketingBase += hasLockingHandle
        ? "\nPoignee Schuco Euro verrouillable a cle"
        : '\nPoignee Schuco Euro';
    }
  }

  let marketingFinition = 'Finition : Blanc';
  let svgColor = '#FFFFFF';

  if (isVolet && colorOptionId === 'coloration-2f') {
    if (colorState.color2fType === 'standard_7016') {
      marketingFinition = 'Finition : Gris Anthracite RAL 7016';
      svgColor = '#4A4A4A';
    } else if (colorState.color2fType === 'standard_chene') {
      marketingFinition = 'Finition : Chene dore';
      svgColor = '#8B5A2B';
    } else {
      marketingFinition = `Finition : ${colorState.customColor2fText || 'Couleur a definir'}`;
      svgColor = colorState.customColor2fHex || '#4A4A4A';
    }
  } else if (!isVolet && colorOptionId === 'bicoloration') {
    if (colorState.bicoType === 'standard_7016') {
      marketingFinition = 'Bicoloration : Blanc interieur / Gris 7016 exterieur';
    } else if (colorState.bicoType === 'standard_chene') {
      marketingFinition = 'Bicoloration : Blanc interieur / Chene dore exterieur';
    } else {
      const inside = colorState.customColorIntText || 'Interieur a definir';
      const outsidePrefix = colorState.isExtPlaxageBico ? 'Plaxage ' : '';
      const outside = colorState.customColorExtText || 'Exterieur a definir';
      marketingFinition = `Bicoloration : ${inside} / ${outsidePrefix}${outside}`;
      svgColor =
        inside.toLowerCase().includes('blanc') || !inside.trim()
          ? '#FFFFFF'
          : colorState.customColorIntHex || '#FFFFFF';
    }
  } else if (colorOptionId === 'coloration-2f') {
    if (colorState.color2fType === 'standard_7016') {
      marketingFinition = 'Finition : Gris 7016 2 faces';
      svgColor = '#4A4A4A';
    } else if (colorState.color2fType === 'standard_chene') {
      marketingFinition = 'Finition : Chene dore 2 faces';
      svgColor = '#8B5A2B';
    } else {
      marketingFinition = `Finition : ${colorState.customColor2fText || 'Couleur a definir'}`;
      svgColor = colorState.customColor2fHex || '#4A4A4A';
    }
  }

  if (isPorte && panneauDecoratif) {
    marketingBase += '\nPanneau decoratif';
  }

  return { marketingBase, marketingFinition, svgColor };
};

const buildColorOptionsFields = ({
  value,
  colorState,
  onColorChange,
  onColorStateChange,
  availableOptions,
}) => (
  <div className="space-y-3">
    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
      <Palette size={14} className="text-slate-400" />
      Coloration
    </label>
    <div className="grid gap-3">
      {availableOptions.map((option) => {
        const isActive = value === option.id;
        return (
          <div
            key={option.id}
            className={`rounded-xl border-2 transition-all ${
              isActive
                ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-500/10'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <label className="flex items-start gap-4 p-4 cursor-pointer">
              <input
                type="radio"
                checked={isActive}
                onChange={() => onColorChange(option.id)}
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-orange-500"
              />
              <div className="flex-1">
                <span className="block text-sm font-bold text-slate-800">
                  {option.label}
                </span>
                <span className="mt-1 block text-sm text-slate-500">
                  {option.description}
                </span>
              </div>
            </label>

            {isActive && isColorConfigOption(option.id) && (
              <div className="space-y-4 border-t border-orange-100 px-4 pb-4 pt-4">
                <p className="text-xs font-semibold text-slate-500">
                  Configuration :{' '}
                  <span className="text-slate-700">
                    {getColorSummary(value, colorState)}
                  </span>
                </p>

                {value === 'bicoloration' && (
                  <>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                        Preset
                      </label>
                      <select
                        value={colorState.bicoType}
                        onChange={(event) =>
                          onColorStateChange({ bicoType: event.target.value })
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                      >
                        <option value="standard_7016">
                          Blanc 9016 (int) / Gris 7016 (ext)
                        </option>
                        <option value="standard_chene">
                          Blanc 9016 (int) / Chene dore plaxe (ext)
                        </option>
                        <option value="custom">Autre bicoloration</option>
                      </select>
                    </div>

                    {colorState.bicoType === 'custom' && (
                      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                            Couleur interieure
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={colorState.customColorIntText}
                              onChange={(event) =>
                                onColorStateChange({
                                  customColorIntText: event.target.value,
                                })
                              }
                              placeholder="Ex : Blanc 9016"
                              className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            />
                            <input
                              type="color"
                              value={colorState.customColorIntHex}
                              onChange={(event) =>
                                onColorStateChange({
                                  customColorIntHex: event.target.value,
                                })
                              }
                              className="h-11 w-12 rounded-xl border border-slate-200 bg-white p-1"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                            Couleur exterieure
                          </label>
                          <input
                            type="text"
                            value={colorState.customColorExtText}
                            onChange={(event) =>
                              onColorStateChange({
                                customColorExtText: event.target.value,
                              })
                            }
                            placeholder="Ex : Gris anthracite"
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                          />
                        </div>

                        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={colorState.isExtPlaxageBico}
                            onChange={(event) =>
                              onColorStateChange({
                                isExtPlaxageBico: event.target.checked,
                              })
                            }
                            className="h-4 w-4 accent-orange-500"
                          />
                          Exterieur en plaxage
                        </label>
                      </div>
                    )}
                  </>
                )}

                {value === 'coloration-2f' && (
                  <>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                        Preset
                      </label>
                      <select
                        value={colorState.color2fType}
                        onChange={(event) =>
                          onColorStateChange({ color2fType: event.target.value })
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                      >
                        <option value="standard_7016">Gris 7016 2 faces</option>
                        <option value="standard_chene">Chene dore 2 faces</option>
                        <option value="custom">Autre coloration</option>
                      </select>
                    </div>

                    {colorState.color2fType === 'custom' && (
                      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                            Libelle couleur
                          </label>
                          <input
                            type="text"
                            value={colorState.customColor2fText}
                            onChange={(event) =>
                              onColorStateChange({
                                customColor2fText: event.target.value,
                              })
                            }
                            placeholder="Ex : Noir sable"
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                          />
                        </div>

                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={colorState.customColor2fHex}
                            onChange={(event) =>
                              onColorStateChange({
                                customColor2fHex: event.target.value,
                              })
                            }
                            className="h-11 w-12 rounded-xl border border-slate-200 bg-white p-1"
                          />
                          <label className="flex flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={colorState.is2fPlaxage}
                              onChange={(event) =>
                                onColorStateChange({
                                  is2fPlaxage: event.target.checked,
                                })
                              }
                              className="h-4 w-4 accent-orange-500"
                            />
                            Version plaxage 2 faces
                          </label>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

export default function ProductSelector({
  onAddToCart,
  cartItems = [],
  editingItem,
  onCancelEdit,
}) {
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0].id);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isCompositeMode, setIsCompositeMode] = useState(false);
  const [simpleConfig, setSimpleConfig] = useState(() => createSimpleConfig());
  const [quantity, setQuantity] = useState(1);
  const [includePose, setIncludePose] = useState(false);
  const [remise, setRemise] = useState(0);
  const [netAdjustmentMode, setNetAdjustmentMode] = useState('margin');
  const [netMarginWanted, setNetMarginWanted] = useState(0);
  const [netDiscountWanted, setNetDiscountWanted] = useState(0);
  const [repere, setRepere] = useState('');
  const [showThermalData, setShowThermalData] = useState(true);
  const [customLabel, setCustomLabel] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customImage, setCustomImage] = useState(null);
  const [textOnlyContent, setTextOnlyContent] = useState('');
  const [composition, setComposition] = useState(() => createCompositeBuilderState().composition);
  const [selectedCompositeModuleId, setSelectedCompositeModuleId] = useState(
    () => createCompositeBuilderState().selectedModuleId
  );

  const category = CATEGORIES.find((entry) => entry.id === selectedCategory);
  const categoryProduct = selectedProduct
    ? category?.products.find((entry) => entry.id === selectedProduct) || null
    : null;
  const product = selectedProduct
    ? getProductById(selectedProduct) || categoryProduct
    : null;

  const isWasteManagement = product?.id === 'gestion-dechets';
  const isCustomProduct = product?.id === 'custom-product';
  const isTextOnlyProduct = product?.id === 'text-only';
  const netAdjustmentValue =
    netAdjustmentMode === 'discount' ? netDiscountWanted : netMarginWanted;
  const netAdjustmentLabel =
    netAdjustmentMode === 'discount'
      ? 'Remise nette souhaitée'
      : 'Marge nette souhaitée';

  const normalizedComposition = useMemo(
    () => normalizeCompositeComposition(composition),
    [composition]
  );
  const compositeContext = useMemo(() => {
    const normalized = normalizedComposition;
    let fallback = null;
    for (let rowIndex = 0; rowIndex < normalized.length; rowIndex += 1) {
      const row = normalized[rowIndex];
      for (let moduleIndex = 0; moduleIndex < row.modules.length; moduleIndex += 1) {
        const moduleEntry = row.modules[moduleIndex];
        const context = { row, rowIndex, module: moduleEntry, moduleIndex };
        if (!fallback) fallback = context;
        if (moduleEntry.id === selectedCompositeModuleId) return context;
      }
    }
    return fallback;
  }, [normalizedComposition, selectedCompositeModuleId]);

  const compositePricing = useMemo(() => getCompositePricing(composition), [composition]);
  const compositeDimensions = getCompositeDimensions(composition);
  const compositeModuleCount = getCompositeModuleCount(composition);

  const activeCompositeModule = compositeContext?.module || null;
  const activeCompositePricing =
    compositePricing.modulePricing.find(
      (moduleEntry) => moduleEntry.id === selectedCompositeModuleId
    ) || null;
  const activeModuleProduct = activeCompositeModule
    ? getProductById(activeCompositeModule.productId)
    : null;

  const formProduct = isCompositeMode ? activeModuleProduct : product;
  const workingConfig = isCompositeMode
    ? activeCompositeModule?.options || createSimpleConfig()
    : simpleConfig;
  const workingColorState =
    workingConfig?.rawColorState || createDefaultColorState();
  const workingColorOptions =
    formProduct?.sheet?.startsWith('Volet') ? VOLET_COLOR_OPTIONS : COLOR_OPTIONS;
  const workingColorOption =
    workingColorOptions.find((entry) => entry.id === workingConfig.colorOptionId) ||
    workingColorOptions[0];
  const workingSashCount = getSashCount(formProduct?.sheet);
  const workingIsVolet = Boolean(formProduct?.sheet?.startsWith('Volet'));
  const workingIsPorte = Boolean(formProduct?.sheet?.startsWith('Porte Entr'));
  const workingIsGlazed =
    isGlazedProduct(formProduct) ||
    (workingIsPorte && !workingConfig?.panneauDecoratif);

  const simplePriceData =
    !isCompositeMode &&
    product &&
    simpleConfig.heightMm &&
    simpleConfig.widthMm &&
    !isWasteManagement &&
    !isCustomProduct &&
    !isTextOnlyProduct
      ? getPriceForMm(
          product.sheet,
          parsePositiveInt(simpleConfig.heightMm),
          parsePositiveInt(simpleConfig.widthMm)
        )
      : null;

  const addButtonLabel = editingItem
    ? isTextOnlyProduct
      ? 'Mettre à jour le texte'
      : 'Mettre à jour le produit'
    : isCompositeMode
      ? 'Ajouter le châssis composé'
      : isTextOnlyProduct
        ? 'Insérer le texte'
      : 'Ajouter au panier';

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setCustomImage(reader.result);
    reader.readAsDataURL(file);
  };

  const simpleFillingMeta = buildFillingSelectionMeta({
    product,
    isEligible:
      isGlazedProduct(product) ||
      (Boolean(product?.sheet?.startsWith('Porte Entr')) &&
        !simpleConfig.panneauDecoratif),
    widthMm: simpleConfig.widthMm,
    heightMm: simpleConfig.heightMm,
    glazingId: simpleConfig.glazingId,
    hasSousBassement: simpleConfig.hasSousBassement,
    sousBassementHeight: simpleConfig.sousBassementHeight,
    colorOptionId: simpleConfig.colorOptionId,
  });
  const simpleGlassAreas = simpleFillingMeta.glassAreas;
  const simpleSelectedGlazing = simpleFillingMeta.selectedGlazing;
  const simpleGlazingExtra = simpleFillingMeta.selectedPricing.totalExtra;

  const activeModuleFillingMeta = buildFillingSelectionMeta({
    product: activeModuleProduct,
    isEligible:
      isGlazedProduct(activeModuleProduct) ||
      (Boolean(activeModuleProduct?.sheet?.startsWith('Porte Entr')) &&
        !workingConfig.panneauDecoratif),
    widthMm: activeCompositeModule?.widthMm,
    heightMm: activeCompositeModule?.heightMm,
    glazingId: workingConfig.glazingId,
    hasSousBassement: workingConfig.hasSousBassement,
    sousBassementHeight: workingConfig.sousBassementHeight,
    colorOptionId: workingConfig.colorOptionId,
  });

  const wasteCalculation = useMemo(() => {
    return cartItems.reduce(
      (accumulator, item) => {
        if (
          item.productId === 'gestion-dechets' ||
          item.productId === 'custom-product' ||
          item.productId === 'text-only'
        ) {
          return accumulator;
        }

        if (item.isComposite) {
          const pricedComposition = getCompositePricing(item.composition, item.modules);

          pricedComposition.modulePricing.forEach((module) => {
            const factor = WASTE_FACTORS[module.categoryId];
            if (!factor) return;

            const surface = calculateSurface(
              module.widthMm,
              module.heightMm,
              item.quantity
            );
            const weight = surface * factor;
            accumulator.totalSurface += surface;
            accumulator.totalWeight += weight;
            accumulator.totalWastePrice += weight * WASTE_PRICE_PER_KG;
          });

          return accumulator;
        }

        const categoryId = getProductCategory(item.productId);
        const factor = WASTE_FACTORS[categoryId];
        if (!factor) return accumulator;

        const surface = calculateSurface(item.widthMm, item.heightMm, item.quantity);
        const weight = surface * factor;
        accumulator.totalSurface += surface;
        accumulator.totalWeight += weight;
        accumulator.totalWastePrice += weight * WASTE_PRICE_PER_KG;
        return accumulator;
      },
      { totalSurface: 0, totalWeight: 0, totalWastePrice: 0 }
    );
  }, [cartItems]);

  const simpleMarketing = getMarketingDetails({
    product,
    colorOptionId: simpleConfig.colorOptionId,
    colorState: simpleConfig.rawColorState,
    hasLockingHandle: simpleConfig.hasLockingHandle,
    panneauDecoratif: simpleConfig.panneauDecoratif,
  });

  const compositePreviewComposition = useMemo(
    () =>
      compositePricing.composition.map((row) => ({
        ...row,
        modules: row.modules.map((module) => ({
          ...module,
          svgColor: getMarketingDetails({
            product: getProductById(module.productId),
            colorOptionId: module.options.colorOptionId,
            colorState: module.options.rawColorState,
            hasLockingHandle: module.options.hasLockingHandle,
            panneauDecoratif: module.options.panneauDecoratif,
          }).svgColor,
        })),
      })),
    [compositePricing.composition]
  );

  const previewItem = (() => {
    if (isWasteManagement) {
      return {
        productId: product?.id,
        totalWeight: wasteCalculation.totalWeight,
        totalWastePrice: wasteCalculation.totalWastePrice,
      };
    }

    if (isCustomProduct) {
      const parsedCustomPrice = Number.parseFloat(customPrice);
      if (!customLabel || !Number.isFinite(parsedCustomPrice)) return null;
      return {
        productId: 'custom-product',
        customPrice: parsedCustomPrice,
        quantity,
      };
    }

    if (isTextOnlyProduct) {
      return null;
    }

    if (isCompositeMode) {
      if (!compositePricing.totalPrice || compositePricing.hasInvalidModule) return null;
      const compositePreviewItem = {
        productId: 'composite-builder',
        productLabel: 'Châssis composé 2D',
        sheetName: 'Châssis composé 2D',
        widthMm: compositePricing.totalWidth,
        heightMm: compositePricing.totalHeight,
        unitPrice: compositePricing.totalPrice,
        quantity,
        includePose,
        remise,
        netMarginWanted,
        netDiscountWanted,
        isComposite: true,
        composition: compositePricing.composition,
      };
      const thermalMetrics = getItemThermalMetrics(compositePreviewItem);
      return {
        ...compositePreviewItem,
        thermalUw: thermalMetrics?.thermalUw ?? null,
        thermalSw: thermalMetrics?.thermalSw ?? null,
      };
    }

    if (!product || !simplePriceData) return null;

    const simplePreviewItem = {
      productId: product.id,
      sheetName: product.sheet,
      widthMm: parsePositiveInt(simpleConfig.widthMm),
      heightMm: parsePositiveInt(simpleConfig.heightMm),
      unitPrice: simplePriceData.price,
      quantity,
      includePose,
      remise,
      netMarginWanted,
      netDiscountWanted,
      colorOption: workingColorOption,
      ...(workingIsVolet
        ? { petitsBoisH: 0, petitsBoisV: 0 }
        : buildPetitsBoisState(simpleConfig)),
      panneauDecoratif: workingIsPorte ? simpleConfig.panneauDecoratif : false,
      hasSousBassement: !workingIsVolet && simpleConfig.hasSousBassement,
      sousBassementHeight: simpleConfig.hasSousBassement
        ? simpleConfig.sousBassementHeight
        : 0,
      sashOptions: !workingIsVolet ? simpleConfig.sashOptions : {},
      openingDirection: !workingIsVolet ? simpleConfig.openingDirection : 'standard',
      glazingOption: workingIsGlazed ? simpleSelectedGlazing : null,
      glazingExtra: workingIsGlazed ? simpleGlazingExtra : 0,
      hasLockingHandle: !workingIsVolet && !workingIsPorte
        ? simpleConfig.hasLockingHandle
        : false,
    };
    const thermalMetrics = getItemThermalMetrics(simplePreviewItem);
    return {
      ...simplePreviewItem,
      thermalUw: thermalMetrics?.thermalUw ?? null,
      thermalSw: thermalMetrics?.thermalSw ?? null,
    };
  })();

  const previewCalc = previewItem ? calculateItemPrice(previewItem) : null;

  const handleNetAdjustmentModeChange = (nextMode) => {
    const normalizedMode = nextMode === 'discount' ? 'discount' : 'margin';
    setNetAdjustmentMode(normalizedMode);

    if (normalizedMode === 'discount') {
      setNetMarginWanted(0);
      return;
    }

    setNetDiscountWanted(0);
  };

  const handleNetAdjustmentValueChange = (rawValue) => {
    const nextValue = Math.max(0, Number.parseFloat(rawValue) || 0);

    if (netAdjustmentMode === 'discount') {
      setNetDiscountWanted(nextValue);
      setNetMarginWanted(0);
      return;
    }

    setNetMarginWanted(nextValue);
    setNetDiscountWanted(0);
  };

  const resetSimpleSelection = () => {
    setSimpleConfig(createSimpleConfig());
    setCustomLabel('');
    setCustomDescription('');
    setCustomPrice('');
    setCustomImage(null);
    setTextOnlyContent('');
  };

  const resetCompositeSelection = () => {
    const nextState = createCompositeBuilderState();
    setComposition(nextState.composition);
    setSelectedCompositeModuleId(nextState.selectedModuleId);
  };

  const resetGlobalCommercialFields = () => {
    setQuantity(1);
    setIncludePose(false);
    setRemise(0);
    setNetAdjustmentMode('margin');
    setNetMarginWanted(0);
    setNetDiscountWanted(0);
    setRepere('');
    setShowThermalData(true);
  };

  const handleCategoryChange = (categoryId) => {
    setSelectedCategory(categoryId);
    setSelectedProduct(null);
    resetSimpleSelection();
  };

  const handleProductChange = (productId) => {
    setSelectedProduct(productId);
    resetSimpleSelection();
  };

  const updateSimpleOptions = (patch) => {
    setSimpleConfig((previous) => ({
      ...previous,
      ...patch,
      rawColorState: patch.rawColorState
        ? createDefaultColorState(patch.rawColorState)
        : previous.rawColorState,
    }));
  };

  const updateCompositeModule = (moduleId, updater) => {
    setComposition((previous) =>
      previous.map((row) => ({
        ...row,
        modules: row.modules.map((module) => {
          if (module.id !== moduleId) return module;
          const nextModule =
            typeof updater === 'function' ? updater(module) : updater;
          return {
            ...module,
            ...nextModule,
            options: {
              ...module.options,
              ...nextModule.options,
              rawColorState: nextModule.options?.rawColorState
                ? createDefaultColorState(nextModule.options.rawColorState)
                : module.options.rawColorState,
            },
          };
        }),
      }))
    );
  };

  const updateSelectedModuleOptions = (patch) => {
    if (!selectedCompositeModuleId) return;
    updateCompositeModule(selectedCompositeModuleId, (module) => ({
      ...module,
      options: {
        ...module.options,
        ...patch,
        rawColorState: patch.rawColorState
          ? createDefaultColorState({
              ...module.options.rawColorState,
              ...patch.rawColorState,
            })
          : module.options.rawColorState,
      },
    }));
  };

  const updateWorkingSashOption = (index, optionKey) => {
    if (isCompositeMode) {
      if (!activeCompositeModule) return;
      const current = activeCompositeModule.options.sashOptions[index] || {};
      updateSelectedModuleOptions({
        sashOptions: {
          ...activeCompositeModule.options.sashOptions,
          [index]: {
            ...current,
            [optionKey]: !current[optionKey],
          },
        },
      });
      return;
    }

    const current = simpleConfig.sashOptions[index] || {};
    updateSimpleOptions({
      sashOptions: {
        ...simpleConfig.sashOptions,
        [index]: {
          ...current,
          [optionKey]: !current[optionKey],
        },
      },
    });
  };

  const addCompositeRow = (position) => {
    const referenceWidth =
      compositeContext?.row.modules.reduce(
        (total, module) => total + parsePositiveInt(module.widthMm, 0),
        0
      ) ||
      compositeDimensions.width ||
      1200;

    const nextModule = createCompositeModule(createUid('module'), {
      productId: position === 'above' ? 'fenetre-soufflet' : 'fenetre-fixe',
      widthMm: referenceWidth,
      heightMm: 400,
    });

    const nextRow = { id: createUid('row'), modules: [nextModule] };
    const insertIndex =
      position === 'above'
        ? compositeContext?.rowIndex ?? 0
        : (compositeContext?.rowIndex ?? composition.length - 1) + 1;

    setComposition((previous) => {
      const next = [...previous];
      next.splice(insertIndex, 0, nextRow);
      return next;
    });
    setSelectedCompositeModuleId(nextModule.id);
  };

  const addCompositeModuleBeside = () => {
    const referenceModule = compositeContext?.module;
    const nextModule = createCompositeModule(createUid('module'), {
      productId: referenceModule?.productId || 'fenetre-fixe',
      widthMm: referenceModule?.widthMm || 400,
      heightMm: referenceModule?.heightMm || 1250,
    });

    setComposition((previous) =>
      previous.map((row, rowIndex) => {
        if (rowIndex !== compositeContext?.rowIndex) return row;
        const nextModules = [...row.modules];
        nextModules.splice(
          (compositeContext?.moduleIndex ?? row.modules.length - 1) + 1,
          0,
          nextModule
        );
        return { ...row, modules: nextModules };
      })
    );
    setSelectedCompositeModuleId(nextModule.id);
  };

  const removeCompositeModule = (moduleId) => {
    const normalized = normalizeCompositeComposition(composition);
    const contextToRemove =
      normalized
        .flatMap((row, rowIndex) =>
          row.modules.map((module, moduleIndex) => ({
            row,
            rowIndex,
            module,
            moduleIndex,
          }))
        )
        .find((entry) => entry.module.id === moduleId) || compositeContext;

    if (!contextToRemove) return;

    if (normalized.length === 1 && normalized[0].modules.length === 1) {
      resetCompositeSelection();
      return;
    }

    setComposition((previous) =>
      previous
        .map((row, rowIndex) => {
          if (rowIndex !== contextToRemove.rowIndex) return row;
          return {
            ...row,
            modules: row.modules.filter((module) => module.id !== moduleId),
          };
        })
        .filter((row) => row.modules.length > 0)
    );

    const sameRow = contextToRemove.row.modules.filter((module) => module.id !== moduleId);
    const fallbackId =
      sameRow[contextToRemove.moduleIndex]?.id ||
      sameRow[contextToRemove.moduleIndex - 1]?.id ||
      normalized[contextToRemove.rowIndex + 1]?.modules[0]?.id ||
      normalized[contextToRemove.rowIndex - 1]?.modules[0]?.id;

    if (fallbackId) {
      setSelectedCompositeModuleId(fallbackId);
    }
  };

  const replaceSelectedModuleProduct = (productId) => {
    if (!selectedCompositeModuleId) return;
    const nextTemplate = createCompositeModule(selectedCompositeModuleId, {
      productId,
    });

    updateCompositeModule(selectedCompositeModuleId, {
      ...nextTemplate,
      id: selectedCompositeModuleId,
    });
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isCompositeMode) return;
    if (!compositeContext?.module?.id) return;
    if (selectedCompositeModuleId !== compositeContext.module.id) {
      setSelectedCompositeModuleId(compositeContext.module.id);
    }
  }, [compositeContext, isCompositeMode, selectedCompositeModuleId]);

  useEffect(() => {
    if (!editingItem) return;

    setQuantity(editingItem.quantity || 1);
    setIncludePose(Boolean(editingItem.includePose));
    setRemise(editingItem.remise || 0);
    setNetAdjustmentMode(
      editingItem.netAdjustmentMode === 'discount' ||
      Number(editingItem.netDiscountWanted || 0) > 0
        ? 'discount'
        : 'margin'
    );
    setNetMarginWanted(Number(editingItem.netMarginWanted || 0));
    setNetDiscountWanted(Number(editingItem.netDiscountWanted || 0));
    setRepere(editingItem.repere || '');
    setShowThermalData(
      editingItem.showThermalData !== undefined ? editingItem.showThermalData : true
    );

    if (editingItem.isComposite) {
      const nextComposition = normalizeCompositeComposition(
        editingItem.composition,
        editingItem.modules
      );
      setIsCompositeMode(true);
      setComposition(nextComposition);
      setSelectedCompositeModuleId(nextComposition[0].modules[0].id);
      return;
    }

    setIsCompositeMode(false);
    const nextCategory = getProductCategory(editingItem.productId) || CATEGORIES[0].id;
    setSelectedCategory(nextCategory);
    setSelectedProduct(editingItem.productId);

    if (editingItem.productId === 'custom-product') {
      setCustomLabel(editingItem.productLabel || '');
      setCustomDescription(editingItem.customDescription || '');
      setCustomPrice(editingItem.customPrice?.toString() || '');
      setCustomImage(editingItem.customImage || null);
      return;
    }

    if (editingItem.productId === 'text-only') {
      setTextOnlyContent(editingItem.textContent || '');
      return;
    }

    setSimpleConfig(
      createSimpleConfig({
        widthMm: editingItem.widthMm?.toString() || '',
        heightMm: editingItem.heightMm?.toString() || '',
        colorOptionId: editingItem.colorOption?.id || 'blanc',
        rawColorState: editingItem.rawColorState || createDefaultColorState(),
        ...buildPetitsBoisState(editingItem),
        panneauDecoratif: editingItem.panneauDecoratif || false,
        hasSousBassement: editingItem.hasSousBassement || false,
        sousBassementHeight: editingItem.sousBassementHeight || 400,
        sashOptions: editingItem.sashOptions || {},
        openingDirection: editingItem.openingDirection || 'standard',
        glazingId: editingItem.glazingOption?.id || 'dv_4_20_4_argon_we',
        hasLockingHandle: editingItem.hasLockingHandle || false,
      })
    );
  }, [editingItem]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleModeChange = (nextMode) => {
    setIsCompositeMode(nextMode === 'composite');
  };

  const handleAddToCart = () => {
    if (isCompositeMode) {
      if (compositePricing.hasInvalidModule || !compositePricing.totalPrice) return;

      const pricedComposition = compositePricing.composition.map((row) => ({
        ...row,
        modules: row.modules.map((module) => {
          const productDefinition = getProductById(module.productId);
          const marketing = getMarketingDetails({
            product: productDefinition,
            colorOptionId: module.options.colorOptionId,
            colorState: module.options.rawColorState,
            hasLockingHandle: module.options.hasLockingHandle,
            panneauDecoratif: module.options.panneauDecoratif,
          });

          return {
            ...module,
            productLabel: productDefinition?.label || module.productId,
            colorOption: module.colorOption,
            glazingOption: module.glazingOption,
            rawColorState: module.options.rawColorState,
            ...buildPetitsBoisState(module.options),
            panneauDecoratif: module.options.panneauDecoratif,
            hasSousBassement: module.options.hasSousBassement,
            sousBassementHeight: module.options.sousBassementHeight,
            sashOptions: module.options.sashOptions,
            openingDirection: module.options.openingDirection,
            hasLockingHandle: module.options.hasLockingHandle,
            marketingBase: marketing.marketingBase,
            marketingFinition: marketing.marketingFinition,
            svgColor: marketing.svgColor,
          };
        }),
      }));

      const flatModules = pricedComposition.flatMap((row) => row.modules);

      const nextCompositeItem = {
        id: editingItem ? editingItem.id : createCartItemId(),
        productId: 'composite-builder',
        productLabel: 'Châssis composé 2D',
        sheetName: 'Châssis composé 2D',
        widthMm: compositePricing.totalWidth,
        heightMm: compositePricing.totalHeight,
        quantity,
        unitPrice: compositePricing.totalPrice,
        includePose,
        remise,
        netAdjustmentMode,
        netMarginWanted,
        netDiscountWanted,
        repere,
        showThermalData,
        isComposite: true,
        composition: pricedComposition,
        modules: flatModules,
        modulePricing: flatModules,
      };
      const thermalMetrics = getItemThermalMetrics(nextCompositeItem);

      onAddToCart({
        ...nextCompositeItem,
        thermalUw: thermalMetrics?.thermalUw ?? null,
        thermalSw: thermalMetrics?.thermalSw ?? null,
      });

      resetCompositeSelection();
      resetGlobalCommercialFields();
      return;
    }

    if (!product) return;

    if (isWasteManagement) {
      onAddToCart({
        id: editingItem ? editingItem.id : createCartItemId(),
        productId: product.id,
        productLabel: product.label,
        sheetName: product.sheet,
        totalSurface: wasteCalculation.totalSurface,
        totalWeight: wasteCalculation.totalWeight,
        totalWastePrice: wasteCalculation.totalWastePrice,
        quantity: 1,
        unitPrice: wasteCalculation.totalWastePrice,
        includePose: false,
        remise: 0,
        netMarginWanted: 0,
        netDiscountWanted: 0,
      });
      return;
    }

    if (isCustomProduct) {
      const parsedCustomPrice = Number.parseFloat(customPrice);
      if (!customLabel || !Number.isFinite(parsedCustomPrice)) return;

      onAddToCart({
        id: editingItem ? editingItem.id : createCartItemId(),
        productId: product.id,
        productLabel: customLabel,
        customDescription,
        customPrice: parsedCustomPrice,
        customImage,
        repere,
        quantity,
        unitPrice: parsedCustomPrice,
        includePose: false,
        remise: 0,
        netMarginWanted: 0,
        netDiscountWanted: 0,
      });

      resetSimpleSelection();
      resetGlobalCommercialFields();
      return;
    }

    if (isTextOnlyProduct) {
      const trimmedContent = textOnlyContent.trim();
      if (!trimmedContent) return;

      onAddToCart({
        id: editingItem ? editingItem.id : createCartItemId(),
        productId: 'text-only',
        productLabel: product.label,
        textContent: trimmedContent,
        quantity: 1,
        unitPrice: 0,
        includePose: false,
        remise: 0,
        netMarginWanted: 0,
        netDiscountWanted: 0,
      });

      resetSimpleSelection();
      resetGlobalCommercialFields();
      return;
    }

    if (!simplePriceData) return;

    const nextSimpleItem = {
      id: editingItem ? editingItem.id : createCartItemId(),
      productId: product.id,
      productLabel: product.label,
      sheetName: product.sheet,
      widthMm: parsePositiveInt(simpleConfig.widthMm),
      heightMm: parsePositiveInt(simpleConfig.heightMm),
      billedHeightCm: simplePriceData.billedHeight,
      billedWidthCm: simplePriceData.billedWidth,
      quantity,
      unitPrice: simplePriceData.price,
      colorOption: workingColorOption,
      ...(workingIsVolet
        ? { petitsBoisH: 0, petitsBoisV: 0 }
        : buildPetitsBoisState(simpleConfig)),
      includePose,
      remise,
      netAdjustmentMode,
      netMarginWanted,
      netDiscountWanted,
      panneauDecoratif: workingIsPorte ? simpleConfig.panneauDecoratif : false,
      hasSousBassement: !workingIsVolet && simpleConfig.hasSousBassement,
      sousBassementHeight: simpleConfig.hasSousBassement
        ? simpleConfig.sousBassementHeight
        : 0,
      sashOptions: !workingIsVolet ? simpleConfig.sashOptions : {},
      openingDirection: !workingIsVolet ? simpleConfig.openingDirection : 'standard',
      glazingOption: workingIsGlazed ? simpleSelectedGlazing : null,
      glazingExtra: workingIsGlazed ? simpleGlazingExtra : 0,
      marketingBase: simpleMarketing.marketingBase,
      marketingFinition: simpleMarketing.marketingFinition,
      svgColor: simpleMarketing.svgColor,
      hasLockingHandle: !workingIsVolet && !workingIsPorte
        ? simpleConfig.hasLockingHandle
        : false,
      rawColorState: simpleConfig.rawColorState,
      repere,
      showThermalData,
    };
    const thermalMetrics = getItemThermalMetrics(nextSimpleItem);

    onAddToCart({
      ...nextSimpleItem,
      thermalUw: thermalMetrics?.thermalUw ?? null,
      thermalSw: thermalMetrics?.thermalSw ?? null,
    });

    resetSimpleSelection();
    resetGlobalCommercialFields();
  };

  const simpleModeContent = (
    <div className="w-full max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/70 p-4 md:p-6">
        <label className="mb-3 block text-xs font-black uppercase tracking-widest text-slate-400 sm:mb-4">
          Choix du produit
        </label>

        <div className="-mx-1 mb-4 flex max-w-full gap-2 overflow-x-auto px-1 pb-2 sm:mb-5 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {CATEGORIES.map((entry) => {
            const Icon = ICONS[entry.icon];
            return (
              <button
                key={entry.id}
                onClick={() => handleCategoryChange(entry.id)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all sm:gap-2.5 sm:px-5 sm:py-3 ${
                  selectedCategory === entry.id
                    ? 'bg-slate-900 text-white shadow-lg'
                    : 'border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {Icon && <Icon size={16} className="sm:h-[18px] sm:w-[18px]" />}
                <span className="whitespace-nowrap">{entry.label}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {category?.products.map((entry) => (
            <button
              key={entry.id}
              onClick={() => handleProductChange(entry.id)}
              className={`group flex min-h-[6rem] flex-col items-center justify-between rounded-2xl border-2 p-3 text-center text-sm font-bold transition-all sm:min-h-[8rem] sm:p-4 ${
                selectedProduct === entry.id
                  ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-md'
                  : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {!entry.id.includes('gestion-dechets') &&
                !entry.id.includes('custom') &&
                entry.id !== 'text-only' && (
                <div className="mb-2 h-12 w-12 shrink-0 opacity-90 transition-transform duration-300 group-hover:scale-105 sm:mb-3 sm:h-16 sm:w-16">
                  <MenuiserieVisual
                    sheetName={entry.sheet}
                    width={entry.sheet.startsWith('Porte Entr') ? 900 : 1200}
                    height={entry.sheet.startsWith('Porte Entr') ? 2150 : 1250}
                    options={{ productId: entry.id, colorOption: { id: 'blanc' } }}
                    className="h-full w-full"
                  />
                </div>
              )}
              <span>{entry.shortLabel}</span>
            </button>
          ))}
        </div>
      </div>

      {product && !isWasteManagement && !isCustomProduct && !isTextOnlyProduct && (
        <div className="border-b border-slate-100 px-4 pt-4 sm:px-6 sm:pt-6">
          <MenuiserieVisual
            sheetName={product.sheet}
            width={simpleConfig.widthMm || (workingIsPorte ? 900 : 1200)}
            height={simpleConfig.heightMm || (workingIsPorte ? 2150 : 1250)}
            options={{
              colorOption: workingColorOption,
              glazingId: simpleConfig.glazingId,
              petitsBoisH: simpleConfig.petitsBoisH,
              petitsBoisV: simpleConfig.petitsBoisV,
              panneauDecoratif: simpleConfig.panneauDecoratif,
              hasSousBassement: simpleConfig.hasSousBassement,
              sousBassementHeight: simpleConfig.sousBassementHeight,
              sashOptions: simpleConfig.sashOptions,
              openingDirection: simpleConfig.openingDirection,
              productId: product.id,
              svgColor: simpleMarketing.svgColor,
            }}
            className="h-48 sm:h-72 md:h-80"
          />
        </div>
      )}

      {product && !isWasteManagement && !isTextOnlyProduct && (
        <div className="border-b border-slate-100 bg-orange-50/30 p-4 md:p-6">
          <label className="mb-1.5 block text-sm font-bold text-slate-700">
            Repère (ex : SDB, Chambre 1, Cuisine)
          </label>
          <input
            type="text"
            value={repere}
            onChange={(event) => setRepere(event.target.value)}
            placeholder="Localisation de la menuiserie..."
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
          />
        </div>
      )}

      {isWasteManagement && (
        <div className="p-4 text-center md:p-8">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-50">
            <WasteRecycleIcon size={48} className="text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Service environnemental</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            Calcul dynamique base sur les surfaces presentes au devis, a{' '}
            {WASTE_PRICE_PER_KG.toFixed(2)} EUR / kg estime.
          </p>
        </div>
      )}

      {isCustomProduct && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 p-4 md:p-6">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                Nom du produit/service
              </label>
              <input
                type="text"
                value={customLabel}
                onChange={(event) => setCustomLabel(event.target.value)}
                placeholder="Ex : Porte de garage motorisee"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                Description
              </label>
              <textarea
                rows={4}
                value={customDescription}
                onChange={(event) => setCustomDescription(event.target.value)}
                placeholder="Description commerciale..."
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Prix unitaire HT
                </label>
                <input
                  type="number"
                  {...DECIMAL_INPUT_PROPS}
                  value={customPrice}
                  onChange={(event) => setCustomPrice(event.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Quantité
                </label>
              <input
                type="number"
                min={1}
                {...NUMERIC_INPUT_PROPS}
                value={quantity}
                  onChange={(event) =>
                    setQuantity(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                />
              </div>
            </div>
          </div>

          <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 md:p-6 transition-all hover:bg-slate-100">
            {customImage ? (
              <>
                <img
                  src={customImage}
                  alt=""
                  className="h-64 w-full rounded-xl object-contain"
                />
                <button
                  onClick={() => setCustomImage(null)}
                  className="absolute right-3 top-3 rounded-full bg-red-500 p-2 text-white shadow-lg transition-colors hover:bg-red-600"
                >
                  <X size={16} />
                </button>
              </>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-3">
                <div className="rounded-full bg-white p-4 text-slate-400 shadow-sm">
                  <ImagePlus size={32} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-700">Ajouter une photo</p>
                  <p className="mt-1 text-xs text-slate-400">PNG ou JPG</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>
      )}

      {isTextOnlyProduct && (
        <div className="p-4 md:p-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 md:p-6">
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Texte libre
            </label>
            <textarea
              rows={8}
              value={textOnlyContent}
              onChange={(event) => setTextOnlyContent(event.target.value)}
              placeholder="Commentaires, description technique, note de mise en page..."
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
            />
            <p className="mt-3 text-xs font-medium text-slate-500">
              Ce bloc sera insere dans le devis sans prix ni quantite.
            </p>
          </div>
        </div>
      )}

      {product && !isWasteManagement && !isCustomProduct && !isTextOnlyProduct && (
        <div className="space-y-6 p-4 md:p-6">
          <details open className="group rounded-2xl border border-slate-200 bg-white p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-slate-800">
              Dimensions
              <ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Largeur (mm)
                </label>
                <input
                  type="number"
                  min={1}
                  {...NUMERIC_INPUT_PROPS}
                  value={simpleConfig.widthMm}
                  onChange={(event) => updateSimpleOptions({ widthMm: event.target.value })}
                  placeholder="Ex : 1200"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Hauteur (mm)
                </label>
                <input
                  type="number"
                  min={1}
                  {...NUMERIC_INPUT_PROPS}
                  value={simpleConfig.heightMm}
                  onChange={(event) => updateSimpleOptions({ heightMm: event.target.value })}
                  placeholder="Ex : 1250"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                />
              </div>
            </div>
          </details>

          <details className="group rounded-2xl border border-slate-200 bg-white p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-slate-800">
              Coloration
              <ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-4">
              {buildColorOptionsFields({
                value: simpleConfig.colorOptionId,
                colorState: simpleConfig.rawColorState,
                onColorChange: (value) => updateSimpleOptions({ colorOptionId: value }),
                onColorStateChange: (patch) =>
                  updateSimpleOptions({
                    rawColorState: {
                      ...simpleConfig.rawColorState,
                      ...patch,
                    },
                  }),
                availableOptions: workingColorOptions,
              })}
            </div>
          </details>

          {workingIsGlazed && (
            <details className="group rounded-2xl border border-slate-200 bg-white p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-slate-800">
                Vitrage / remplissage
                <ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-4">
                <select
                  value={simpleConfig.glazingId}
                  onChange={(event) => updateSimpleOptions({ glazingId: event.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                >
                  {simpleFillingMeta.options.map(({ glazing, pricing }) => (
                    <option key={glazing.id} value={glazing.id}>
                      {formatFillingOptionLabel(glazing, pricing)}
                    </option>
                  ))}
                </select>
                {simpleSelectedGlazing && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-bold text-slate-800">
                      {simpleSelectedGlazing.label}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {getFillingOptionDetails(
                        simpleSelectedGlazing,
                        simpleFillingMeta.selectedPricing
                      )}
                    </p>
                    {simpleConfig.hasSousBassement &&
                      getSoubassementPricingDetails(simpleFillingMeta.selectedPricing) && (
                        <p className="mt-2 text-xs font-semibold text-slate-500">
                          {getSoubassementPricingDetails(simpleFillingMeta.selectedPricing)}
                        </p>
                      )}
                  </div>
                )}
              </div>
            </details>
          )}

          {!workingIsVolet && (
            <details className="group rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-slate-800">
                Options & Accessoires
                <ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-4 space-y-6">
                <div>
                  <p className="text-sm text-slate-500">
                    Regroupez ici les accessoires, le soubassement et le sens d&apos;ouverture.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Grid3X3 size={14} className="text-slate-400" />
                      Petits bois
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Barres horizontales
                        </label>
                        <input
                          type="number"
                          min={0}
                          {...NUMERIC_INPUT_PROPS}
                          value={simpleConfig.petitsBoisH}
                          onChange={(event) =>
                            updateSimpleOptions({
                              petitsBoisH: normalizePetitsBoisValue(event.target.value),
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Barres verticales
                        </label>
                        <input
                          type="number"
                          min={0}
                          {...NUMERIC_INPUT_PROPS}
                          value={simpleConfig.petitsBoisV}
                          onChange={(event) =>
                            updateSimpleOptions({
                              petitsBoisV: normalizePetitsBoisValue(event.target.value),
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                      Sens d&apos;ouverture
                    </label>
                    <select
                      value={simpleConfig.openingDirection}
                      onChange={(event) =>
                        updateSimpleOptions({ openingDirection: event.target.value })
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    >
                      <option value="standard">Standard</option>
                      <option value="inverse">Inverse</option>
                    </select>
                  </div>

                  {workingIsPorte ? (
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={simpleConfig.panneauDecoratif}
                        onChange={(event) =>
                          updateSimpleOptions({ panneauDecoratif: event.target.checked })
                        }
                        className="h-4 w-4 accent-orange-500"
                      />
                      Panneau decoratif
                    </label>
                  ) : (
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={simpleConfig.hasLockingHandle}
                        onChange={(event) =>
                          updateSimpleOptions({ hasLockingHandle: event.target.checked })
                        }
                        className="h-4 w-4 accent-orange-500"
                      />
                      Poignee Schuco verrouillable a cle
                    </label>
                  )}

                  <div className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2">
                    <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={simpleConfig.hasSousBassement}
                        onChange={(event) =>
                          updateSimpleOptions({ hasSousBassement: event.target.checked })
                        }
                        className="h-4 w-4 accent-orange-500"
                      />
                      Sous-bassement
                    </label>

                    {simpleConfig.hasSousBassement && (
                      <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          <span>Hauteur visible</span>
                          <span>{simpleConfig.sousBassementHeight} mm</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-4">
                          <input
                            type="range"
                            min={100}
                            max={Math.max(
                              100,
                              parsePositiveInt(simpleConfig.heightMm, 1000) - 200
                            )}
                            step={10}
                            value={simpleConfig.sousBassementHeight}
                            onChange={(event) =>
                              updateSimpleOptions({
                                sousBassementHeight: Number.parseInt(
                                  event.target.value,
                                  10
                                ),
                              })
                            }
                            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-100 accent-orange-500"
                          />
                          <input
                            type="number"
                            min={100}
                            max={Math.max(
                              100,
                              parsePositiveInt(simpleConfig.heightMm, 1000) - 200
                            )}
                            step={10}
                            {...NUMERIC_INPUT_PROPS}
                            value={simpleConfig.sousBassementHeight}
                            onChange={(event) =>
                              updateSimpleOptions({
                                sousBassementHeight: Math.max(
                                  100,
                                  Number.parseInt(event.target.value, 10) || 100
                                ),
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                          />
                        </div>
                        {getSoubassementPricingDetails(simpleFillingMeta.selectedPricing) && (
                          <p className="text-xs font-semibold text-slate-500">
                            {getSoubassementPricingDetails(simpleFillingMeta.selectedPricing)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {workingSashCount > 0 && !workingIsPorte && (
                  <div className="space-y-4">
                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-400">
                      Options par vantail
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Array.from({ length: workingSashCount }).map((_, index) => (
                        <div
                          key={index}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                        >
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Vantail {index + 1}
                          </p>
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                              <input
                                type="checkbox"
                                checked={Boolean(simpleConfig.sashOptions[index]?.ob)}
                                onChange={() => updateWorkingSashOption(index, 'ob')}
                                className="accent-orange-500"
                              />
                              Oscillo-battant
                            </label>
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                              <input
                                type="checkbox"
                                checked={Boolean(simpleConfig.sashOptions[index]?.vent)}
                                onChange={() => updateWorkingSashOption(index, 'vent')}
                                className="accent-orange-500"
                              />
                              Grille de ventilation
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </details>
          )}






          {false && workingIsGlazed && (
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">Vitrage</label>
              <div className="grid gap-3">
                {GLAZING_OPTIONS.map((glazing) => {
                  const extra =
                    simpleGlassAreas && !glazing.isBaseIncluded
                      ? calculateGlazingExtra({
                          selectedGlassPricePerM2: glazing.purchasePricePerM2,
                          Ag: simpleGlassAreas.Ag,
                        })
                      : 0;
                  return (
                    <label
                      key={glazing.id}
                      className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 p-4 transition-all ${
                        simpleConfig.glazingId === glazing.id
                          ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-500/10'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        checked={simpleConfig.glazingId === glazing.id}
                        onChange={() => updateSimpleOptions({ glazingId: glazing.id })}
                        className="h-5 w-5 accent-orange-500"
                      />
                      <div className="flex-1">
                        <span className="block text-sm font-bold text-slate-800">
                          {glazing.shortLabel}
                        </span>
                        <span className="text-sm text-slate-500">
                          Ug={glazing.ug} · g={glazing.g}
                          {!glazing.isBaseIncluded && simpleGlassAreas
                            ? ` · +${extra.toFixed(2)} EUR`
                            : ''}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                Quantité
              </label>
              <input
                type="number"
                min={1}
                {...NUMERIC_INPUT_PROPS}
                value={quantity}
                onChange={(event) =>
                  setQuantity(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
                }
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                Ajustement net
              </label>
              <select
                value={netAdjustmentMode}
                onChange={(event) => handleNetAdjustmentModeChange(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              >
                <option value="margin">Marge nette souhaitée</option>
                <option value="discount">Remise nette souhaitée</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                {netAdjustmentLabel}
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                {...DECIMAL_INPUT_PROPS}
                value={netAdjustmentValue}
                onChange={(event) => handleNetAdjustmentValueChange(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-semibold text-slate-700">Remise</label>
              <span className="rounded-md bg-orange-100 px-2 py-0.5 text-sm font-black text-orange-600">
                -{remise}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={remise}
              onChange={(event) =>
                setRemise(Number.parseInt(event.target.value, 10) || 0)
              }
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-orange-500"
            />
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={includePose}
              onChange={(event) => setIncludePose(event.target.checked)}
              className="h-4 w-4 accent-orange-500"
            />
            <Wrench size={14} className="text-slate-400" />
            Inclure la pose (
            {getPosePriceForType(getProductType(product.sheet))} EUR
            )
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={showThermalData}
              onChange={(event) => setShowThermalData(event.target.checked)}
              className="h-4 w-4 accent-orange-500"
            />
            Afficher les données thermiques sur le devis
          </label>
        </div>
      )}
    </div>
  );
  const compositeModeContent = (
    <div className="w-full max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/70 p-4 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">
              Builder 2D
            </label>
            <h3 className="text-lg font-black text-slate-900">
              Constructeur de châssis composés
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Cliquez sur un module pour ouvrir son formulaire complet.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <button
              onClick={() => addCompositeRow('above')}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-sm transition-all hover:border-orange-300 hover:text-orange-600"
            >
              <Plus size={16} />
              Ajouter une rangée au-dessus
            </button>
            <button
              onClick={addCompositeModuleBeside}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-sm transition-all hover:border-orange-300 hover:text-orange-600"
            >
              <Plus size={16} />
              Ajouter un module à côté
            </button>
            <button
              onClick={() => addCompositeRow('below')}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-sm transition-all hover:border-orange-300 hover:text-orange-600"
            >
              <Plus size={16} />
              Ajouter une rangée en dessous
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-100 px-4 pt-4 md:px-6 md:pt-6">
        <MenuiserieVisual
          sheetName="Châssis composé 2D"
          width={compositeDimensions.width || 1200}
          height={compositeDimensions.height || 1250}
          options={{
            isComposite: true,
            composition: compositePreviewComposition,
          }}
          className="h-80"
        />
      </div>

      <div className="border-b border-slate-100 px-4 pb-4 pt-4 md:px-6">
        <div className="flex w-full gap-3 overflow-x-auto pb-2">
          {normalizedComposition.flatMap((row, rowIndex) =>
            row.modules.map((module, moduleIndex) => {
              const moduleProduct = getProductById(module.productId);
              const isSelected = module.id === selectedCompositeModuleId;
              return (
                <div
                  key={module.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedCompositeModuleId(module.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedCompositeModuleId(module.id);
                    }
                  }}
                  className={`min-w-[220px] cursor-pointer rounded-2xl border p-4 text-left shadow-sm transition-all ${
                    isSelected
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                        Rangee {rowIndex + 1} • Module {moduleIndex + 1}
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {moduleProduct?.shortLabel || moduleProduct?.label || 'Module'}
                      </p>
                    </div>
                    {isSelected && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-600">
                        Actif
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeCompositeModule(module.id);
                      }}
                      className="rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    L {module.widthMm} x H {module.heightMm} mm
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="space-y-6 p-4 md:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Famille / type
                </label>
                <select
                  value={activeCompositeModule?.productId || ''}
                  onChange={(event) => replaceSelectedModuleProduct(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                >
                  {COMPOSITE_MODULE_TYPES.map((entry) => (
                    <optgroup key={entry.id} label={entry.label}>
                      {entry.products.map((productOption) => (
                        <option key={productOption.id} value={productOption.id}>
                          {productOption.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Prix module
                </p>
                <p className="mt-2 text-lg font-black text-slate-900">
                  {activeCompositePricing?.unitPrice !== null
                    ? `${activeCompositePricing?.unitPrice?.toFixed(2)} EUR`
                    : 'Hors grille'}
                </p>
              </div>
            </div>

            <details open className="group rounded-2xl border border-slate-200 bg-white p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-slate-800">
                Dimensions du module
                <ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Largeur module (mm)
                  </label>
                  <input
                    type="number"
                    min={1}
                    {...NUMERIC_INPUT_PROPS}
                    value={activeCompositeModule?.widthMm || ''}
                    onChange={(event) =>
                      updateCompositeModule(selectedCompositeModuleId, {
                        widthMm: event.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Hauteur module (mm)
                  </label>
                  <input
                    type="number"
                    min={1}
                    {...NUMERIC_INPUT_PROPS}
                    value={activeCompositeModule?.heightMm || ''}
                    onChange={(event) =>
                      updateCompositeModule(selectedCompositeModuleId, {
                        heightMm: event.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </div>
              </div>
            </details>

            <details className="group rounded-2xl border border-slate-200 bg-white p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-slate-800">
                Coloration
                <ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-4">
                {buildColorOptionsFields({
                  value: workingConfig.colorOptionId,
                  colorState: workingColorState,
                  onColorChange: (value) =>
                    updateSelectedModuleOptions({ colorOptionId: value }),
                  onColorStateChange: (patch) =>
                    updateSelectedModuleOptions({
                      rawColorState: {
                        ...workingColorState,
                        ...patch,
                      },
                    }),
                  availableOptions: workingColorOptions,
                })}
              </div>
            </details>

            {workingIsGlazed && (
              <details className="group rounded-2xl border border-slate-200 bg-white p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-slate-800">
                  Vitrage / remplissage du module
                  <ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-4">
                <select
                  value={workingConfig.glazingId}
                  onChange={(event) =>
                    updateSelectedModuleOptions({ glazingId: event.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                >
                  {activeModuleFillingMeta.options.map(({ glazing, pricing }) => (
                    <option key={glazing.id} value={glazing.id}>
                      {formatFillingOptionLabel(glazing, pricing)}
                    </option>
                  ))}
                </select>
                {activeModuleFillingMeta.selectedGlazing && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-bold text-slate-800">
                      {activeModuleFillingMeta.selectedGlazing.label}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {getFillingOptionDetails(
                        activeModuleFillingMeta.selectedGlazing,
                        activeModuleFillingMeta.selectedPricing
                      )}
                    </p>
                    {workingConfig.hasSousBassement &&
                      getSoubassementPricingDetails(
                        activeModuleFillingMeta.selectedPricing
                      ) && (
                        <p className="mt-2 text-xs font-semibold text-slate-500">
                          {getSoubassementPricingDetails(
                            activeModuleFillingMeta.selectedPricing
                          )}
                        </p>
                      )}
                  </div>
                )}
                </div>
              </details>
            )}

            {!workingIsVolet && (
              <details className="group rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-slate-800">
                  Options & Accessoires
                  <ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-4 space-y-5">
                  <p className="text-sm text-slate-500">
                    Chaque module garde ses accessoires et son remplissage bas.
                  </p>

                  <div className="grid min-w-0 grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3 min-w-0">
                      <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Grid3X3 size={14} className="text-slate-400" />
                        Petits bois
                      </label>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-500">
                            Horizontales
                          </label>
                          <input
                            type="number"
                            min={0}
                            {...NUMERIC_INPUT_PROPS}
                            value={workingConfig.petitsBoisH}
                            onChange={(event) =>
                              updateSelectedModuleOptions({
                                petitsBoisH: normalizePetitsBoisValue(event.target.value),
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-500">
                            Verticales
                          </label>
                          <input
                            type="number"
                            min={0}
                            {...NUMERIC_INPUT_PROPS}
                            value={workingConfig.petitsBoisV}
                            onChange={(event) =>
                              updateSelectedModuleOptions({
                                petitsBoisV: normalizePetitsBoisValue(event.target.value),
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 min-w-0">
                      <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                        Sens d&apos;ouverture
                      </label>
                      <select
                        value={workingConfig.openingDirection}
                        onChange={(event) =>
                          updateSelectedModuleOptions({
                            openingDirection: event.target.value,
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                      >
                        <option value="standard">Standard</option>
                        <option value="inverse">Inverse</option>
                      </select>
                    </div>

                    <div className="min-w-0">
                      {workingIsPorte ? (
                        <label className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold leading-snug text-slate-700">
                          <input
                            type="checkbox"
                            checked={workingConfig.panneauDecoratif}
                            onChange={(event) =>
                              updateSelectedModuleOptions({
                                panneauDecoratif: event.target.checked,
                              })
                            }
                            className="h-4 w-4 accent-orange-500"
                          />
                          Panneau decoratif
                        </label>
                      ) : (
                        <label className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold leading-snug text-slate-700">
                          <input
                            type="checkbox"
                            checked={workingConfig.hasLockingHandle}
                            onChange={(event) =>
                              updateSelectedModuleOptions({
                                hasLockingHandle: event.target.checked,
                              })
                            }
                            className="h-4 w-4 accent-orange-500"
                          />
                          Poignee verrouillable a cle
                        </label>
                      )}
                    </div>

                    <div className="min-w-0">
                      <label className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold leading-snug text-slate-700">
                        <input
                          type="checkbox"
                          checked={workingConfig.hasSousBassement}
                          onChange={(event) =>
                            updateSelectedModuleOptions({
                              hasSousBassement: event.target.checked,
                            })
                          }
                          className="h-4 w-4 accent-orange-500"
                        />
                        Sous-bassement
                      </label>
                    </div>

                    {workingConfig.hasSousBassement && (
                      <div className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2">
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          <span>Hauteur visible</span>
                          <span>{workingConfig.sousBassementHeight} mm</span>
                        </div>
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_140px] gap-4">
                          <input
                            type="range"
                            min={100}
                            max={Math.max(
                              100,
                              parsePositiveInt(activeCompositeModule?.heightMm, 1000) - 200
                            )}
                            step={10}
                            value={workingConfig.sousBassementHeight}
                            onChange={(event) =>
                              updateSelectedModuleOptions({
                                sousBassementHeight: Number.parseInt(
                                  event.target.value,
                                  10
                                ),
                              })
                            }
                            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-100 accent-orange-500"
                          />
                          <input
                            type="number"
                            min={100}
                            max={Math.max(
                              100,
                              parsePositiveInt(activeCompositeModule?.heightMm, 1000) - 200
                            )}
                            step={10}
                            {...NUMERIC_INPUT_PROPS}
                            value={workingConfig.sousBassementHeight}
                            onChange={(event) =>
                              updateSelectedModuleOptions({
                                sousBassementHeight: Math.max(
                                  100,
                                  Number.parseInt(event.target.value, 10) || 100
                                ),
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                          />
                        </div>
                        {getSoubassementPricingDetails(
                          activeModuleFillingMeta.selectedPricing
                        ) && (
                          <p className="mt-3 text-xs font-semibold text-slate-500">
                            {getSoubassementPricingDetails(
                              activeModuleFillingMeta.selectedPricing
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  {!workingIsVolet && workingSashCount > 0 && !workingIsPorte && (
                    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                      <label className="block text-xs font-bold uppercase tracking-widest text-slate-400">
                        Options par vantail
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Array.from({ length: workingSashCount }).map((_, index) => (
                          <div
                            key={index}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                          >
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Vantail {index + 1}
                            </p>
                            <div className="space-y-2">
                              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={Boolean(workingConfig.sashOptions[index]?.ob)}
                                  onChange={() => updateWorkingSashOption(index, 'ob')}
                                  className="accent-orange-500"
                                />
                                Oscillo-battant
                              </label>
                              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={Boolean(workingConfig.sashOptions[index]?.vent)}
                                  onChange={() => updateWorkingSashOption(index, 'vent')}
                                  className="accent-orange-500"
                                />
                                Grille de ventilation
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </details>
            )}

            {false && workingIsGlazed && (
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-700">
                  Vitrage du module
                </label>
                <div className="grid gap-3">
                  {GLAZING_OPTIONS.map((glazing) => (
                    <label
                      key={glazing.id}
                      className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 p-4 transition-all ${
                        workingConfig.glazingId === glazing.id
                          ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-500/10'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        checked={workingConfig.glazingId === glazing.id}
                        onChange={() =>
                          updateSelectedModuleOptions({ glazingId: glazing.id })
                        }
                        className="h-5 w-5 accent-orange-500"
                      />
                      <div className="flex-1">
                        <span className="block text-sm font-bold text-slate-800">
                          {glazing.shortLabel}
                        </span>
                        <span className="text-sm text-slate-500">
                          Ug={glazing.ug} · g={glazing.g}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 p-4 md:p-6">
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">
                Réglages de l&apos;ensemble
              </label>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Repère
                  </label>
                  <input
                    type="text"
                    value={repere}
                    onChange={(event) => setRepere(event.target.value)}
                    placeholder="Ex : Façade nord"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Quantité
                  </label>
                  <input
                    type="number"
                    min={1}
                    {...NUMERIC_INPUT_PROPS}
                    value={quantity}
                    onChange={(event) =>
                      setQuantity(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Ajustement net
                  </label>
                  <select
                    value={netAdjustmentMode}
                    onChange={(event) => handleNetAdjustmentModeChange(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  >
                    <option value="margin">Marge nette souhaitée</option>
                    <option value="discount">Remise nette souhaitée</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    {netAdjustmentLabel}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    {...DECIMAL_INPUT_PROPS}
                    value={netAdjustmentValue}
                    onChange={(event) => handleNetAdjustmentValueChange(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-700">Remise</label>
                    <span className="rounded-md bg-orange-100 px-2 py-0.5 text-sm font-black text-orange-600">
                      -{remise}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={remise}
                    onChange={(event) =>
                      setRemise(Number.parseInt(event.target.value, 10) || 0)
                    }
                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-orange-500"
                  />
                </div>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={includePose}
                    onChange={(event) => setIncludePose(event.target.checked)}
                    className="h-4 w-4 accent-orange-500"
                  />
                  <Wrench size={14} className="text-slate-400" />
                  Inclure la pose ({getPosePriceForType('menuiserie')} EUR)
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={showThermalData}
                    onChange={(event) => setShowThermalData(event.target.checked)}
                    className="h-4 w-4 accent-orange-500"
                  />
                  Afficher les données thermiques sur le devis
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-6">
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">
                Synthèse du composé
              </label>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Dimensions globales</span>
                  <span className="font-bold text-slate-900">
                    L {compositeDimensions.width} x H {compositeDimensions.height} mm
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Modules</span>
                  <span className="font-bold text-slate-900">{compositeModuleCount}</span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                  {formatCompositeModules(composition)}
                </div>
                <div className="border-t border-slate-200 pt-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Prix composé HT
                  </p>
                  <p className="mt-2 text-2xl font-black text-slate-900">
                    {compositePricing.totalPrice !== null
                      ? `${compositePricing.totalPrice.toFixed(2)} EUR`
                      : 'Dimensions hors grille'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  const summaryContent = (
    <>
      {product &&
        !isCompositeMode &&
        !isWasteManagement &&
        !isCustomProduct &&
        !isTextOnlyProduct &&
        simpleConfig.widthMm &&
        simpleConfig.heightMm &&
        !simplePriceData && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            Les dimensions saisies sont hors de la grille tarifaire pour ce produit.
          </div>
        )}

      {isCompositeMode && compositePricing.hasInvalidModule && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          Au moins un module du composé est hors de la grille tarifaire. Ajustez ses dimensions ou son type.
        </div>
      )}

      {(previewCalc || isWasteManagement || isCustomProduct || isTextOnlyProduct || isCompositeMode) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                {isTextOnlyProduct ? 'Bloc libre' : 'Estimation HT'}
              </p>
              <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                {previewCalc
                  ? `${previewCalc.totalLine.toFixed(2)} EUR`
                  : isWasteManagement
                    ? `${wasteCalculation.totalWastePrice.toFixed(2)} EUR`
                    : isCustomProduct
                      ? `${((Number.parseFloat(customPrice) || 0) * quantity).toFixed(2)} EUR`
                      : isTextOnlyProduct
                        ? 'Element non chiffre'
                      : compositePricing.totalPrice !== null
                        ? `${(compositePricing.totalPrice * quantity).toFixed(2)} EUR`
                        : 'A definir'}
              </p>
              {previewCalc?.posePrice ? (
                <p className="mt-1 text-sm text-slate-500">
                  Pose : {(previewCalc.posePrice * quantity).toFixed(2)} EUR
                </p>
              ) : null}
            </div>

            <button
              onClick={handleAddToCart}
              disabled={
                (isCompositeMode &&
                  (compositePricing.hasInvalidModule || !compositePricing.totalPrice)) ||
                (!isCompositeMode &&
                  !isWasteManagement &&
                  !isCustomProduct &&
                  !isTextOnlyProduct &&
                  !simplePriceData) ||
                (isCustomProduct &&
                  (!customLabel || !Number.isFinite(Number.parseFloat(customPrice)))) ||
                (isTextOnlyProduct && !textOnlyContent.trim())
              }
              className={`inline-flex items-center justify-center gap-3 rounded-2xl px-6 py-4 text-sm font-bold transition-all ${
                (isCompositeMode &&
                  (compositePricing.hasInvalidModule || !compositePricing.totalPrice)) ||
                (!isCompositeMode &&
                  !isWasteManagement &&
                  !isCustomProduct &&
                  !isTextOnlyProduct &&
                  !simplePriceData) ||
                (isCustomProduct &&
                  (!customLabel || !Number.isFinite(Number.parseFloat(customPrice)))) ||
                (isTextOnlyProduct && !textOnlyContent.trim())
                  ? 'cursor-not-allowed bg-slate-200 text-slate-400 shadow-none'
                  : 'bg-orange-500 text-white shadow-xl shadow-orange-500/30 hover:bg-orange-600'
              }`}
            >
              <ShoppingCart size={18} />
              {addButtonLabel}
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      {editingItem && (
        <div className="animate-in fade-in slide-in-from-top-2 rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
                <Pencil size={18} />
              </div>
              <div>
                <p className="text-sm font-bold text-blue-900">Mode edition</p>
                <p className="text-xs text-blue-700">
                  Vous modifiez actuellement <strong>{editingItem.productLabel}</strong>.
                </p>
              </div>
            </div>
            <button
              onClick={onCancelEdit}
              className="rounded-lg p-2 text-blue-500 transition-colors hover:bg-blue-100 hover:text-blue-700"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
        <label className="mb-3 block text-xs font-black uppercase tracking-widest text-slate-400">
          Mode de configuration
        </label>
        <div className="flex w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1 shadow-sm md:w-auto md:flex-row md:gap-0">
          <button
            type="button"
            onClick={() => handleModeChange('simple')}
            className={`w-full rounded-xl px-4 py-2 text-sm font-bold transition-colors md:w-auto ${
              !isCompositeMode
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Menuiserie simple
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('composite')}
            className={`w-full rounded-xl px-4 py-2 text-sm font-bold transition-colors md:w-auto ${
              isCompositeMode
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-slate-500 hover:text-orange-600'
            }`}
          >
            Châssis composé
          </button>
        </div>
      </div>

      {!isCompositeMode && simpleModeContent}
      {isCompositeMode && compositeModeContent}
      {summaryContent}
    </div>
  );
}


