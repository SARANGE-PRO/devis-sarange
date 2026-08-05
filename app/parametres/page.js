'use client';

import { useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  ClipboardCheck,
  Copy,
  DoorOpen,
  ExternalLink,
  Eye,
  FileText,
  Info,
  Link2,
  ShieldCheck,
  Sparkles,
  Tag,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import QrCode from '@/components/QrCode';
import {
  getInsuranceStatus,
  normalizeCompanyInsurance,
} from '@/lib/company-insurance.mjs';
import { loadCompanyInsurance, saveCompanyInsurance } from '@/lib/insurance-settings';

// Domaine public de partage (les liens doivent toujours pointer vers la prod,
// quel que soit le poste depuis lequel le commercial les copie).
const PUBLIC_BASE = (
  process.env.NEXT_PUBLIC_APP_URL || 'https://devis.sarange.fr'
).replace(/\/$/, '');

// Les 3 vues du sélecteur de panneaux, classées du plus envoyé au plus rare.
const CATALOGUE_LINKS = [
  {
    id: 'inclus',
    badge: '★ Le plus envoyé',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    icon: Eye,
    iconClass: 'bg-emerald-100 text-emerald-600',
    ringClass: 'hover:border-emerald-300',
    title: 'Catalogue client — sans surcoût',
    description:
      "N'affiche que les modèles compris dans le tarif de base, sans aucune plus-value par rapport à votre devis. C'est le lien à envoyer en priorité : le client choisit sans aucun surcoût.",
    path: '/selecteur-panneaux/selecteur.html?mode=catalogue&inclus=1',
  },
  {
    id: 'pro',
    badge: 'À envoyer régulièrement',
    badgeClass: 'bg-amber-100 text-amber-700',
    icon: Tag,
    iconClass: 'bg-amber-100 text-amber-600',
    ringClass: 'hover:border-amber-300',
    title: 'Catalogue client — avec suppléments',
    description:
      "Affiche pour chaque modèle le supplément par rapport au panneau standard (et non un prix d'achat). À envoyer aux clients : c'est l'intermédiaire entre le catalogue sans surcoût et celui sans aucun prix.",
    path: '/selecteur-panneaux/selecteur.html',
  },
  {
    id: 'complet',
    badge: 'Sur demande spécifique',
    badgeClass: 'bg-slate-100 text-slate-600',
    icon: Sparkles,
    iconClass: 'bg-slate-100 text-slate-600',
    ringClass: 'hover:border-slate-300',
    title: 'Catalogue complet — sans prix',
    description:
      "Toute la gamme, y compris les modèles les plus chers, sans aucun prix ni supplément affiché. À réserver aux demandes spécifiques (recherche d'un modèle précis en rendez-vous).",
    path: '/selecteur-panneaux/selecteur.html?mode=catalogue',
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
      className={`group flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${link.ringClass}`}
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
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-500">{fullUrl}</span>
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

const INSURANCE_FIELDS = [
  { key: 'insurer', label: 'Assureur', type: 'text', placeholder: 'BPCE IARD' },
  { key: 'contractNumber', label: 'Numéro de contrat', type: 'text', placeholder: '194388251 R 002' },
  { key: 'activities', label: 'Activités couvertes', type: 'text', placeholder: 'Fabrication et pose de menuiseries extérieures' },
  { key: 'startDate', label: 'Début de validité', type: 'date' },
  { key: 'endDate', label: 'Fin de validité', type: 'date' },
  { key: 'attestationUrl', label: "Lien vers l'attestation (PDF)", type: 'url', placeholder: 'https://…' },
];

// Vrai uniquement côté client après hydratation (localStorage disponible),
// sans setState dans un effet ni mismatch d'hydratation.
const subscribeNoop = () => () => {};
const useIsMounted = () =>
  useSyncExternalStore(subscribeNoop, () => true, () => false);

// Lien FIXE (pas un token par session) : donné une fois aux poseurs, à
// utiliser quand le bon de fin de chantier n'a pas pu être préparé à
// l'avance depuis une fiche devis. Voir components/GenericCompletionPage.jsx.
function GenericCompletionLinkSection() {
  const [copied, setCopied] = useState(false);
  const fullUrl = `${PUBLIC_BASE}/reception-generale`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copiez ce lien :', fullUrl);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-xl bg-orange-100 p-2 text-orange-600">
          <ClipboardCheck size={18} />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-orange-500">Bon de fin de chantier</p>
          <h3 className="text-lg font-bold text-slate-900">Version générale (sans devis lié)</h3>
        </div>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        À utiliser quand le bon n&apos;a pas pu être préparé à l&apos;avance depuis une fiche devis : le client
        saisit lui-même ses coordonnées. Ce lien est fixe (pas un lien à usage unique) : donnez-le une fois à vos
        poseurs pour qu&apos;ils l&apos;utilisent directement en fin d&apos;intervention.
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Link2 size={14} className="shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-500">{fullUrl}</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
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
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                copied ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Copié !' : 'Copier le lien'}
            </button>
          </div>
        </div>

        {/* QR code du lien fixe : à imprimer/enregistrer pour que le poseur le
            fasse simplement scanner au client en fin d'intervention. Généré
            localement (lib/qr-code.mjs) : aucun service externe, donc aucun
            risque de blocage réseau ou de pistage de l'URL. */}
        <div className="flex shrink-0 flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <QrCode value={fullUrl} size={140} className="rounded-lg" />
          <p className="max-w-[150px] text-center text-[11px] leading-tight text-slate-400">
            À faire scanner par le client (clic droit pour enregistrer / imprimer)
          </p>
        </div>
      </div>
    </section>
  );
}

function InsuranceSection() {
  const isMounted = useIsMounted();
  // `draft` = modifications en cours ; tant qu'aucune édition n'a eu lieu, on
  // affiche la valeur stockée sur ce poste (défauts au rendu serveur).
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(false);
  const insurance =
    draft ?? (isMounted ? loadCompanyInsurance() : normalizeCompanyInsurance({}));

  const status = getInsuranceStatus(insurance);

  const handleChange = (key, value) => {
    setDraft({ ...insurance, [key]: value });
    setSaved(false);
  };

  const handleSave = () => {
    setDraft(saveCompanyInsurance(insurance));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const statusBadge = status.isExpired
    ? { label: `Expirée depuis le ${status.endDateLabel}`, className: 'bg-red-100 text-red-700' }
    : status.expiresSoon
      ? { label: `Expire le ${status.endDateLabel} (${status.daysLeft} j)`, className: 'bg-amber-100 text-amber-700' }
      : { label: `Valide jusqu'au ${status.endDateLabel}`, className: 'bg-emerald-100 text-emerald-700' };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-emerald-100 p-2 text-emerald-600">
            <ShieldCheck size={18} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-emerald-600">
              Paramètres société
            </p>
            <h3 className="text-lg font-bold text-slate-900">Assurance décennale</h3>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusBadge.className}`}>
          {statusBadge.label}
        </span>
      </div>

      <p className="mb-4 text-sm text-slate-500">
        Ces informations alimentent la carte « Garanties et assurances » et l&apos;article
        Garanties des CGV de chaque devis <strong>avec pose</strong>. Mettez à jour la
        période à chaque renouvellement : les devis déjà finalisés conservent leur version
        figée.
      </p>

      {(status.isExpired || status.expiresSoon) && (
        <div
          className={`mb-4 flex items-start gap-3 rounded-xl border-2 p-4 ${
            status.isExpired ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
          }`}
        >
          <AlertTriangle
            size={18}
            className={`mt-0.5 shrink-0 ${status.isExpired ? 'text-red-500' : 'text-amber-500'}`}
          />
          <p
            className={`text-sm font-semibold ${
              status.isExpired ? 'text-red-700' : 'text-amber-700'
            }`}
          >
            {status.isExpired
              ? "L'attestation décennale est EXPIRÉE : les nouveaux devis avec pose afficheront une période dépassée. Renouvelez le contrat puis mettez à jour les dates ci-dessous."
              : "L'attestation décennale expire bientôt : pensez à demander la nouvelle attestation à votre assureur puis à mettre à jour les dates ci-dessous."}
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {INSURANCE_FIELDS.map((field) => (
          <label key={field.key} className={field.key === 'activities' || field.key === 'attestationUrl' ? 'block md:col-span-2' : 'block'}>
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">
              {field.label}
            </span>
            <input
              type={field.type}
              value={insurance[field.key] || ''}
              placeholder={field.placeholder || ''}
              onChange={(event) => handleChange(field.key, event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:border-slate-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
            />
          </label>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-colors ${
            saved ? 'bg-emerald-500' : 'bg-slate-900 hover:bg-slate-800'
          }`}
        >
          {saved ? <Check size={15} /> : <ShieldCheck size={15} />}
          {saved ? 'Enregistré !' : 'Enregistrer'}
        </button>
        {insurance.attestationUrl && (
          <a
            href={insurance.attestationUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <FileText size={15} />
            Ouvrir l&apos;attestation
          </a>
        )}
        <span className="text-xs text-slate-400">
          Réglage enregistré sur ce poste (navigateur).
        </span>
      </div>
    </section>
  );
}

export default function ParametresPage() {
  return (
    <AppShell
      title="Paramètres"
      subtitle="Catalogues à partager et paramètres société."
    >
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        <InsuranceSection />
        <GenericCompletionLinkSection />
        {/* Bandeau d'introduction */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-sm sm:p-8">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="shrink-0 rounded-2xl bg-white/10 p-2.5 backdrop-blur sm:p-3">
              <DoorOpen size={24} className="text-orange-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-orange-400 sm:tracking-[0.24em]">
                Catalogues panneaux de porte
              </p>
              <h3 className="mt-1 text-xl font-black sm:text-2xl">
                Tous vos liens de catalogue, au même endroit
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
                Trois vues clients du même catalogue selon ce que vous montrez : sans aucun
                surcoût (le plus envoyé), avec les suppléments par rapport au standard, ou sans
                aucun prix. Ouvrez-les en un clic ou copiez le lien pour l&apos;envoyer.
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

          <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
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
                  Aucun de ces liens n&apos;affiche votre prix d&apos;achat : « sans surcoût »
                  ne montre que les modèles inclus, « avec suppléments » montre l&apos;écart au
                  modèle standard, et « sans prix » ne montre aucun montant.
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
