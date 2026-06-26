'use client';

import { useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  DoorOpen,
  ExternalLink,
  Eye,
  Info,
  Link2,
  Lock,
  Sparkles,
  Tag,
} from 'lucide-react';
import AppShell from '@/components/AppShell';

// Domaine public de partage (les liens doivent toujours pointer vers la prod,
// quel que soit le poste depuis lequel le commercial les copie).
const PUBLIC_BASE = (
  process.env.NEXT_PUBLIC_APP_URL || 'https://devis-sarange.vercel.app'
).replace(/\/$/, '');

// Les différents liens du sélecteur de panneaux, selon le mode d'affichage.
const CATALOGUE_LINKS = [
  {
    id: 'client',
    badge: 'À montrer au client',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    icon: Eye,
    iconClass: 'bg-emerald-100 text-emerald-600',
    ringClass: 'hover:border-emerald-300',
    title: 'Catalogue client — sans prix',
    description:
      "La gamme complète des panneaux de porte d'entrée, présentée sans aucun prix ni bouton de sélection. Parfait pour faire choisir un modèle en rendez-vous ou par message.",
    path: '/selecteur-panneaux/selecteur.html?mode=catalogue',
  },
  {
    id: 'inclus',
    badge: 'Sans supplément',
    badgeClass: 'bg-sky-100 text-sky-700',
    icon: Tag,
    iconClass: 'bg-sky-100 text-sky-600',
    ringClass: 'hover:border-sky-300',
    title: 'Panneaux inclus — tout compris',
    description:
      "N'affiche que les modèles compris dans le tarif de base, sans plus-value. Idéal pour rassurer un client sur ce qui est inclus sans aucun surcoût.",
    path: '/selecteur-panneaux/selecteur.html?mode=catalogue&inclus=1',
  },
  {
    id: 'pro',
    badge: 'Usage interne',
    badgeClass: 'bg-orange-100 text-orange-700',
    icon: Lock,
    iconClass: 'bg-orange-100 text-orange-600',
    ringClass: 'hover:border-orange-300',
    title: 'Catalogue pro — prix & plus-values',
    description:
      "Vue commerciale complète : prix d'achat après hausse, plus-values des modèles premium et parcours de sélection. À ne pas partager avec le client.",
    path: '/selecteur-panneaux/selecteur.html',
  },
];

const GAMMES = [
  { name: 'ELA', count: 70 },
  { name: 'REVA', count: 82 },
  { name: 'CLASSICO', count: 18 },
  { name: 'LINA', count: 16 },
  { name: 'LEO', count: 20 },
  { name: 'GEO', count: 10 },
];

function CatalogueLinkCard({ link }) {
  const [copied, setCopied] = useState(false);
  const Icon = link.icon;
  const fullUrl = `${PUBLIC_BASE}${link.path}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Repli : sélection manuelle si l'API Clipboard est indisponible.
      window.prompt('Copiez ce lien :', fullUrl);
    }
  };

  return (
    <div
      className={`group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${link.ringClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-xl p-2.5 ${link.iconClass}`}>
          <Icon size={20} />
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${link.badgeClass}`}
        >
          {link.badge}
        </span>
      </div>

      <h3 className="mt-4 text-base font-bold text-slate-900">{link.title}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500">
        {link.description}
      </p>

      {/* Lien affiché (mono, tronqué) */}
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <Link2 size={14} className="shrink-0 text-slate-400" />
        <span className="truncate font-mono text-xs text-slate-500">{fullUrl}</span>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        <a
          href={fullUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800"
        >
          <ExternalLink size={15} />
          Ouvrir
        </a>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copier le lien"
          className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
            copied
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? 'Copié !' : 'Copier'}
        </button>
      </div>
    </div>
  );
}

export default function ParametresPage() {
  return (
    <AppShell
      title="Paramètres"
      subtitle="Liens à partager et ressources de l'application."
    >
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Bandeau d'introduction */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
              <DoorOpen size={24} className="text-orange-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-orange-400">
                Catalogues panneaux de porte
              </p>
              <h3 className="mt-1 text-xl font-black sm:text-2xl">
                Tous vos liens de catalogue, au même endroit
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
                Trois vues du même catalogue selon le contexte : une pour présenter au
                client, une pour les modèles inclus sans supplément, et une interne avec les
                prix. Ouvrez-les en un clic ou copiez le lien pour l&apos;envoyer.
              </p>
            </div>
          </div>
        </section>

        {/* Section liens */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-2">
            <div className="rounded-xl bg-orange-100 p-2 text-orange-600">
              <Link2 size={18} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-orange-500">
                Liens de partage
              </p>
              <h3 className="text-lg font-bold text-slate-900">Les 3 catalogues</h3>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {CATALOGUE_LINKS.map((link) => (
              <CatalogueLinkCard key={link.id} link={link} />
            ))}
          </div>
        </section>

        {/* Gammes disponibles */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-xl bg-violet-100 p-2 text-violet-600">
              <BookOpen size={18} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-violet-500">
                Contenu
              </p>
              <h3 className="text-lg font-bold text-slate-900">Gammes disponibles</h3>
            </div>
          </div>
          <p className="mb-4 text-sm text-slate-500">
            Le catalogue regroupe l&apos;ensemble des modèles, toutes gammes confondues.
            Chaque panneau peut être fabriqué dans la couleur définie au devis, sans
            supplément.
          </p>
          <div className="flex flex-wrap gap-2">
            {GAMMES.map((gamme) => (
              <span
                key={gamme.name}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm font-semibold text-slate-700"
              >
                <Sparkles size={13} className="text-orange-400" />
                {gamme.name}
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-400">
                  {gamme.count}
                </span>
              </span>
            ))}
          </div>
        </section>

        {/* Bon à savoir */}
        <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <Info size={18} className="mt-0.5 shrink-0 text-sky-600" />
            <div className="text-sm leading-relaxed text-sky-900">
              <p className="font-bold">Bon à savoir</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sky-800">
                <li>
                  Les liens « client » et « inclus » masquent automatiquement les prix : vous
                  pouvez les envoyer sans risque.
                </li>
                <li>
                  Vous pouvez imposer un coloris en ajoutant{' '}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-sky-700">
                    ?couleur=Gris%20Anthracite
                  </code>{' '}
                  à la fin d&apos;un lien.
                </li>
                <li>
                  À la signature d&apos;un devis, le bon catalogue (couleur incluse) s&apos;ouvre
                  déjà automatiquement pour le client.
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
