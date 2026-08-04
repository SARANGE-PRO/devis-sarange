'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';

const BAN_SEARCH_URL = 'https://api-adresse.data.gouv.fr/search/';
const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 4;

/**
 * Autocomplétion d'adresse via la Base Adresse Nationale (api-adresse.data.
 * gouv.fr) — API publique du gouvernement français, gratuite et sans clé,
 * standard pour ce type de formulaire côté français.
 *
 * `onSelect` reçoit l'adresse complète structurée (voie, code postal, ville)
 * une fois qu'une suggestion est choisie ; `onChange` suit la frappe libre
 * pour ne jamais bloquer la saisie si l'API est indisponible.
 */
export default function AddressAutocomplete({ value, onChange, onSelect, placeholder, id }) {
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = (query) => {
    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);

    fetch(`${BAN_SEARCH_URL}?q=${encodeURIComponent(query)}&limit=5&autocomplete=1`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (currentRequestId !== requestIdRef.current) return;
        setSuggestions(Array.isArray(data?.features) ? data.features : []);
        setIsOpen(true);
      })
      .catch(() => {
        if (currentRequestId !== requestIdRef.current) return;
        setSuggestions([]);
      })
      .finally(() => {
        if (currentRequestId !== requestIdRef.current) return;
        setIsLoading(false);
      });
  };

  const handleInputChange = (event) => {
    const nextValue = event.target.value;
    onChange?.(nextValue);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (nextValue.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(nextValue.trim()), DEBOUNCE_MS);
  };

  const handleSelect = (feature) => {
    const properties = feature?.properties || {};
    onChange?.(properties.label || '');
    onSelect?.({
      label: properties.label || '',
      adresse: [properties.housenumber, properties.street || properties.name].filter(Boolean).join(' '),
      codePostal: properties.postcode || '',
      ville: properties.city || '',
    });
    setIsOpen(false);
    setSuggestions([]);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-3 focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-500/10">
        <MapPin size={16} className="shrink-0 text-slate-400" />
        <input
          id={id}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full min-w-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
        />
        {isLoading && <Loader2 size={14} className="shrink-0 animate-spin text-slate-400" />}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {suggestions.map((feature) => (
            <li key={feature.properties?.id || feature.properties?.label}>
              <button
                type="button"
                onClick={() => handleSelect(feature)}
                className="flex w-full items-start gap-2 px-3.5 py-2.5 text-left text-sm text-slate-700 hover:bg-orange-50"
              >
                <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                <span>{feature.properties?.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
