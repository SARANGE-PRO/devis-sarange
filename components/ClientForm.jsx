'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  User,
} from 'lucide-react';
import { useFirebaseAuth } from '@/components/FirebaseProvider';
import {
  EMPTY_CLIENT_DATA,
  buildClientSearchText,
  getClientDisplayName,
  getClientFullLocation,
  sanitizeClientData,
} from '@/lib/client-cloud';
import { subscribeToUserClients } from '@/lib/firebase/clients';

export default function ClientForm({ onNext, initialData = null }) {
  const { user, initializing: authInitializing, isConfigured: firebaseConfigured } =
    useFirebaseAuth();

  const [formData, setFormData] = useState({
    ...EMPTY_CLIENT_DATA,
    ...(initialData ? sanitizeClientData(initialData) : {}),
  });
  const [errors, setErrors] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSearchField, setActiveSearchField] = useState(null);
  const [savedClients, setSavedClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [clientDirectoryError, setClientDirectoryError] = useState('');

  useEffect(() => {
    const query =
      activeSearchField === 'facturation' ? formData.adresse : formData.adresseChantier;

    if (query?.length > 3) {
      const timeoutId = setTimeout(() => {
        void fetchSuggestions(query);
      }, 300);
      return () => clearTimeout(timeoutId);
    }

    setSuggestions([]);
    setShowSuggestions(false);
    return undefined;
  }, [formData.adresse, formData.adresseChantier, activeSearchField]);

  useEffect(() => {
    setFormData({
      ...EMPTY_CLIENT_DATA,
      ...(initialData ? sanitizeClientData(initialData) : {}),
    });
  }, [initialData]);

  useEffect(() => {
    if (!firebaseConfigured || authInitializing || !user) {
      setSavedClients([]);
      setLoadingClients(false);
      return undefined;
    }

    setLoadingClients(true);
    setClientDirectoryError('');

    const unsubscribe = subscribeToUserClients({
      userId: user.uid,
      onNext: (nextClients) => {
        setSavedClients(nextClients);
        setLoadingClients(false);
      },
      onError: (error) => {
        setClientDirectoryError(error.message || 'Impossible de charger vos clients enregistres.');
        setLoadingClients(false);
      },
    });

    return unsubscribe;
  }, [authInitializing, firebaseConfigured, user]);

  const fetchSuggestions = async (query) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`
      );
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
      setFormData((prev) => ({
        ...prev,
        adresse: name,
        codePostal: postcode,
        ville: city,
      }));
    } else if (activeSearchField === 'chantier') {
      setFormData((prev) => ({
        ...prev,
        adresseChantier: name,
        codePostalChantier: postcode,
        villeChantier: city,
      }));
    }

    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSearchField(null);
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    const finalValue = type === 'checkbox' ? checked : value;

    setFormData((prev) => ({ ...prev, [name]: finalValue }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleApplySavedClient = (client) => {
    if (
      formData.nom ||
      formData.prenom ||
      formData.email ||
      formData.telephone ||
      formData.adresse
    ) {
      const sameClient = client.id === formData.savedClientId;
      if (!sameClient && !window.confirm('Remplacer les informations en cours par cette fiche client ?')) {
        return;
      }
    }

    setFormData({
      ...EMPTY_CLIENT_DATA,
      ...(client.payload || {}),
      savedClientId: client.id,
    });
    setErrors({});
  };

  const validate = () => ({});

  const handleSubmit = (event) => {
    event.preventDefault();
    const validationErrors = validate();

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (onNext) onNext(sanitizeClientData(formData));
  };

  const inputClasses =
    'w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-base text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 sm:py-3.5 sm:text-sm';
  const labelClasses = 'mb-1.5 block text-sm font-semibold text-slate-700';

  const activeSavedClient =
    savedClients.find((client) => client.id === formData.savedClientId) || null;

  const clientLookupTerm = [
    formData.prenom,
    formData.nom,
    formData.email,
    formData.telephone,
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
    .toLowerCase();

  const matchedClients =
    clientLookupTerm.length < 2
      ? []
      : savedClients
          .filter((client) => {
            const haystack =
              client.searchText || buildClientSearchText(client.payload) || client.displayName || '';
            return haystack.includes(clientLookupTerm);
          })
          .slice(0, 4);

  const showClientSuggestions =
    firebaseConfigured && user && clientLookupTerm.length >= 2 && matchedClients.length > 0;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 md:p-10">
        <div className="mb-5 flex items-center gap-3 sm:mb-8">
          <div className="rounded-xl bg-orange-100 p-2.5">
            <User size={22} className="text-orange-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 sm:text-xl">Informations client</h1>
            <p className="text-sm text-slate-500">
              Renseignez les coordonnees du client pour le devis.
            </p>
          </div>
        </div>

        {firebaseConfigured && user && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            Autoremplissage client actif.
            <Link href="/clients" className="ml-1 font-semibold text-orange-600 hover:text-orange-700">
              Ouvrir Portefeuille client
            </Link>
          </div>
        )}

        {clientDirectoryError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {clientDirectoryError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-5 md:grid-cols-2">
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
              {errors.nom && <p className="mt-1 text-xs text-red-500">{errors.nom}</p>}
            </div>
            <div>
              <label htmlFor="prenom" className={labelClasses}>
                Prenom
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
              {errors.prenom && <p className="mt-1 text-xs text-red-500">{errors.prenom}</p>}
            </div>
          </div>

          {(activeSavedClient ||
            showClientSuggestions ||
            (loadingClients && clientLookupTerm.length >= 2)) && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {activeSavedClient && (
                <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                  Client reconnu : <span className="font-semibold">{activeSavedClient.displayName}</span>
                  {getClientFullLocation(activeSavedClient.payload)
                    ? ` / ${getClientFullLocation(activeSavedClient.payload)}`
                    : ''}
                </div>
              )}

              {loadingClients ? (
                <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={16} className="animate-spin" />
                  Chargement des fiches clients...
                </div>
              ) : showClientSuggestions ? (
                <>
                  <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">
                    Autoremplissage disponible
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {matchedClients.map((client) => {
                      const secondaryLine =
                        client.email || client.telephone || getClientFullLocation(client.payload);

                      return (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => handleApplySavedClient(client)}
                          className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-orange-200 hover:shadow-md"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-900">
                                {client.displayName || getClientDisplayName(client.payload)}
                              </p>
                              <p className="mt-1 truncate text-xs text-slate-500">
                                {secondaryLine || 'Coordonnees a completer'}
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                              Remplir
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          )}

          <div>
            <label htmlFor="referenceDevis" className={labelClasses}>
              Reference du devis (optionnel)
            </label>
            <input
              id="referenceDevis"
              name="referenceDevis"
              type="text"
              placeholder="Ex : PROJET-2026-A"
              value={formData.referenceDevis}
              onChange={handleChange}
              className={inputClasses}
            />
          </div>

          <div className="my-4 h-px w-full bg-slate-100" />

          <h3 className="mb-3 text-base font-semibold text-slate-800">Adresse de facturation</h3>
          <div className="relative">
            <label htmlFor="adresse" className={labelClasses}>
              <MapPin size={14} className="mr-1 inline text-slate-400" />
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
                  if (suggestions.length > 0 && activeSearchField === 'facturation') {
                    setShowSuggestions(true);
                  }
                }}
                className={`${inputClasses} pr-10 ${
                  errors.adresse ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''
                }`}
              />
              {isLoading && activeSearchField === 'facturation' && (
                <div className="absolute right-4 animate-spin text-orange-500">
                  <Loader2 size={18} />
                </div>
              )}
            </div>

            {showSuggestions && activeSearchField === 'facturation' && suggestions.length > 0 && (
              <div className="animate-in fade-in zoom-in-95 absolute z-[100] mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl duration-100">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleSelectSuggestion(suggestion);
                    }}
                    className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm text-slate-700 transition-colors last:border-0 hover:bg-slate-50 hover:text-orange-500"
                  >
                    <MapPin size={14} className="shrink-0 text-slate-300" />
                    <div className="min-w-0 flex-1 truncate">
                      <span className="font-bold">{suggestion.properties.name}</span>
                      <span className="ml-2 text-slate-400">
                        {suggestion.properties.postcode} {suggestion.properties.city}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {errors.adresse && <p className="mt-1 text-xs text-red-500">{errors.adresse}</p>}
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <label htmlFor="codePostal" className={labelClasses}>
                Code postal
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
              {errors.codePostal && <p className="mt-1 text-xs text-red-500">{errors.codePostal}</p>}
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
              {errors.ville && <p className="mt-1 text-xs text-red-500">{errors.ville}</p>}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6">
            <p className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">
              Contact (optionnel)
            </p>
          </div>

          <div className="mb-2 mt-6">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                name="memeAdresseChantier"
                checked={formData.memeAdresseChantier}
                onChange={handleChange}
                className="h-5 w-5 cursor-pointer rounded border-slate-300 text-orange-500 transition-colors focus:ring-2 focus:ring-orange-500"
              />
              <span className="text-sm font-medium text-slate-700">
                L&apos;adresse du chantier est identique a l&apos;adresse de facturation
              </span>
            </label>
          </div>

          {!formData.memeAdresseChantier && (
            <div className="animate-in fade-in slide-in-from-top-2 space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="text-sm font-semibold text-slate-800">Adresse du chantier</h3>
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
                      if (suggestions.length > 0 && activeSearchField === 'chantier') {
                        setShowSuggestions(true);
                      }
                    }}
                    className={`${inputClasses} pr-10`}
                  />
                  {isLoading && activeSearchField === 'chantier' && (
                    <div className="absolute right-4 animate-spin text-orange-500">
                      <Loader2 size={18} />
                    </div>
                  )}
                </div>

                {showSuggestions && activeSearchField === 'chantier' && suggestions.length > 0 && (
                  <div className="animate-in fade-in zoom-in-95 absolute z-[100] mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl duration-100">
                    {suggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          handleSelectSuggestion(suggestion);
                        }}
                        className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm text-slate-700 transition-colors last:border-0 hover:bg-slate-50 hover:text-orange-500"
                      >
                        <MapPin size={14} className="shrink-0 text-slate-300" />
                        <div className="min-w-0 flex-1 truncate">
                          <span className="font-bold">{suggestion.properties.name}</span>
                          <span className="ml-2 text-slate-400">
                            {suggestion.properties.postcode} {suggestion.properties.city}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-5 md:grid-cols-3">
                <div>
                  <label htmlFor="codePostalChantier" className={labelClasses}>
                    Code postal
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

          <div className="my-4 h-px w-full bg-slate-100" />

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="telephone" className={labelClasses}>
                <Phone size={14} className="mr-1 inline text-slate-400" />
                Telephone
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
                <Mail size={14} className="mr-1 inline text-slate-400" />
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

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-orange-500 px-8 py-4 text-base font-bold text-white shadow-xl shadow-orange-500/30 transition-all duration-200 hover:-translate-y-1 hover:bg-orange-600 active:translate-y-0 sm:w-auto sm:rounded-full"
            >
              Suivant : Ajouter des produits
              <ArrowRight size={18} />
            </button>
          </div>
        </form>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
        <CheckCircle2 size={14} />
        <span>Ces informations apparaitront en en-tete du devis PDF final.</span>
      </div>
    </div>
  );
}
