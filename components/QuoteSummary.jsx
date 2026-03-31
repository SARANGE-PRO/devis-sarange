import React, { useState, useMemo } from 'react';
import {
  calculateItemPrice,
  formatCompositeModules,
  getCompositeModuleCount,
  getItemPricingSummary,
} from '@/lib/products';
import { generateDesignation } from '@/lib/designation-generator';
import { User, MapPin, Phone, Mail, FileText, Download, CheckCircle, AlertCircle, Package, Pencil, Check, X } from 'lucide-react';
import MenuiserieVisual from '@/components/MenuiserieVisual';
import WasteRecycleIcon from '@/components/icons/WasteRecycleIcon';

const getPetitsBoisConfig = (item = {}) => {
  const legacyValue = Math.max(0, Number.parseInt(item.petitsBois, 10) || 0);
  const petitsBoisH = Math.max(0, Number.parseInt(item.petitsBoisH, 10) || 0);
  const petitsBoisV = Math.max(
    0,
    Number.parseInt(item.petitsBoisV ?? (item.petitsBoisH == null ? legacyValue : 0), 10) || 0
  );

  return { petitsBoisH, petitsBoisV };
};

export default function QuoteSummary({ clientData, cartItems, tvaRate, setTvaRate, onGoBack, onNext, onUpdateItem }) {
  const [editingDesignationId, setEditingDesignationId] = useState(null);
  const [tempDesignation, setTempDesignation] = useState('');
  const [certifyTva, setCertifyTva] = useState(false);

  const totals = useMemo(() => {
    let totalHT = 0;
    cartItems.forEach((item) => {
      const calc = calculateItemPrice(item);
      totalHT += calc.totalLine;
      if (item.includePose) {
        totalHT += calc.posePrice * item.quantity;
      }
    });
    const tva = Math.round(totalHT * (tvaRate / 100) * 100) / 100;
    const totalTTC = Math.round((totalHT + tva) * 100) / 100;
    return { totalHT: Math.round(totalHT * 100) / 100, tva, totalTTC };
  }, [cartItems, tvaRate]);

  const handleStartEdit = (item) => {
    const calc = calculateItemPrice(item);
    const pricing = getItemPricingSummary(item, calc);
    const initialText = item.customDescription || generateDesignation(item, calc, pricing) || '';
    setTempDesignation(initialText);
    setEditingDesignationId(item.id);
  };

  const handleSaveEdit = (item) => {
    onUpdateItem({
      ...item,
      customDescription: tempDesignation
    });
    setEditingDesignationId(null);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header section with Client Info */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 sm:p-8 bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Récapitulatif du Devis</h2>
            <p className="text-slate-400 mt-1">Veuillez vérifier les informations ci-dessous avant validation</p>
          </div>
          <div className="flex items-center gap-2 bg-slate-800/50 text-white px-4 py-2 rounded-xl backdrop-blur-sm border border-slate-700/50">
            <FileText size={18} className="text-orange-500" />
            <span className="font-semibold text-sm">Devis Provisoire</span>
          </div>
        </div>

        <div className="p-6 sm:p-8 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Informations Client</h3>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 p-2 bg-orange-50 text-orange-500 rounded-lg">
                <User size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {clientData?.prenom || clientData?.nom ? `${clientData?.prenom || ''} ${clientData?.nom || ''}`.trim() : 'À définir'}
                </p>
                <div className="flex items-center gap-2 mt-1 text-slate-500">
                  <Phone size={12} />
                  <span className="text-sm">{clientData?.telephone || 'À définir'}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-slate-500">
                  <Mail size={12} />
                  <span className="text-sm">{clientData?.email || 'À définir'}</span>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 p-2 bg-slate-50 text-slate-500 rounded-lg">
                <MapPin size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Adresse du chantier</p>
                <p className="text-sm text-slate-500 mt-1">
                  {clientData?.adresse || 'À définir'}<br />
                  {clientData?.codePostal || clientData?.ville ? `${clientData?.codePostal || ''} ${clientData?.ville || ''}`.trim() : 'À définir'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Products Table */}
        <div className="p-6 sm:p-8">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Détail des Menuiseries</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-100">
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-2/5">Désignation</th>
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Dimensions</th>
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Qté</th>
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">PU HT</th>
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Total HT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cartItems.map((item, index) => {
                  const calc = calculateItemPrice(item);
                  const petitsBoisConfig = getPetitsBoisConfig(item);
                  return (
                    <React.Fragment key={item.id}>
                      <tr className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-4">
                          <div className="flex items-start gap-3">
                            {item.productId === 'gestion-dechets' ? (
                              <div className="w-14 h-14 shrink-0 bg-green-50 border border-green-100 rounded-xl flex items-center justify-center">
                                <WasteRecycleIcon size={24} className="text-green-600" />
                              </div>
                            ) : item.productId === 'custom-product' ? (
                              <div className="w-14 h-14 shrink-0 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center overflow-hidden">
                                {item.customImage ? (
                                  <img src={item.customImage} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <Package size={24} className="text-slate-300" />
                                )}
                              </div>
                            ) : (
                              <MenuiserieVisual 
                                sheetName={item.sheetName}
                                width={item.widthMm}
                                height={item.heightMm}
                                options={{
                                  isComposite: item.isComposite,
                                  composition: item.composition,
                                  colorOption: item.colorOption,
                                  glazingId: item.glazingOption?.id,
                                  petitsBoisH: petitsBoisConfig.petitsBoisH,
                                  petitsBoisV: petitsBoisConfig.petitsBoisV,
                                  panneauDecoratif: item.panneauDecoratif,
                                  hasSousBassement: item.hasSousBassement,
                                  sousBassementHeight: item.sousBassementHeight,
                                  sashOptions: item.sashOptions,
                                  productId: item.productId,
                                  openingDirection: item.openingDirection,
                                  svgColor: item.svgColor,
                                }}
                                className="w-14 h-14 shrink-0 bg-white border-slate-100 p-1"
                              />
                            )}
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                                {item.productId === 'gestion-dechets' && (
                                  <WasteRecycleIcon size={14} className="text-green-500 shrink-0" />
                                )}
                                <span>{item.productLabel}</span>
                                {item.repere && (
                                  <span className="italic text-slate-500 text-[10px] bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200 shrink-0 font-medium tracking-tight">
                                    {item.repere}
                                  </span>
                                )}
                              </p>
                              {item.productId === 'gestion-dechets' ? (
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                                  <span className="text-green-600 font-medium">Surface traitée : {item.totalSurface?.toFixed(2)} m² • {calc.weight?.toFixed(0)} kg estimé</span>
                                </div>
                              ) : (
                                <div className="mt-2 group relative">
                                  {editingDesignationId === item.id ? (
                                    <div className="space-y-2 animate-in fade-in duration-200">
                                      <textarea
                                        value={tempDesignation}
                                        onChange={(e) => setTempDesignation(e.target.value)}
                                        className="w-full text-xs text-slate-600 bg-white border border-orange-500 rounded-lg p-3 outline-none shadow-sm min-h-[100px] leading-relaxed"
                                        autoFocus
                                      />
                                      <div className="flex gap-2 justify-end">
                                        <button
                                          onClick={() => setEditingDesignationId(null)}
                                          className="px-3 py-1.5 text-[10px] font-bold text-slate-500 hover:bg-slate-100 rounded-md transition-colors"
                                        >
                                          Annuler
                                        </button>
                                        <button
                                          onClick={() => handleSaveEdit(item)}
                                          className="px-3 py-1.5 text-[10px] font-bold bg-orange-500 text-white hover:bg-orange-600 rounded-md transition-all shadow-sm flex items-center gap-1.5"
                                        >
                                          <Check size={12} />
                                          Valider
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-1">
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="text-[11px] text-slate-500 leading-relaxed whitespace-pre-wrap italic">
                                          {item.customDescription || (generateDesignation(item, calc, getItemPricingSummary(item, calc)) || 'Désignation en cours...')}
                                        </div>
                                        <button
                                          onClick={() => handleStartEdit(item)}
                                          className="p-1 px-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50 border border-transparent hover:border-orange-200 rounded transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1.5 shrink-0"
                                          title="Modifier la désignation"
                                        >
                                          <Pencil size={12} />
                                          <span className="text-[10px] font-bold">Modifier</span>
                                        </button>
                                      </div>
                                      
                                      {/* Mini badges below for visual confirmation of options */}
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {item.isComposite &&
                                          getCompositeModuleCount(item.composition, item.modules) > 0 && (
                                          <span className="text-[9px] px-1.5 py-0.5 bg-orange-50 rounded text-orange-600 font-bold">
                                            {formatCompositeModules(item.composition || item.modules)}
                                          </span>
                                        )}
                                        {item.colorOption?.id !== 'blanc' && (
                                          <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500">{item.colorOption?.label}</span>
                                        )}
                                        {item.includePose && (
                                          <span className="text-[9px] px-1.5 py-0.5 bg-green-50 rounded text-green-600 font-bold">Pose incluse</span>
                                        )}
                                        {item.remise > 0 && (
                                          <span className="text-[9px] px-1.5 py-0.5 bg-orange-50 rounded text-orange-600 font-bold">-{item.remise}%</span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div className="space-y-1">
                            <span className="inline-block px-2.5 py-1 bg-slate-100 rounded-md text-xs font-bold text-slate-600">
                              {item.productId === 'gestion-dechets' ? "Service" : (item.productId === 'custom-product' ? "Sur mesure" : `L${item.widthMm} × H${item.heightMm}`)}
                            </span>
                            {item.isComposite &&
                              getCompositeModuleCount(item.composition, item.modules) > 0 && (
                              <p className="text-[10px] font-semibold text-slate-500">
                                {getCompositeModuleCount(item.composition, item.modules)} modules
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center font-semibold text-slate-700 text-sm">
                          {item.quantity}
                        </td>
                        <td className="py-4 px-4 text-right text-sm">
                          <div className="text-slate-900 font-medium">{calc.unitPriceAfterDiscount.toFixed(2)} €</div>
                        </td>
                        <td className="py-4 px-4 text-right font-black text-slate-900">
                          {calc.totalLine.toFixed(2)} €
                        </td>
                      </tr>
                      {item.includePose && (
                        <tr className="bg-slate-50/30">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-14 shrink-0"></div>
                              <p className="font-semibold text-slate-800 text-sm">
                                Pose {item.productLabel || item.sheetName}
                              </p>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center text-slate-400 text-xs">
                            -
                          </td>
                          <td className="py-3 px-4 text-center font-semibold text-slate-700 text-sm">
                            {item.quantity}
                          </td>
                          <td className="py-3 px-4 text-right text-sm text-slate-900 font-medium">
                            {calc.posePrice.toFixed(2)} €
                          </td>
                          <td className="py-3 px-4 text-right font-black text-slate-900">
                            {(calc.posePrice * item.quantity).toFixed(2)} €
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* TVA Selection & Totals Section */}
        <div className="bg-slate-50 p-6 sm:p-8 border-t border-slate-100 flex flex-col lg:flex-row gap-8">
          {/* TVA Selector */}
          <div className="flex-1 space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Type de TVA</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { value: 0, label: '0%', sub: 'Exonéré' },
                { value: 5.5, label: '5.5%', sub: 'Réduit' },
                { value: 10, label: '10%', sub: 'Rénovation' },
                { value: 20, label: '20%', sub: 'Normal' }
              ].map((rate) => (
                <button
                  key={rate.value}
                  onClick={() => setTvaRate(rate.value)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                    tvaRate === rate.value
                      ? 'border-orange-500 bg-orange-50 text-orange-600 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <span className="text-sm font-black">{rate.label}</span>
                  <span className="text-[10px] uppercase font-bold opacity-60">{rate.sub}</span>
                </button>
              ))}
            </div>
            
            {tvaRate === 0 && (
              <div className="p-4 bg-orange-100/50 border border-orange-200 rounded-xl">
                <p className="text-xs text-orange-700 font-bold leading-relaxed italic">
                  &quot;Autoliquidation de la TVA – Article 283-2 du Code Général des Impôts. TVA due par le preneur.&quot;
                </p>
                <p className="text-[10px] text-orange-600 mt-1 uppercase font-bold tracking-tight">Mention légale obligatoire (Sous-traitance)</p>
              </div>
            )}

            {(tvaRate === 5.5 || tvaRate === 10) && (
              <div className={`p-4 rounded-xl border-2 transition-all ${certifyTva ? 'bg-green-50 border-green-200 text-green-700' : 'bg-orange-50 border-orange-200 text-orange-700'}`}>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="relative mt-0.5">
                    <input 
                      type="checkbox" 
                      className="peer sr-only" 
                      checked={certifyTva}
                      onChange={(e) => setCertifyTva(e.target.checked)}
                    />
                    <div className="h-5 w-5 border-2 border-slate-300 rounded-md bg-white transition-all peer-checked:bg-green-500 peer-checked:border-green-500 group-hover:border-slate-400"></div>
                    <CheckCircle className="absolute inset-0 m-auto text-white opacity-0 transition-opacity peer-checked:opacity-100" size={12} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold leading-tight">Attestation simplifiée (TVA réduite)</p>
                    <p className="text-[11px] mt-1 leading-relaxed opacity-90">
                      Je certifie que les travaux réalisés concernent un local à usage d&apos;habitation achevé depuis plus de deux ans et qu&apos;ils remplissent les conditions d&apos;éligibilité au taux réduit de TVA. Je reconnais être informé que toute fausse déclaration m&apos;expose à un redressement fiscal.
                    </p>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Totals Section */}
          <div className="w-full lg:w-80 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-semibold">Total HT</span>
              <span className="font-bold text-slate-900">{totals.totalHT.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between items-center text-sm pb-3 border-b border-slate-200">
              <span className="text-slate-500 font-semibold">TVA ({tvaRate}%)</span>
              <span className="font-bold text-slate-900">{totals.tva.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between items-end pt-1">
              <div className="space-y-0.5">
                <span className="block text-sm font-bold text-slate-900">Net à payer TTC</span>
                <span className="block text-[10px] text-slate-400 uppercase tracking-wider">
                  {tvaRate === 0 ? 'Exonération de TVA' : `TVA à ${tvaRate}%`}
                </span>
              </div>
              <span className="text-2xl font-black text-orange-500">{totals.totalTTC.toFixed(2)} €</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4">
        <button
          onClick={onGoBack}
          className="w-full sm:w-auto px-6 py-3 text-sm font-semibold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-full shadow-sm hover:shadow hover:bg-slate-50 transition-all font-bold"
        >
          Retourner au panier
        </button>
        <button
          onClick={onNext}
          disabled={(tvaRate === 5.5 || tvaRate === 10) && !certifyTva}
          className={`w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 text-sm font-bold rounded-full transition-all duration-200 shadow-lg transform hover:-translate-y-0.5 active:translate-y-0 ${
            (tvaRate === 5.5 || tvaRate === 10) && !certifyTva
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              : 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/30'
          }`}
        >
          <Download size={18} />
          Générer le devis PDF
        </button>
      </div>
    </div>
  );
}
