'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
  createCompositeModule,
  createDefaultColorState,
  getCompositeDimensions,
  getCompositeModuleCount,
  getItemThermalMetrics,
  getCompositePricing,
  getDefaultProductVariant,
  getPriceForMm,
  getProductById,
  getProductCategory,
  getMaterialVariantId,
  compositeIncludesPorte,
  getProductVariant,
  getProductType,
  getPosePriceForType,
  calculateItemPrice,
  calculateWasteManagementForItems,
  createCatalogServiceCartItem,
  normalizeCompositeComposition,
  formatCompositeModules,
  WASTE_PRICE_PER_KG,
} from '@/lib/products';
import {
  calculateGlazingAndPanelExtras,
  getSelectedGlazing,
  getFrameSystemForProduct,
  getGlazingOptionsServerSnapshot,
  getGlazingOptionsSnapshot,
  isGlazedProduct,
  calculateGlassAreas,
  calculateGlazingExtra,
  subscribeToGlazingOptions,
  getDefaultGlazingId,
} from '@/lib/glazing';
import MenuiserieVisual from '@/components/MenuiserieVisual';
import CompositeFrameEditor from '@/components/CompositeFrameEditor';
import { getCompositeFramePricing, getCompositeFrameModules } from '@/lib/products';
import { createDefaultFrame, normalizeCompositeFrame } from '@/lib/composite-frame';
import { getEffectiveHandleHeightMm, getNormativeHandleHeightMm } from '@/lib/handle-height';
import WasteRecycleIcon from '@/components/icons/WasteRecycleIcon';
import CustomProductIcon from '@/components/icons/CustomProductIcon';
import TextOnlyIcon from '@/components/icons/TextOnlyIcon';

const ICONS = {
  LayoutGrid,
  ArrowLeftRight,
  DoorOpen,
  DoorClosed,
  Blinds,
  Recycle: WasteRecycleIcon,
  Wrench,
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

const createSimpleConfig = (overrides = {}, material = 'pvc') => ({
  productVariantId: '',
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
  glazingId: getDefaultGlazingId(material),
  hasLockingHandle: false,
  handleHeightMm: '',
  allegeHeightMm: '',
  voletMonobloc: false,
  voletMonoblocManoeuvre: 'manuel',
  ...overrides,
  ...buildPetitsBoisState(overrides),
  rawColorState: createDefaultColorState(overrides.rawColorState),
});

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
  glazingOptions,
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
  const options = glazingOptions.map((glazing) => ({
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
  const isAlu = product.material === 'alu' || /\bALU\b/i.test(product.sheet);
  const isCoulissant = product.sheet.includes('Coulissant');
  let marketingBase = '';

  if (!isVolet) {
    if (isAlu) {
      marketingBase = 'Profiles aluminium Schuco\nRupture de pont thermique';
    } else {
      marketingBase = isCoulissant
        ? "Profiles PVC Schuco\n5 chambres d'isolation avec renforts acier galvanise\nSysteme a double joint d'etancheite"
        : "Profiles PVC Schuco 70 mm\n5 chambres d'isolation avec renforts acier galvanise\nSysteme a double joint d'etancheite";
    }

    if (!isPorte) {
      const handleLabel = isAlu ? 'Poignee Schuco' : 'Poignee Schuco Euro';
      marketingBase += hasLockingHandle
        ? `\n${handleLabel} verrouillable a cle`
        : `\n${handleLabel}`;
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

const HandleHeightField = ({ handleHeightMm, allegeHeightMm, heightMm, onChange }) => {
  const totalHeight = parsePositiveInt(heightMm, 0);
  const allege = parsePositiveInt(allegeHeightMm, 0);
  const centeredMm = getEffectiveHandleHeightMm(null, totalHeight);
  const handleValue = Number.parseInt(handleHeightMm, 10);
  const hasHandle = handleValue > 0;
  const placeholder = centeredMm ? `${centeredMm} (centrée)` : 'Centrée';

  // Renseigner l'allège place automatiquement la poignée aux normes.
  const handleAllegeChange = (raw) => {
    const norm = getNormativeHandleHeightMm(raw, totalHeight);
    if (norm != null) {
      onChange({ allegeHeightMm: raw, handleHeightMm: String(norm) });
    } else {
      onChange({ allegeHeightMm: raw });
    }
  };

  const fromFloor = hasHandle && allege > 0 ? handleValue + allege : null;

  return (
    <div className="space-y-3 md:col-span-2">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">
            Hauteur d&apos;allège
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              {...NUMERIC_INPUT_PROPS}
              value={allegeHeightMm ?? ''}
              placeholder="Non renseignée"
              onChange={(event) => handleAllegeChange(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-10 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-400">
              mm
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Du sol au bas de la menuiserie.</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">
            Hauteur de poignée
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={totalHeight > 0 ? totalHeight : undefined}
              {...NUMERIC_INPUT_PROPS}
              value={handleHeightMm ?? ''}
              placeholder={placeholder}
              onChange={(event) => onChange({ handleHeightMm: event.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-20 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-400">
              mm{' '}
              {hasHandle && (
                <button
                  type="button"
                  onClick={() => onChange({ handleHeightMm: '' })}
                  className="pointer-events-auto ml-2 rounded-md px-1.5 py-0.5 text-orange-600 hover:bg-orange-50"
                >
                  Centrer
                </button>
              )}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {fromFloor != null
              ? `Soit ${fromFloor} mm du sol.`
              : 'Depuis le bas. Vide = centrée.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default function ProductSelector({
  onAddToCart,
  cartItems = [],
  editingItem,
  onCancelEdit,
}) {
  const glazingOptions = useSyncExternalStore(
    subscribeToGlazingOptions,
    getGlazingOptionsSnapshot,
    getGlazingOptionsServerSnapshot
  );
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0].id);
  const [selectedMaterial, setSelectedMaterial] = useState('pvc');
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
  const [customHasDimensions, setCustomHasDimensions] = useState(false);
  const [customWidthMm, setCustomWidthMm] = useState('');
  const [customHeightMm, setCustomHeightMm] = useState('');
  const [textOnlyContent, setTextOnlyContent] = useState('');
  // Modèle « ossature » v2 : source de vérité du nouveau constructeur.
  const [compositeFrame, setCompositeFrame] = useState(() => createDefaultFrame(1080, 2150, 0, 0));
  // Ouverture sélectionnée dans l'éditeur composé : pilote le formulaire de config réutilisé.
  const [selectedCompositeOpeningId, setSelectedCompositeOpeningId] = useState(null);
  const compositeSyncRef = useRef({ openingId: null, productId: null });
  // Matériau du châssis composé (PVC ou aluminium) : s'applique à tous les modules.
  const [compositeMaterial, setCompositeMaterial] = useState('pvc');

  const category = CATEGORIES.find((entry) => entry.id === selectedCategory);
  // La catégorie propose une déclinaison aluminium si elle contient des produits alu.
  const categorySupportsMaterial = (category?.products || []).some(
    (entry) => entry.material === 'alu'
  );
  // Produits affichés : filtrés par matériau choisi (PVC/Alu) ; les produits
  // sans matériau (volets, services) restent toujours visibles.
  const categoryProducts = (category?.products || []).filter(
    (entry) => !entry.material || entry.material === selectedMaterial
  );
  const categoryProduct = selectedProduct
    ? category?.products.find((entry) => entry.id === selectedProduct) || null
    : null;
  const product = selectedProduct
    ? getProductById(selectedProduct) || categoryProduct
    : null;

  const isWasteManagement = product?.id === 'gestion-dechets';
  const isCustomProduct = product?.id === 'custom-product';
  const isTextOnlyProduct = product?.id === 'text-only';
  const isCatalogService = product?.pricingMode === 'service';
  const isFixedPriceProduct = product?.pricingMode === 'fixed';
  const selectedProductVariant = isFixedPriceProduct
    ? getProductVariant(product, simpleConfig.productVariantId)
    : null;
  const defaultProductVariant = isFixedPriceProduct
    ? getDefaultProductVariant(product)
    : null;
  const netAdjustmentValue =
    netAdjustmentMode === 'discount' ? netDiscountWanted : netMarginWanted;
  const netAdjustmentLabel =
    netAdjustmentMode === 'discount'
      ? 'Remise nette souhaitée'
      : 'Marge nette souhaitée';

  const compositePricing = useMemo(
    () => getCompositeFramePricing(compositeFrame),
    [compositeFrame]
  );
  const compositeDimensions = {
    width: compositePricing.totalWidth,
    height: compositePricing.totalHeight,
  };
  const compositeModuleCount = compositePricing.modules.length;

  // SYNCHRO « formulaire simple ↔ châssis sélectionné ».
  /* eslint-disable react-hooks/set-state-in-effect */
  // 1) Sélection (ou changement de type) -> CHARGE la config du châssis dans le formulaire.
  useEffect(() => {
    if (!isCompositeMode) return;
    const openingId = selectedCompositeOpeningId;
    const placement = openingId ? compositeFrame.placements[openingId] : null;
    const productId = placement?.productId || null;
    const previous = compositeSyncRef.current;
    if (previous.openingId === openingId && previous.productId === productId) return;
    compositeSyncRef.current = { openingId, productId };
    if (placement && productId) {
      const opening = compositePricing.openings.find((entry) => entry.id === openingId);
      setSelectedProduct(productId);
      setSimpleConfig(
        createSimpleConfig(
          {
            ...(placement.options || {}),
            widthMm: opening?.wMm ?? placement.computedWidthMm,
            heightMm: opening?.hMm ?? placement.computedHeightMm,
          },
          /-alu$/i.test(productId) ? 'alu' : 'pvc'
        )
      );
    }
  }, [selectedCompositeOpeningId, compositeFrame, isCompositeMode, compositePricing.openings]);

  // 2) Édition du formulaire -> RÉÉCRIT les options dans le châssis sélectionné.
  useEffect(() => {
    if (!isCompositeMode || !selectedCompositeOpeningId) return;
    setCompositeFrame((previous) => {
      const placement = previous.placements[selectedCompositeOpeningId];
      if (!placement) return previous;
      return {
        ...previous,
        placements: {
          ...previous.placements,
          [selectedCompositeOpeningId]: { ...placement, options: simpleConfig },
        },
      };
    });
  }, [simpleConfig, selectedCompositeOpeningId, isCompositeMode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Vrai quand on configure un châssis placé dans l'ouverture sélectionnée du composé.
  const isChassisConfig =
    isCompositeMode &&
    Boolean(selectedCompositeOpeningId) &&
    Boolean(compositeFrame.placements[selectedCompositeOpeningId]);
  // Catalogue de châssis proposé dans l'éditeur, GROUPÉ par type de menuiserie
  // (Fenêtres, Portes, Portes d'entrée…) et filtré par matériau PVC/Alu.
  const compositeChassisCatalog = useMemo(() => {
    const seen = new Set();
    return COMPOSITE_MODULE_TYPES.map((category) => ({
      category: category.label || category.id,
      items: category.products
        .map((entry) => ({
          id: getMaterialVariantId(entry.id, compositeMaterial),
          label: entry.shortLabel || entry.label,
        }))
        .filter((entry) => {
          if (seen.has(entry.id)) return false;
          seen.add(entry.id);
          return true;
        }),
    })).filter((group) => group.items.length > 0);
  }, [compositeMaterial]);
  const resolveCompositeChassisLabel = (id) => {
    const definition = getProductById(id);
    return definition?.shortLabel || definition?.label || id || 'Châssis';
  };

  // En composé, `product`/`simpleConfig` sont synchronisés sur le châssis sélectionné
  // (voir effets de synchro plus bas), donc le formulaire simple pilote directement
  // le châssis : réutilisation totale, sans formulaire parallèle.
  const formProduct = product;
  const workingConfig = simpleConfig;
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
  // L'option « Volet roulant monobloc » est réservée aux fenêtres,
  // portes-fenêtres et coulissants (jamais volets seuls ni portes d'entrée).
  const workingSupportsMonobloc = ['fenetres', 'portes-fenetres', 'coulissants'].includes(
    formProduct?.categoryId || ''
  );

  const simplePriceData =
    !isCompositeMode &&
    product &&
    !isWasteManagement &&
    !isCustomProduct &&
    !isCatalogService &&
    !isTextOnlyProduct
      ? isFixedPriceProduct
        ? selectedProductVariant
          ? {
              price: selectedProductVariant.priceHt,
              billedHeight: null,
              billedWidth: null,
            }
          : null
        : simpleConfig.heightMm && simpleConfig.widthMm
          ? getPriceForMm(
              product.sheet,
              parsePositiveInt(simpleConfig.heightMm),
              parsePositiveInt(simpleConfig.widthMm)
            )
          : null
      : null;

  const addButtonLabel = editingItem
    ? isTextOnlyProduct
      ? 'Mettre à jour le texte'
      : isCatalogService
        ? 'Mettre à jour le service'
      : 'Mettre à jour le produit'
    : isCompositeMode
      ? 'Ajouter le châssis composé'
      : isTextOnlyProduct
        ? 'Insérer le texte'
        : isCatalogService
          ? 'Ajouter le service'
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
    glazingOptions,
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

  const wasteCalculation = useMemo(
    () => calculateWasteManagementForItems(cartItems),
    [cartItems]
  );

  const simpleMarketing = getMarketingDetails({
    product,
    colorOptionId: simpleConfig.colorOptionId,
    colorState: simpleConfig.rawColorState,
    hasLockingHandle: simpleConfig.hasLockingHandle,
    panneauDecoratif: simpleConfig.panneauDecoratif,
  });

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

    if (isCatalogService) {
      return createCatalogServiceCartItem(product?.id);
    }

    if (isCompositeMode) {
      // `totalPrice === 0` est VALIDE (grilles alu à 0 € : le prix vient de la
      // marge nette souhaitée) — seul `null` (vide / hors grille) bloque.
      if (compositePricing.totalPrice === null || compositePricing.hasInvalidModule) return null;
      const compositePreviewItem = {
        productId: 'composite-builder',
        productLabel: 'Châssis composé',
        sheetName: 'Châssis composé',
        widthMm: compositePricing.totalWidth,
        heightMm: compositePricing.totalHeight,
        unitPrice: compositePricing.totalPrice,
        quantity,
        includePose,
        remise,
        netMarginWanted,
        netDiscountWanted,
        isComposite: true,
        compositeFrame,
        voletMonobloc: Boolean(compositeFrame.voletMonobloc),
        voletMonoblocManoeuvre: compositeFrame.voletMonoblocManoeuvre || 'manuel',
        modules: compositePricing.modules,
      };
      const thermalMetrics = getItemThermalMetrics(compositePreviewItem);
      return {
        ...compositePreviewItem,
        thermalUw: thermalMetrics?.thermalUw ?? null,
        thermalSw: thermalMetrics?.thermalSw ?? null,
      };
    }

    if (isFixedPriceProduct) {
      const variant = selectedProductVariant || defaultProductVariant;
      if (!product || !variant || !simplePriceData) return null;

      return {
        productId: product.id,
        productVariantId: variant.id,
        productLabel: variant.label,
        sheetName: product.sheet,
        widthMm: 0,
        heightMm: 0,
        unitPrice: simplePriceData.price,
        quantity,
        includePose: false,
        remise,
        netMarginWanted,
        netDiscountWanted,
        customDescription: variant.designation,
        customDescriptionManual: false,
        customImage: variant.imageSrc,
        hasDimensions: false,
        dimensionLabel: 'Accessoire',
      };
    }

    if (!product || !simplePriceData) return null;

    const simplePreviewItem = {
      productId: product.id,
      sheetName: product.sheet,
      material: product.material ?? null,
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
      handleHeightMm: !workingIsVolet ? simpleConfig.handleHeightMm : null,
      allegeHeightMm: !workingIsVolet ? simpleConfig.allegeHeightMm : null,
      voletMonobloc: workingSupportsMonobloc && simpleConfig.voletMonobloc,
      voletMonoblocManoeuvre: workingSupportsMonobloc
        ? simpleConfig.voletMonoblocManoeuvre
        : 'manuel',
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

  const resetSimpleSelection = ({ preserveConfiguration = false } = {}) => {
    setSimpleConfig((previous) =>
      preserveConfiguration
        ? createSimpleConfig(previous, selectedMaterial)
        : createSimpleConfig({}, selectedMaterial)
    );
    setCustomLabel('');
    setCustomDescription('');
    setCustomPrice('');
    setCustomImage(null);
    setCustomHasDimensions(false);
    setCustomWidthMm('');
    setCustomHeightMm('');
    setTextOnlyContent('');
  };

  const resetCompositeSelection = () => {
    setCompositeFrame(createDefaultFrame(1080, 2150, 0, 0));
    setCompositeMaterial('pvc');
  };

  const resetGlobalCommercialFields = () => {
    setQuantity(1);
    setIncludePose(false);
    setRemise(0);
    setNetAdjustmentMode('margin');
    setNetMarginWanted(0);
    setNetDiscountWanted(0);
    setRepere('');
    // L'aluminium repart avec les données thermiques décochées.
    const activeMaterial = isCompositeMode ? compositeMaterial : selectedMaterial;
    setShowThermalData(activeMaterial !== 'alu');
  };

  const handleCategoryChange = (categoryId) => {
    setSelectedCategory(categoryId);
    setSelectedProduct(null);
    resetSimpleSelection({ preserveConfiguration: true });
  };

  const handleProductChange = (productId) => {
    setSelectedProduct(productId);
    resetSimpleSelection({ preserveConfiguration: true });
  };

  const handleMaterialChange = (material) => {
    if (material === selectedMaterial) return;
    setSelectedMaterial(material);
    setSelectedProduct(null);
    // Données thermiques décochées par défaut en aluminium (intégrées si coché).
    setShowThermalData(material !== 'alu');
    // Repart sur le vitrage standard du matériau (PVC 4/20/4, Alu 4/16/4).
    setSimpleConfig((previous) => ({
      ...createSimpleConfig(previous, material),
      glazingId: getDefaultGlazingId(material),
    }));
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

  const updateWorkingSashOption = (index, optionKey) => {
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

  const handleCompositeMaterialChange = (material) => {
    if (material === compositeMaterial) return;
    setCompositeMaterial(material);
    // Données thermiques décochées par défaut en aluminium (intégrées si coché).
    setShowThermalData(material !== 'alu');
  };

  /* eslint-disable react-hooks/set-state-in-effect */
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
      const frame = normalizeCompositeFrame(
        editingItem.compositeFrame ??
          editingItem.composition ??
          editingItem.compositionTree ??
          editingItem.modules
      );
      setIsCompositeMode(true);
      setCompositeFrame(frame);
      const hasAlu = Object.values(frame.placements || {}).some((placement) =>
        /-alu$/i.test(placement.productId || '')
      );
      setCompositeMaterial(hasAlu ? 'alu' : 'pvc');
      return;
    }

    setIsCompositeMode(false);
    const nextCategory = getProductCategory(editingItem.productId) || CATEGORIES[0].id;
    setSelectedCategory(nextCategory);
    setSelectedMaterial(getProductById(editingItem.productId)?.material || 'pvc');
    setSelectedProduct(editingItem.productId);

    if (editingItem.productId === 'custom-product') {
      setCustomLabel(editingItem.productLabel || '');
      setCustomDescription(editingItem.customDescription || '');
      setCustomPrice(editingItem.customPrice?.toString() || '');
      setCustomImage(editingItem.customImage || null);
      setCustomHasDimensions(Boolean(editingItem.customHasDimensions));
      setCustomWidthMm(editingItem.customHasDimensions ? (editingItem.widthMm?.toString() || '') : '');
      setCustomHeightMm(editingItem.customHasDimensions ? (editingItem.heightMm?.toString() || '') : '');
      return;
    }

    if (editingItem.productId === 'text-only') {
      setTextOnlyContent(editingItem.textContent || '');
      return;
    }

    setSimpleConfig(
      createSimpleConfig({
        productVariantId: editingItem.productVariantId || '',
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
        handleHeightMm: editingItem.handleHeightMm ?? '',
        allegeHeightMm: editingItem.allegeHeightMm ?? '',
        voletMonobloc: editingItem.voletMonobloc || false,
        voletMonoblocManoeuvre: editingItem.voletMonoblocManoeuvre || 'manuel',
      })
    );
  }, [editingItem]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleModeChange = (nextMode) => {
    setIsCompositeMode(nextMode === 'composite');
  };

  const handleAddToCart = () => {
    if (isCompositeMode) {
      if (compositePricing.hasInvalidModule || compositePricing.totalPrice === null) return;

      const frameModules = getCompositeFrameModules(compositeFrame).map((frameModule) => {
        const productDefinition = getProductById(frameModule.productId);
        const marketing = getMarketingDetails({
          product: productDefinition,
          colorOptionId: frameModule.options.colorOptionId,
          colorState: frameModule.options.rawColorState,
          hasLockingHandle: frameModule.options.hasLockingHandle,
          panneauDecoratif: frameModule.options.panneauDecoratif,
        });
        return {
          ...frameModule,
          productLabel: productDefinition?.label || frameModule.productId,
          rawColorState: frameModule.options.rawColorState,
          ...buildPetitsBoisState(frameModule.options),
          panneauDecoratif: frameModule.options.panneauDecoratif,
          hasSousBassement: frameModule.options.hasSousBassement,
          sousBassementHeight: frameModule.options.sousBassementHeight,
          sashOptions: frameModule.options.sashOptions,
          openingDirection: frameModule.options.openingDirection,
          hasLockingHandle: frameModule.options.hasLockingHandle,
          handleHeightMm: frameModule.options.handleHeightMm,
          allegeHeightMm: frameModule.options.allegeHeightMm,
          marketingBase: marketing.marketingBase,
          marketingFinition: marketing.marketingFinition,
          svgColor: marketing.svgColor,
        };
      });

      const nextCompositeItem = {
        id: editingItem ? editingItem.id : createCartItemId(),
        productId: 'composite-builder',
        productLabel: 'Châssis composé',
        sheetName: 'Châssis composé',
        material: compositeMaterial,
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
        compositeFrame,
        voletMonobloc: Boolean(compositeFrame.voletMonobloc),
        voletMonoblocManoeuvre: compositeFrame.voletMonoblocManoeuvre || 'manuel',
        modules: frameModules,
        modulePricing: frameModules,
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

    if (isCatalogService) {
      const serviceItem = createCatalogServiceCartItem(product.id, {
        id: editingItem ? editingItem.id : createCartItemId(),
      });
      if (!serviceItem) return;

      onAddToCart(serviceItem);

      resetSimpleSelection();
      resetGlobalCommercialFields();
      return;
    }

    if (isCustomProduct) {
      const parsedCustomPrice = Number.parseFloat(customPrice);
      if (!customLabel || !Number.isFinite(parsedCustomPrice)) return;

      const parsedWidthMm = Math.max(0, Number.parseInt(customWidthMm, 10) || 0);
      const parsedHeightMm = Math.max(0, Number.parseInt(customHeightMm, 10) || 0);

      onAddToCart({
        id: editingItem ? editingItem.id : createCartItemId(),
        productId: product.id,
        productLabel: customLabel,
        customDescription,
        customPrice: parsedCustomPrice,
        customImage,
        customHasDimensions: customHasDimensions && parsedWidthMm > 0 && parsedHeightMm > 0,
        widthMm: customHasDimensions ? parsedWidthMm : 0,
        heightMm: customHasDimensions ? parsedHeightMm : 0,
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

    if (isFixedPriceProduct) {
      const variant = selectedProductVariant || defaultProductVariant;
      if (!product || !variant || !simplePriceData) return;

      onAddToCart({
        id: editingItem ? editingItem.id : createCartItemId(),
        productId: product.id,
        productVariantId: variant.id,
        productLabel: variant.label,
        sheetName: product.sheet,
        widthMm: 0,
        heightMm: 0,
        billedHeightCm: null,
        billedWidthCm: null,
        quantity,
        unitPrice: simplePriceData.price,
        includePose: false,
        remise,
        netAdjustmentMode,
        netMarginWanted,
        netDiscountWanted,
        customDescription: variant.designation,
        customDescriptionManual: false,
        customImage: variant.imageSrc,
        hasDimensions: false,
        dimensionLabel: 'Accessoire',
        repere,
        showThermalData: false,
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
      material: product.material ?? null,
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
      handleHeightMm: !workingIsVolet ? simpleConfig.handleHeightMm : null,
      allegeHeightMm: !workingIsVolet ? simpleConfig.allegeHeightMm : null,
      voletMonobloc: workingSupportsMonobloc && simpleConfig.voletMonobloc,
      voletMonoblocManoeuvre: workingSupportsMonobloc
        ? simpleConfig.voletMonoblocManoeuvre
        : 'manuel',
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

  // Champs de configuration menuiserie (réutilisés tels quels par le composé).
  const menuiserieConfigFields = (
    <>
          {!isFixedPriceProduct && (
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
          )}

          {!isFixedPriceProduct && workingIsGlazed && (
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

          {!isFixedPriceProduct && !workingIsVolet && (
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
                    // En composé, l'option reste dans la config du châssis (pas de repère
                    // au-dessus) ; en simple elle est remontée sous le schéma + repère.
                    isCompositeMode ? (
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
                    ) : null
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

                  <HandleHeightField
                    handleHeightMm={simpleConfig.handleHeightMm}
                    allegeHeightMm={simpleConfig.allegeHeightMm}
                    heightMm={simpleConfig.heightMm}
                    onChange={(changes) => updateSimpleOptions(changes)}
                  />

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

                {workingSupportsMonobloc && !isCompositeMode && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={simpleConfig.voletMonobloc}
                        onChange={(event) =>
                          updateSimpleOptions({ voletMonobloc: event.target.checked })
                        }
                        className="h-4 w-4 accent-orange-500"
                      />
                      Volet roulant monobloc (intégré)
                    </label>

                    {simpleConfig.voletMonobloc && (
                      <div className="mt-4">
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Manœuvre / motorisation
                        </label>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {[
                            { id: 'manuel', label: 'Manuel' },
                            { id: 'filaire', label: 'Filaire' },
                            { id: 'radio', label: 'Radio' },
                            { id: 'solaire', label: 'Solaire' },
                          ].map((option) => {
                            const isActive =
                              simpleConfig.voletMonoblocManoeuvre === option.id;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() =>
                                  updateSimpleOptions({ voletMonoblocManoeuvre: option.id })
                                }
                                className={`rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-all ${
                                  isActive
                                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                }`}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                          La pose de l&apos;ensemble menuiserie + volet reste facturée une
                          seule fois (pas de pose en double).
                        </p>
                      </div>
                    )}
                  </div>
                )}

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
                {glazingOptions.map((glazing) => {
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
    </>
  );
  // Contrôles commerciaux (quantité, ajustement net, remise, pose) réutilisés par le composé.
  const commercialControls = (
    <>
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

          {!isFixedPriceProduct && (
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={includePose}
              onChange={(event) => setIncludePose(event.target.checked)}
              className="h-4 w-4 accent-orange-500"
            />
            <Wrench size={14} className="text-slate-400" />
            Inclure la pose (
            {getPosePriceForType(getProductType(product?.sheet))} EUR
            )
          </label>
          )}

          {!isFixedPriceProduct && (
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={showThermalData}
              onChange={(event) => setShowThermalData(event.target.checked)}
              className="h-4 w-4 accent-orange-500"
            />
            Afficher les données thermiques sur le devis
          </label>
          )}
    </>
  );
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

        {categorySupportsMaterial && (
          <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:mb-5">
            {[
              { id: 'pvc', label: 'PVC' },
              { id: 'alu', label: 'Aluminium' },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleMaterialChange(option.id)}
                className={`rounded-lg px-5 py-2 text-sm font-bold transition-all ${
                  selectedMaterial === option.id
                    ? 'bg-slate-900 text-white shadow'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categoryProducts.map((entry) => (
            <button
              key={entry.id}
              onClick={() => handleProductChange(entry.id)}
              className={`group flex min-h-[6rem] flex-col items-center justify-between rounded-2xl border-2 p-3 text-center text-sm font-bold transition-all sm:min-h-[8rem] sm:p-4 ${
                selectedProduct === entry.id
                  ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-md'
                  : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="mb-2 h-12 w-12 shrink-0 opacity-90 transition-transform duration-300 group-hover:scale-105 sm:mb-3 sm:h-16 sm:w-16">
                {entry.id === 'gestion-dechets' ? (
                  <div className="flex h-full w-full items-center justify-center rounded-xl border border-green-100 bg-green-50 text-green-600">
                    <WasteRecycleIcon size={32} />
                  </div>
                ) : entry.id === 'custom-product' ? (
                  <div className="flex h-full w-full items-center justify-center rounded-xl border border-orange-100 bg-orange-50 text-orange-500">
                    <CustomProductIcon size={32} />
                  </div>
                ) : entry.id === 'text-only' ? (
                  <div className="flex h-full w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
                    <TextOnlyIcon size={32} />
                  </div>
                ) : entry.previewImageSrc ? (
                  <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <Image
                      src={entry.previewImageSrc}
                      alt={entry.label}
                      fill
                      sizes="64px"
                      className="object-contain p-1"
                    />
                  </div>
                ) : (
                  <MenuiserieVisual
                    sheetName={entry.sheet}
                    width={entry.sheet.startsWith('Porte Entr') ? 900 : 1200}
                    height={entry.sheet.startsWith('Porte Entr') ? 2150 : 1250}
                    options={{ productId: entry.id, colorOption: { id: 'blanc' } }}
                    className="h-full w-full"
                  />
                )}
              </div>
              <span className="line-clamp-2 max-w-full break-words leading-tight">
                {entry.shortLabel}
              </span>
            </button>
          ))}
        </div>
      </div>

      {product && isCatalogService && (
        <div className="border-b border-slate-100 px-4 py-5 sm:px-6 sm:py-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
            <div className="min-w-0 space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                Service offert
              </p>
              <h3 className="break-words text-2xl font-black leading-tight text-slate-900">
                {product.label}
              </h3>
              <p className="text-sm leading-relaxed text-slate-600">
                {product.designation}
              </p>
              <p className="text-sm font-black text-green-700">
                {Number(product.servicePriceHt || 0).toFixed(2)} EUR HT
              </p>
            </div>
            {product.previewImageSrc && (
              <div className="relative mx-auto h-40 w-full max-w-[220px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <Image
                  src={product.previewImageSrc}
                  alt={product.label}
                  fill
                  sizes="220px"
                  className="object-contain p-4"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {product && !isWasteManagement && !isCustomProduct && !isTextOnlyProduct && !isCatalogService && (
        <div className="border-b border-slate-100 px-4 pt-4 sm:px-6 sm:pt-6">
          {isFixedPriceProduct && (selectedProductVariant || defaultProductVariant) ? (
            <div className="grid gap-6 py-2 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
              <div className="space-y-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Produit additionnel volet roulant
                </p>
                <div>
                  <h3 className="break-words text-2xl font-black text-slate-900">
                    {(selectedProductVariant || defaultProductVariant)?.label}
                  </h3>
                  <p className="mt-2 text-sm font-semibold text-orange-600">
                    {(selectedProductVariant || defaultProductVariant)?.useCase}
                  </p>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
                  {(selectedProductVariant || defaultProductVariant)?.designation}
                </p>
                <p className="text-sm font-black text-slate-900">
                  {((selectedProductVariant || defaultProductVariant)?.priceHt || 0).toFixed(2)} EUR HT
                </p>
              </div>
              <div className="relative mx-auto h-56 w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
                <Image
                  src={(selectedProductVariant || defaultProductVariant)?.imageSrc}
                  alt={(selectedProductVariant || defaultProductVariant)?.label || product.label}
                  fill
                  sizes="(max-width: 1024px) 100vw, 320px"
                  className="object-contain p-4"
                />
              </div>
            </div>
          ) : (
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
                handleHeightMm: simpleConfig.handleHeightMm,
                productId: product.id,
                svgColor: simpleMarketing.svgColor,
                voletMonobloc: workingSupportsMonobloc && simpleConfig.voletMonobloc,
                voletMonoblocManoeuvre: simpleConfig.voletMonoblocManoeuvre,
              }}
              className="h-48 sm:h-72 md:h-80"
            />
          )}
        </div>
      )}

      {product && !isWasteManagement && !isCatalogService && !isTextOnlyProduct && (
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
          {/* Porte d'entrée : option panneau décoratif mise en avant (sous le schéma + repère). */}
          {workingIsPorte && (
            <label className="mt-3 flex items-center gap-3 rounded-xl border border-orange-200 bg-white p-3 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={simpleConfig.panneauDecoratif}
                onChange={(event) =>
                  updateSimpleOptions({ panneauDecoratif: event.target.checked })
                }
                className="h-4 w-4 accent-orange-500"
              />
              Panneau décoratif (choisi sur catalogue à la signature)
            </label>
          )}
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
                <div className="relative h-64 w-full">
                  <Image
                    src={customImage}
                    alt="Aperçu du produit personnalisé"
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 512px"
                    className="rounded-xl object-contain"
                  />
                </div>
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

          {/* Produit sur mesure — L × H for waste management */}
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={customHasDimensions}
                onChange={(event) => setCustomHasDimensions(event.target.checked)}
                className="h-4 w-4 rounded accent-orange-500"
              />
              <span className="text-sm font-bold text-slate-700">
                Produit sur mesure
              </span>
              <span className="text-xs text-slate-400">
                (dimensions pour gestion des déchets)
              </span>
            </label>

            {customHasDimensions && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Largeur (mm)
                  </label>
                  <input
                    type="number"
                    {...NUMERIC_INPUT_PROPS}
                    min={0}
                    value={customWidthMm}
                    onChange={(event) => setCustomWidthMm(event.target.value)}
                    placeholder="Ex : 1200"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Hauteur (mm)
                  </label>
                  <input
                    type="number"
                    {...NUMERIC_INPUT_PROPS}
                    min={0}
                    value={customHeightMm}
                    onChange={(event) => setCustomHeightMm(event.target.value)}
                    placeholder="Ex : 1400"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </div>
              </div>
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

      {product && !isWasteManagement && !isCustomProduct && !isCatalogService && !isTextOnlyProduct && (
        <div className="space-y-6 p-4 md:p-6">
          {isFixedPriceProduct && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5">
              <div className="mb-4">
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400">
                  Choix de la box
                </label>
                <p className="mt-2 text-sm text-slate-500">
                  Selectionnez la box adaptee a la motorisation installee.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {product.variants?.map((variant) => {
                  const isActive =
                    (selectedProductVariant || defaultProductVariant)?.id === variant.id;

                  return (
                    <label
                      key={variant.id}
                      className={`cursor-pointer rounded-2xl border-2 bg-white p-4 transition-all ${
                        isActive
                          ? 'border-orange-500 shadow-lg shadow-orange-500/10'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        checked={isActive}
                        onChange={() =>
                          updateSimpleOptions({ productVariantId: variant.id })
                        }
                        className="sr-only"
                      />
                      <div className="flex flex-col gap-4">
                        <div className="relative h-40 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                          <Image
                            src={variant.imageSrc}
                            alt={variant.label}
                            fill
                            sizes="(max-width: 1024px) 100vw, 320px"
                            className="object-contain p-3"
                          />
                        </div>
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-black text-slate-900">
                                {variant.label}
                              </p>
                              <p className="mt-1 break-words text-xs font-semibold uppercase tracking-wide text-orange-600">
                                {variant.useCase}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-600">
                              {variant.priceHt.toFixed(2)} EUR HT
                            </span>
                          </div>
                          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                            {variant.designation}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {!isFixedPriceProduct && (
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
          )}

          {menuiserieConfigFields}

          {commercialControls}
        </div>
      )}
    </div>
  );
  const compositeModeContent = (
    <div className="w-full max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/70 p-4 md:p-6">
        <h3 className="text-lg font-black text-slate-900">Constructeur de châssis composés</h3>
        <p className="mt-1 text-sm text-slate-500">
          Onglet <strong>1 · Structure</strong> : réglez les dimensions, ajoutez des
          colonnes / lignes et cliquez un tronçon pour le supprimer. Onglet
          <strong> 2 · Châssis</strong> : placez un châssis dans chaque ouverture.
        </p>
        <div className="mt-3 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {[
            { id: 'pvc', label: 'PVC' },
            { id: 'alu', label: 'Aluminium' },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => handleCompositeMaterialChange(option.id)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                compositeMaterial === option.id
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-6">
        <CompositeFrameEditor
          frame={compositeFrame}
          onChange={setCompositeFrame}
          chassisCatalog={compositeChassisCatalog}
          resolveChassisLabel={resolveCompositeChassisLabel}
          onSelectedOpeningChange={setSelectedCompositeOpeningId}
        />
      </div>

      {isChassisConfig && (
        <div className="border-t border-slate-100 p-4 md:p-6">
          <p className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">
            Configuration du châssis sélectionné
          </p>
          <div className="space-y-4">{menuiserieConfigFields}</div>
        </div>
      )}

      <div className="border-t border-slate-100 p-4 md:p-6">
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(compositeFrame.voletMonobloc)}
            onChange={(event) =>
              setCompositeFrame((previous) => ({ ...previous, voletMonobloc: event.target.checked }))
            }
            className="h-4 w-4 accent-orange-500"
          />
          Volet roulant monobloc intégré (un seul coffre sur tout le châssis)
        </label>
        {compositeFrame.voletMonobloc && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { id: 'manuel', label: 'Manuel' },
              { id: 'filaire', label: 'Filaire' },
              { id: 'radio', label: 'Radio' },
              { id: 'solaire', label: 'Solaire' },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() =>
                  setCompositeFrame((previous) => ({
                    ...previous,
                    voletMonoblocManoeuvre: option.id,
                  }))
                }
                className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-all ${
                  (compositeFrame.voletMonoblocManoeuvre || 'manuel') === option.id
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4 border-t border-slate-100 p-4 md:p-6">
        {commercialControls}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 p-4 md:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {compositeFrame.overallWidthMm} × {compositeFrame.overallHeightMm} mm · {compositeModuleCount} châssis
          </p>
          <p className="text-2xl font-black text-slate-900">
            {compositePricing.totalPrice != null
              ? `${compositePricing.totalPrice.toFixed(2)} €`
              : compositePricing.hasInvalidModule
                ? 'Hors grille tarifaire'
                : 'À compléter — placez au moins un châssis'}
          </p>
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
        !isCatalogService &&
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

      {(previewCalc || isWasteManagement || isCustomProduct || isTextOnlyProduct || isCompositeMode || isCatalogService) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                {isTextOnlyProduct
                  ? 'Bloc libre'
                  : isCatalogService
                    ? 'Service offert'
                    : 'Estimation HT'}
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
                  (compositePricing.hasInvalidModule || compositePricing.totalPrice === null)) ||
                (!isCompositeMode &&
                  !isWasteManagement &&
                  !isCustomProduct &&
                  !isCatalogService &&
                  !isTextOnlyProduct &&
                  !simplePriceData) ||
                (isCustomProduct &&
                  (!customLabel || !Number.isFinite(Number.parseFloat(customPrice)))) ||
                (isTextOnlyProduct && !textOnlyContent.trim())
              }
              className={`inline-flex items-center justify-center gap-3 rounded-2xl px-6 py-4 text-sm font-bold transition-all ${
                (isCompositeMode &&
                  (compositePricing.hasInvalidModule || compositePricing.totalPrice === null)) ||
                (!isCompositeMode &&
                  !isWasteManagement &&
                  !isCustomProduct &&
                  !isCatalogService &&
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


