'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
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
import {
  CLIENT_TYPES,
  computeFrenchVatNumber,
  formatSiret,
  getSirenFromSiret,
  isKnownClientType,
  isProfessionalClient,
  normalizeVatNumber,
} from '@/lib/client-type.mjs';
import {
  CALCULATED_UNVERIFIED_ALERT,
  NOT_FOUND_DGFIP_ALERT,
  VAT_LOOKUP_OUTCOMES,
  buildManualVatConfirmation,
  buildVatPatchFromLookup,
  getTvaVerificationLabel,
  getVatSourceLabel,
  resolveClientVatState,
} from '@/lib/vat-verification.mjs';
import VatConfirmationDialog from '@/components/VatConfirmationDialog';
import { subscribeToUserClients } from '@/lib/firebase/clients';

export default function ClientForm({
  onNext,
  initialData = null,
  reference = '',
  onReferenceChange,
}) {
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
  // Recherche d'entreprise (mode PROFESSIONNEL) via l'annuaire public
  // recherche-entreprises.api.gouv.fr — autoremplit raison sociale, SIRET et
  // adresse du siège pour accélérer les devis B2B.
  const [companyQuery, setCompanyQuery] = useState('');
  const [companySuggestions, setCompanySuggestions] = useState([]);
  const [showCompanySuggestions, setShowCompanySuggestions] = useState(false);
  const [isCompanyLoading, setIsCompanyLoading] = useState(false);
  // Entreprise choisie dans l'annuaire : on cesse alors toute proposition
  // approximative par raison sociale, jusqu'à une nouvelle saisie du nom.
  const [companyLocked, setCompanyLocked] = useState(false);
  const [isVerifyingVat, setIsVerifyingVat] = useState(false);
  const [isConfirmingVat, setIsConfirmingVat] = useState(false);
  const [vatLookupNotice, setVatLookupNotice] = useState('');

  // Choix EXPLICITE obligatoire : tant qu'aucun des deux types n'est
  // sélectionné (fiches historiques comprises), le devis reste bloqué à
  // l'étape récapitulatif — jamais de défaut, jamais de déduction du SIRET.
  const isProfessional = isProfessionalClient(formData.clientType);
  const isParticulier = formData.clientType === CLIENT_TYPES.PARTICULIER;
  const clientTypeKnown = isKnownClientType(formData.clientType);
  // Statut EFFECTIF du n° de TVA : un numéro reconstitué depuis le SIREN, ou
  // modifié après vérification, reste « non vérifié ».
  const vatState = resolveClientVatState(formData);
  const vatVerifiedDate = vatState.verifiedAt ? new Date(vatState.verifiedAt) : null;
  const vatVerifiedLabel =
    vatVerifiedDate && !Number.isNaN(vatVerifiedDate.getTime())
      ? [
          `le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(vatVerifiedDate)}`,
          vatState.verifiedBy ? `par ${vatState.verifiedBy}` : '',
        ]
          .filter(Boolean)
          .join(' ')
      : '';

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

  // Debounce de la recherche d'entreprise (même pattern que l'API adresse).
  // Les fiches clients déjà enregistrées matchent dès 2 caractères (sans appel
  // réseau) ; l'annuaire entreprises est interrogé à partir de 3.
  useEffect(() => {
    const term = companyQuery.trim();

    if (!isProfessional || term.length < 2) {
      setCompanySuggestions([]);
      setShowCompanySuggestions(false);
      return undefined;
    }

    setShowCompanySuggestions(true);

    if (term.length < 3) {
      setCompanySuggestions([]);
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      void fetchCompanySuggestions(term);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [companyQuery, isProfessional]);

  const fetchCompanySuggestions = async (query) => {
    setIsCompanyLoading(true);
    try {
      const response = await fetch(
        `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(query)}&page=1&per_page=5`
      );
      const data = await response.json();
      setCompanySuggestions(Array.isArray(data?.results) ? data.results : []);
      setShowCompanySuggestions(true);
    } catch (error) {
      console.error('Error fetching company suggestions:', error);
    } finally {
      setIsCompanyLoading(false);
    }
  };

  // Adresse du siège : composition depuis les champs structurés, repli sur
  // geo_adresse (dont on retire « CP Ville » déjà portés par leurs champs).
  const buildCompanyStreet = (siege) => {
    const numero = [siege?.numero_voie, siege?.indice_repetition]
      .filter(Boolean)
      .join(' ');
    const voie = [siege?.type_voie, siege?.libelle_voie].filter(Boolean).join(' ');
    const street = [numero, voie].filter(Boolean).join(' ').trim();
    if (street) return street;

    const geoAdresse = typeof siege?.geo_adresse === 'string' ? siege.geo_adresse : '';
    const tail = [siege?.code_postal, siege?.libelle_commune].filter(Boolean).join(' ');
    return tail && geoAdresse.endsWith(tail)
      ? geoAdresse.slice(0, geoAdresse.length - tail.length).trim()
      : geoAdresse;
  };

  /**
   * Vérification du n° de TVA auprès des sources OFFICIELLES (DGFiP puis VIES).
   * Un numéro déjà communiqué par le client — y compris étranger — est soumis
   * tel quel ; sinon la recherche part du SIREN, DGFiP en priorité.
   */
  const runVatVerification = async ({ siren, vatNumber } = {}) => {
    if (!user) return;

    const effectiveSiren = siren || formData.siren || getSirenFromSiret(formData.siret);
    const declaredNumber = normalizeVatNumber(vatNumber ?? formData.tvaIntra);
    const calculatedCandidate = computeFrenchVatNumber(effectiveSiren);
    // Le numéro simplement reconstitué par la formule n'est pas un numéro
    // « communiqué » : on laisse alors la DGFiP répondre depuis le SIREN.
    const declaredIsClientProvided =
      Boolean(declaredNumber) && declaredNumber !== calculatedCandidate;

    if (!effectiveSiren && !declaredIsClientProvided) return;

    setIsVerifyingVat(true);
    setVatLookupNotice('');

    try {
      const params = new URLSearchParams();
      if (effectiveSiren) params.set('siren', effectiveSiren);
      if (declaredIsClientProvided) params.set('vatNumber', declaredNumber);

      const idToken = await user.getIdToken();
      const response = await fetch(`/api/tva/verify?${params.toString()}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await response.json();

      if (!response.ok || !data?.patch) {
        setVatLookupNotice('Vérification indisponible pour le moment.');
        return;
      }

      setFormData((prev) => ({ ...prev, ...data.patch }));

      if (data.outcome === VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP) {
        setVatLookupNotice(NOT_FOUND_DGFIP_ALERT);
      } else if (data.outcome === VAT_LOOKUP_OUTCOMES.UNAVAILABLE) {
        setVatLookupNotice(
          'Sources officielles injoignables : le numéro reste à vérifier ou à confirmer.'
        );
      }
    } catch (error) {
      console.error('Error verifying VAT number:', error);
      setVatLookupNotice('Vérification indisponible pour le moment.');
    } finally {
      setIsVerifyingVat(false);
    }
  };

  const handleConfirmVatManually = ({ source, comment, attachment }) => {
    const patch = buildManualVatConfirmation({
      vatNumber: formData.tvaIntra,
      confirmedBy: user?.email || user?.uid || '',
      confirmedAt: new Date().toISOString(),
      source,
      comment,
      attachment,
    });

    if (patch) {
      setFormData((prev) => ({ ...prev, ...patch }));
      setVatLookupNotice('');
      setIsConfirmingVat(false);
    }
  };

  const handleSelectCompany = (company) => {
    const siege = company?.siege || {};
    // Identité fiscale du donneur d'ordre : SIREN et SIRET issus de l'annuaire.
    // Le n° de TVA est d'abord PRÉREMPLI depuis le SIREN (statut « non
    // vérifié »), puis soumis aux sources officielles juste après.
    const siren = company?.siren || getSirenFromSiret(siege.siret);

    setFormData((prev) => ({
      ...prev,
      clientType: CLIENT_TYPES.PROFESSIONNEL,
      nom: company?.nom_complet || company?.nom_raison_sociale || prev.nom,
      siret: siege.siret || '',
      siren: siren || '',
      ...buildVatPatchFromLookup({ outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE, siren }),
      adresse: buildCompanyStreet(siege) || prev.adresse,
      codePostal: siege.code_postal || prev.codePostal,
      ville: siege.libelle_commune || prev.ville,
    }));
    setCompanyQuery('');
    setCompanySuggestions([]);
    setShowCompanySuggestions(false);
    setCompanyLocked(true);

    void runVatVerification({ siren, vatNumber: '' });
  };

  const handleSelectSavedCompany = (client) => {
    handleApplySavedClient(client);
    setCompanyQuery('');
    setCompanySuggestions([]);
    setShowCompanySuggestions(false);
    setCompanyLocked(true);
  };

  const handleSelectClientType = (clientType) => {
    setFormData((prev) => ({
      ...prev,
      clientType,
      // Retour en PARTICULIER : le SIRET n'a plus de sens sur la fiche.
      ...(clientType === CLIENT_TYPES.PARTICULIER ? { siret: '' } : {}),
    }));
    if (clientType === CLIENT_TYPES.PARTICULIER) {
      setCompanyQuery('');
      setCompanySuggestions([]);
      setShowCompanySuggestions(false);
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

    // Saisie manuelle du SIRET (repli si l'annuaire est indisponible) : le
    // SIREN en est déduit, ce qui permet de reconstituer le n° de TVA.
    if (name === 'siret') {
      setFormData((prev) => ({
        ...prev,
        siret: value,
        siren: getSirenFromSiret(value),
      }));
      return;
    }

    if (name === 'nom') {
      setCompanyLocked(false);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: finalValue,
      ...(name === 'nomChantierDifferent' && !checked
        ? { nomChantier: '', prenomChantier: '' }
        : {}),
    }));

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

  const searchSavedClients = (term, limit) =>
    term.length < 2
      ? []
      : savedClients
          .filter((client) => {
            const haystack =
              client.searchText || buildClientSearchText(client.payload) || client.displayName || '';
            return haystack.includes(term);
          })
          .slice(0, limit);

  const matchedClients = searchSavedClients(clientLookupTerm, 4);
  // Autocomplétion des clients ENREGISTRÉS dans la recherche d'entreprise :
  // une fiche existante (raison sociale, SIRET…) se propose avant l'annuaire.
  const companyQueryTerm = companyQuery.trim().toLowerCase();
  const matchedSavedCompanies = searchSavedClients(companyQueryTerm, 3);

  const showClientSuggestions =
    firebaseConfigured &&
    user &&
    !companyLocked &&
    clientLookupTerm.length >= 2 &&
    matchedClients.length > 0;

  return (
    <div className="mx-auto max-w-3xl">
      <VatConfirmationDialog
        key={isConfirmingVat ? 'vat-dialog-open' : 'vat-dialog-closed'}
        open={isConfirmingVat}
        vatNumber={formData.tvaIntra}
        onConfirm={handleConfirmVatManually}
        onCancel={() => setIsConfirmingVat(false)}
      />

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
          {/* Type de client : seule information juridique demandée. Pilote les
              CGV adaptatives du devis (B2C / B2B). */}
          <div>
            <p className={labelClasses}>Type de client</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSelectClientType(CLIENT_TYPES.PARTICULIER)}
                className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3.5 text-sm font-bold transition-all ${
                  isParticulier
                    ? 'border-orange-500 bg-orange-50 text-orange-600 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                <User size={16} />
                Particulier
              </button>
              <button
                type="button"
                onClick={() => handleSelectClientType(CLIENT_TYPES.PROFESSIONNEL)}
                className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3.5 text-sm font-bold transition-all ${
                  isProfessional
                    ? 'border-orange-500 bg-orange-50 text-orange-600 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                <Building2 size={16} />
                Professionnel
              </button>
            </div>
            {!clientTypeKnown && (
              <p className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                Type de client à confirmer — ce choix est obligatoire : la génération,
                l&apos;envoi et la signature du devis restent bloqués tant qu&apos;il
                n&apos;est pas fait.
              </p>
            )}
          </div>

          {isProfessional && (
            <div className="animate-in fade-in slide-in-from-top-2 relative rounded-xl border border-slate-200 bg-slate-50 p-4">
              <label htmlFor="companySearch" className={labelClasses}>
                <Building2 size={14} className="mr-1 inline text-slate-400" />
                Rechercher l&apos;entreprise (nom, SIREN ou SIRET)
              </label>
              <div className="relative flex items-center">
                <input
                  id="companySearch"
                  type="text"
                  autoComplete="off"
                  placeholder="Ex : SARANGE, 820001014…"
                  value={companyQuery}
                  onChange={(event) => setCompanyQuery(event.target.value)}
                  onBlur={() => setTimeout(() => setShowCompanySuggestions(false), 200)}
                  onFocus={() => {
                    if (companySuggestions.length > 0 || matchedSavedCompanies.length > 0) {
                      setShowCompanySuggestions(true);
                    }
                  }}
                  className={`${inputClasses} pr-10`}
                />
                {isCompanyLoading && (
                  <div className="absolute right-4 animate-spin text-orange-500">
                    <Loader2 size={18} />
                  </div>
                )}
              </div>

              {showCompanySuggestions &&
                (companySuggestions.length > 0 || matchedSavedCompanies.length > 0) && (
                <div className="animate-in fade-in zoom-in-95 absolute z-[100] mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl duration-100">
                  {matchedSavedCompanies.length > 0 && (
                    <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Clients enregistrés
                    </p>
                  )}
                  {matchedSavedCompanies.map((client) => (
                    <div
                      key={`saved-${client.id}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleSelectSavedCompany(client);
                      }}
                      className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm text-slate-700 transition-colors last:border-0 hover:bg-slate-50 hover:text-orange-500"
                    >
                      <User size={14} className="shrink-0 text-slate-300" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">
                          {client.displayName || getClientDisplayName(client.payload)}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {[
                            client.payload?.siret
                              ? `SIRET ${formatSiret(client.payload.siret)}`
                              : '',
                            client.email ||
                              client.telephone ||
                              getClientFullLocation(client.payload),
                          ]
                            .filter(Boolean)
                            .join(' - ')}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                        Remplir
                      </span>
                    </div>
                  ))}

                  {matchedSavedCompanies.length > 0 && companySuggestions.length > 0 && (
                    <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Annuaire entreprises
                    </p>
                  )}
                  {companySuggestions.map((company) => (
                    <div
                      key={company.siren}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleSelectCompany(company);
                      }}
                      className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm text-slate-700 transition-colors last:border-0 hover:bg-slate-50 hover:text-orange-500"
                    >
                      <Building2 size={14} className="shrink-0 text-slate-300" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{company.nom_complet}</p>
                        <p className="truncate text-xs text-slate-400">
                          {[
                            company.siege?.siret ? `SIRET ${formatSiret(company.siege.siret)}` : '',
                            [company.siege?.code_postal, company.siege?.libelle_commune]
                              .filter(Boolean)
                              .join(' '),
                          ]
                            .filter(Boolean)
                            .join(' - ')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="nom" className={labelClasses}>
                {isProfessional ? 'Raison sociale' : 'Nom'}
              </label>
              <input
                id="nom"
                name="nom"
                type="text"
                placeholder={isProfessional ? 'SARL Exemple' : 'Dupont'}
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
                {isProfessional ? 'Contact (optionnel)' : 'Prenom'}
              </label>
              <input
                id="prenom"
                name="prenom"
                type="text"
                placeholder={isProfessional ? 'Interlocuteur' : 'Jean'}
                value={formData.prenom}
                onChange={handleChange}
                className={`${inputClasses} ${
                  errors.prenom ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''
                }`}
              />
              {errors.prenom && <p className="mt-1 text-xs text-red-500">{errors.prenom}</p>}
            </div>
          </div>

          {isProfessional && (
            <div className="animate-in fade-in slide-in-from-top-2 grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="siret" className={labelClasses}>
                  SIRET
                </label>
                <input
                  id="siret"
                  name="siret"
                  type="text"
                  placeholder="820 001 014 00035"
                  value={formData.siret}
                  onChange={handleChange}
                  className={inputClasses}
                />
              </div>
              <div>
                <label htmlFor="tvaIntra" className={labelClasses}>
                  TVA intracommunautaire
                </label>
                <input
                  id="tvaIntra"
                  name="tvaIntra"
                  type="text"
                  placeholder={
                    computeFrenchVatNumber(formData.siren || getSirenFromSiret(formData.siret)) ||
                    'FR22820001014'
                  }
                  value={formData.tvaIntra}
                  onChange={handleChange}
                  className={inputClasses}
                />
              </div>

              <div className="md:col-span-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      vatState.isVerified
                        ? 'bg-emerald-100 text-emerald-700'
                        : vatState.vatNumber
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {getTvaVerificationLabel(vatState.status)}
                  </span>

                  {vatState.isVerified && vatVerifiedLabel && (
                    <span className="text-xs text-slate-400">{vatVerifiedLabel}</span>
                  )}

                  <button
                    type="button"
                    onClick={() => void runVatVerification()}
                    disabled={isVerifyingVat || !user}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                      isVerifyingVat || !user
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'
                    }`}
                  >
                    {isVerifyingVat ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <ShieldCheck size={13} />
                    )}
                    Vérifier
                  </button>

                  {!vatState.isVerified && vatState.vatNumber && (
                    <button
                      type="button"
                      onClick={() => setIsConfirmingVat(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:border-orange-300 hover:text-orange-600"
                    >
                      <CheckCircle2 size={13} />
                      Confirmer ce numéro
                    </button>
                  )}
                </div>

                {!vatState.isVerified && vatState.vatNumber && (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                    {CALCULATED_UNVERIFIED_ALERT}
                  </p>
                )}

                {vatState.isVerified && vatState.comment && (
                  <p className="mt-2 text-xs text-slate-500">
                    {getVatSourceLabel(vatState.source)} — {vatState.comment}
                  </p>
                )}

                {vatLookupNotice && (
                  <p className="mt-2 text-xs font-semibold text-slate-500">{vatLookupNotice}</p>
                )}
              </div>
            </div>
          )}

          {(activeSavedClient ||
            showClientSuggestions ||
            (loadingClients && clientLookupTerm.length >= 2)) && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {activeSavedClient && (
                <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                  Client reconnu :{' '}
                  <span className="break-words font-semibold">{activeSavedClient.displayName}</span>
                  {getClientFullLocation(activeSavedClient.payload) ? (
                    <span className="break-words">
                      {' / '}
                      {getClientFullLocation(activeSavedClient.payload)}
                    </span>
                  ) : ''}
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
              value={reference}
              onChange={(event) => onReferenceChange?.(event.target.value)}
              className={inputClasses}
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Liée à ce devis (et non à la fiche client).
            </p>
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-800">Adresse du chantier</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Renseignez les informations uniquement si elles diffèrent de la facturation.
                  </p>
                </div>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    name="nomChantierDifferent"
                    checked={formData.nomChantierDifferent}
                    onChange={handleChange}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-orange-500 transition-colors focus:ring-2 focus:ring-orange-500"
                  />
                  Nom différent
                </label>
              </div>

              {formData.nomChantierDifferent && (
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label htmlFor="nomChantier" className={labelClasses}>
                      Nom chantier
                    </label>
                    <input
                      id="nomChantier"
                      name="nomChantier"
                      type="text"
                      placeholder="Dupont"
                      value={formData.nomChantier}
                      onChange={handleChange}
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label htmlFor="prenomChantier" className={labelClasses}>
                      Prenom chantier
                    </label>
                    <input
                      id="prenomChantier"
                      name="prenomChantier"
                      type="text"
                      placeholder="Jean"
                      value={formData.prenomChantier}
                      onChange={handleChange}
                      className={inputClasses}
                    />
                  </div>
                </div>
              )}

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
