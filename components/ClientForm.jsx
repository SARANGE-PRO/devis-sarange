'use client';

import { useState, useEffect } from 'react';
import {
  User,
  MapPin,
  Phone,
  Mail,
  ArrowRight,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

const EMPTY_CLIENT_DATA = {
  nom: '',
  prenom: '',
  referenceDevis: '',
  adresse: '',
  codePostal: '',
  ville: '',
  telephone: '',
  email: '',
  memeAdresseChantier: true,
  adresseChantier: '',
  codePostalChantier: '',
  villeChantier: '',
};

export default function ClientForm({ onNext, initialData = null }) {
  const [formData, setFormData] = useState({
    ...EMPTY_CLIENT_DATA,
    ...(initialData || {}),
  });

  const [errors, setErrors] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSearchField, setActiveSearchField] = useState(null); // 'facturation' | 'chantier'

  // Debounce for address search
  useEffect(() => {
    const query = activeSearchField === 'facturation' ? formData.adresse : formData.adresseChantier;

    // We only trigger search if the user has typed at least 4 chars
    if (query?.length > 3) {
      const timeoutId = setTimeout(() => {
        fetchSuggestions(query);
      }, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [formData.adresse, formData.adresseChantier, activeSearchField]);

  useEffect(() => {
    setFormData({
      ...EMPTY_CLIENT_DATA,
      ...(initialData || {}),
    });
  }, [initialData]);

  const fetchSuggestions = async (query) => {
    setIsLoading(true);
    try {
      const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
      const data = await response.json();
      setSuggestions(data.features || []);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Error fetching address suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSuggestion = (suggestion) => {
    const { name, postcode, city } = suggestion.properties;
    
    if (activeSearchField === 'facturation') {
      setFormData(prev => ({
        ...prev,
        adresse: name,
        codePostal: postcode,
        ville: city
      }));
    } else if (activeSearchField === 'chantier') {
      setFormData(prev => ({
        ...prev,
        adresseChantier: name,
        codePostalChantier: postcode,
        villeChantier: city
      }));
    }
    
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSearchField(null);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const finalValue = type === 'checkbox' ? checked : value;
    setFormData((prev) => ({ ...prev, [name]: finalValue }));
    // Clear error when user types
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validate = () => {
    const newErrors = {};
    return newErrors;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    if (onNext) onNext(formData);
  };

  const inputClasses =
    'w-full px-4 py-4 sm:py-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-base sm:text-sm placeholder-slate-400 outline-none transition-all duration-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 hover:border-slate-400';

  const labelClasses = 'block text-sm font-semibold text-slate-700 mb-1.5';

  return (
    <div className="max-w-3xl mx-auto">
      {/* Card */}
      <div className="bg-white p-8 md:p-10 rounded-2xl border border-slate-200 shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 bg-orange-100 rounded-xl">
            <User size={22} className="text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Informations Client
            </h1>
            <p className="text-sm text-slate-500">
              Renseignez les coordonnées du client pour le devis
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Nom & Prénom */}
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label htmlFor="nom" className={labelClasses}>
                Nom
              </label>
              <input
                id="nom"
                name="nom"
                type="text"
                placeholder="Dupont"
                value={formData.nom}
                onChange={handleChange}
                className={`${inputClasses} ${
                  errors.nom ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''
                }`}
              />
              {errors.nom && (
                <p className="mt-1 text-xs text-red-500">{errors.nom}</p>
              )}
            </div>
            <div>
              <label htmlFor="prenom" className={labelClasses}>
                Prénom
              </label>
              <input
                id="prenom"
                name="prenom"
                type="text"
                placeholder="Jean"
                value={formData.prenom}
                onChange={handleChange}
                className={`${inputClasses} ${
                  errors.prenom ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''
                }`}
              />
              {errors.prenom && (
                <p className="mt-1 text-xs text-red-500">{errors.prenom}</p>
              )}
            </div>
          </div>

          {/* Référence Devis (Optionnel) */}
          <div>
            <label htmlFor="referenceDevis" className={labelClasses}>
              Référence du devis (Optionnel)
            </label>
            <input
              id="referenceDevis"
              name="referenceDevis"
              type="text"
              placeholder="Ex: PROJET-2026-A"
              value={formData.referenceDevis}
              onChange={handleChange}
              className={inputClasses}
            />
          </div>

          <div className="h-px w-full bg-slate-100 my-4" />

          {/* Addresse Facturation */}
          <h3 className="font-semibold text-slate-800 text-base mb-3">Adresse de facturation</h3>
          <div className="relative">
            <label htmlFor="adresse" className={labelClasses}>
              <MapPin size={14} className="inline mr-1 text-slate-400" />
              Adresse
            </label>
            <div className="relative flex items-center">
              <input
                id="adresse"
                name="adresse"
                type="text"
                autoComplete="off"
                placeholder="12 Rue de la Paix"
                value={formData.adresse}
                onChange={handleChange}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onFocus={() => { 
                  setActiveSearchField('facturation');
                  if (suggestions.length > 0 && activeSearchField === 'facturation') setShowSuggestions(true); 
                }}
                className={`${inputClasses} pr-10 ${
                  errors.adresse ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''
                }`}
              />
              {isLoading && activeSearchField === 'facturation' && (
                <div className="absolute right-4 text-orange-500 animate-spin">
                  <Loader2 size={18} />
                </div>
              )}
            </div>
            
            {showSuggestions && activeSearchField === 'facturation' && suggestions.length > 0 && (
              <div className="absolute z-[100] w-full mt-1 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                {suggestions.map((s, idx) => (
                  <div 
                    key={idx}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectSuggestion(s);
                    }}
                    className="px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 hover:text-orange-500 cursor-pointer transition-colors border-b last:border-0 border-slate-100 flex items-center gap-3"
                  >
                    <MapPin size={14} className="text-slate-300 shrink-0" />
                    <div className="flex-1 min-w-0 truncate">
                      <span className="font-bold">{s.properties.name}</span>
                      <span className="ml-2 text-slate-400">{s.properties.postcode} {s.properties.city}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {errors.adresse && (
              <p className="mt-1 text-xs text-red-500">{errors.adresse}</p>
            )}
          </div>

          {/* Code Postal & Ville */}
          <div className="grid md:grid-cols-3 gap-5">
            <div>
              <label htmlFor="codePostal" className={labelClasses}>
                Code Postal
              </label>
              <input
                id="codePostal"
                name="codePostal"
                type="text"
                placeholder="77000"
                maxLength={5}
                value={formData.codePostal}
                onChange={handleChange}
                className={`${inputClasses} ${
                  errors.codePostal
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                    : ''
                }`}
              />
              {errors.codePostal && (
                <p className="mt-1 text-xs text-red-500">
                  {errors.codePostal}
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <label htmlFor="ville" className={labelClasses}>
                Ville
              </label>
              <input
                id="ville"
                name="ville"
                type="text"
                placeholder="Melun"
                value={formData.ville}
                onChange={handleChange}
                className={`${inputClasses} ${
                  errors.ville ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''
                }`}
              />
              {errors.ville && (
                <p className="mt-1 text-xs text-red-500">{errors.ville}</p>
              )}
            </div>
          </div>

          {/* Separator */}
          <div className="border-t border-slate-100 pt-6">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
              Contact (optionnel)
            </p>
          </div>

          {/* Checkbox for separate chantier address */}
          <div className="mt-6 mb-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="memeAdresseChantier"
                checked={formData.memeAdresseChantier}
                onChange={handleChange}
                className="w-5 h-5 text-orange-500 rounded border-slate-300 focus:ring-orange-500 focus:ring-2 transition-colors cursor-pointer"
              />
              <span className="text-sm font-medium text-slate-700">L&apos;adresse du chantier est identique à l&apos;adresse de facturation</span>
            </label>
          </div>

          {/* Adresse Chantier Conditionally Rendered */}
          {!formData.memeAdresseChantier && (
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-5 animate-in fade-in slide-in-from-top-2">
               <h3 className="font-semibold text-slate-800 text-sm">Adresse du chantier</h3>
               <div className="relative">
                <label htmlFor="adresseChantier" className={labelClasses}>
                  Adresse
                </label>
                <div className="relative flex items-center">
                  <input
                    id="adresseChantier"
                    name="adresseChantier"
                    type="text"
                    autoComplete="off"
                    placeholder="24 Avenue des Champs"
                    value={formData.adresseChantier}
                    onChange={handleChange}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    onFocus={() => {
                      setActiveSearchField('chantier');
                      if (suggestions.length > 0 && activeSearchField === 'chantier') setShowSuggestions(true);
                    }}
                    className={`${inputClasses} pr-10`}
                  />
                  {isLoading && activeSearchField === 'chantier' && (
                    <div className="absolute right-4 text-orange-500 animate-spin">
                      <Loader2 size={18} />
                    </div>
                  )}
                </div>

                {showSuggestions && activeSearchField === 'chantier' && suggestions.length > 0 && (
                  <div className="absolute z-[100] w-full mt-1 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    {suggestions.map((s, idx) => (
                      <div
                        key={idx}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectSuggestion(s);
                        }}
                        className="px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 hover:text-orange-500 cursor-pointer transition-colors border-b last:border-0 border-slate-100 flex items-center gap-3"
                      >
                        <MapPin size={14} className="text-slate-300 shrink-0" />
                        <div className="flex-1 min-w-0 truncate">
                          <span className="font-bold">{s.properties.name}</span>
                          <span className="ml-2 text-slate-400">{s.properties.postcode} {s.properties.city}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid md:grid-cols-3 gap-5">
                <div>
                  <label htmlFor="codePostalChantier" className={labelClasses}>
                    Code Postal
                  </label>
                  <input
                    id="codePostalChantier"
                    name="codePostalChantier"
                    type="text"
                    placeholder="75000"
                    maxLength={5}
                    value={formData.codePostalChantier}
                    onChange={handleChange}
                    className={inputClasses}
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="villeChantier" className={labelClasses}>
                    Ville
                  </label>
                  <input
                    id="villeChantier"
                    name="villeChantier"
                    type="text"
                    placeholder="Paris"
                    value={formData.villeChantier}
                    onChange={handleChange}
                    className={inputClasses}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="h-px w-full bg-slate-100 my-4" />

          {/* Téléphone & Email */}
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label htmlFor="telephone" className={labelClasses}>
                <Phone size={14} className="inline mr-1 text-slate-400" />
                Téléphone
              </label>
              <input
                id="telephone"
                name="telephone"
                type="tel"
                placeholder="06 12 34 56 78"
                value={formData.telephone}
                onChange={handleChange}
                className={inputClasses}
              />
            </div>
            <div>
              <label htmlFor="email" className={labelClasses}>
                <Mail size={14} className="inline mr-1 text-slate-400" />
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="jean.dupont@email.com"
                value={formData.email}
                onChange={handleChange}
                className={inputClasses}
              />
            </div>
          </div>

          {/* Submit */}
          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              className="w-full sm:w-auto inline-flex justify-center items-center gap-3 px-8 py-4 bg-orange-500 hover:bg-orange-600 text-white text-base font-bold rounded-2xl sm:rounded-full transition-all duration-200 shadow-xl shadow-orange-500/30 transform hover:-translate-y-1 active:translate-y-0"
            >
              Suivant : Ajouter des produits
              <ArrowRight size={18} />
            </button>
          </div>
        </form>
      </div>

      {/* Helper */}
      <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 justify-center">
        <CheckCircle2 size={14} />
        <span>Ces informations apparaîtront en en-tête du devis PDF final</span>
      </div>
    </div>
  );
}
