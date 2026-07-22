'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Check, CheckCircle2, Sun } from 'lucide-react';
import {
  VELUX_ACCESSORIES,
  VELUX_FINISHES,
  VELUX_FLASHINGS,
  VELUX_OPENINGS,
  VELUX_RANGES,
  VELUX_SIZES,
  buildVeluxDesignation,
  createVeluxConfiguration,
  getVeluxOpening,
  getVeluxPrefix,
} from '@/lib/velux-config';

/**
 * Carte d'option sélectionnable : bordure en surbrillance (ring-2 ring-blue-500)
 * quand l'option est active.
 */
function OptionCard({ isSelected, onSelect, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`relative min-w-0 break-words rounded-2xl border bg-white p-4 text-left transition-all ${
        isSelected
          ? 'border-transparent ring-2 ring-blue-500 shadow-md'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
      } ${className}`}
    >
      {/* Coche à cheval sur le coin : z-10 pour passer AU-DESSUS des photos,
          hors du contenu pour ne jamais chevaucher les titres. */}
      {isSelected && (
        <span className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white shadow-md ring-2 ring-white">
          <Check size={13} strokeWidth={3} />
        </span>
      )}
      {children}
    </button>
  );
}

function SectionTitle({ step, title, hint }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">
        {step}
      </span>
      <div>
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-700">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}

/**
 * Configurateur Velux (Hors catalogue) — configuration technique uniquement,
 * strictement sans prix. Au clic « Valider cette configuration », appelle
 * `onValidate` avec l'objet {@link import('@/lib/velux-config').VeluxConfiguration}.
 *
 * @param {{ onValidate?: (configuration: import('@/lib/velux-config').VeluxConfiguration) => void, initialSelection?: object, repere?: string, onRepereChange?: (value: string) => void }} props
 */
export default function VeluxConfigurator({
  onValidate,
  initialSelection = {},
  repere = '',
  onRepereChange,
}) {
  const [opening, setOpening] = useState(initialSelection.opening || null);
  const [finish, setFinish] = useState(initialSelection.finish || null);
  const [sizeCode, setSizeCode] = useState(initialSelection.sizeCode || null);
  const [range, setRange] = useState(initialSelection.range || null);
  const [flashing, setFlashing] = useState(initialSelection.flashing || null);
  const [accessory, setAccessory] = useState(initialSelection.accessory || 'aucun');
  // Pose sur site : optionnelle, prix HT libre saisi ici (reporté en sous-ligne
  // « Pose » du devis, comme pour les menuiseries).
  const [poseIncluded, setPoseIncluded] = useState(Boolean(initialSelection.poseIncluded));
  const [posePriceHt, setPosePriceHt] = useState(
    initialSelection.posePriceHt != null ? String(initialSelection.posePriceHt) : ''
  );

  const parsedPosePrice = Number.parseFloat(posePriceHt);
  const isPoseValid = !poseIncluded || (Number.isFinite(parsedPosePrice) && parsedPosePrice >= 0);

  const selection = { opening, finish, sizeCode, range, flashing, accessory };
  const prefix = getVeluxPrefix(opening, finish);
  const designation = buildVeluxDesignation(selection);
  const configuration = useMemo(() => {
    const base = createVeluxConfiguration({ opening, finish, sizeCode, range, flashing, accessory });
    if (!base) return null;
    const poseValid = !poseIncluded || (Number.isFinite(parsedPosePrice) && parsedPosePrice >= 0);
    if (!poseValid) return null;
    const poseHt = poseIncluded ? Math.round(parsedPosePrice * 100) / 100 : 0;
    return {
      ...base,
      pose: { included: poseIncluded, priceHt: poseHt },
      labels: {
        ...base.labels,
        pose: poseIncluded ? `Avec pose (${poseHt.toFixed(2)} € HT)` : 'Sans pose',
      },
    };
  }, [opening, finish, sizeCode, range, flashing, accessory, poseIncluded, parsedPosePrice]);

  const previewOpening = getVeluxOpening(opening) || getVeluxOpening('rotation');
  const missingSteps = [
    !opening && "le type d'ouverture",
    !finish && 'la finition',
    !sizeCode && 'la taille',
    !range && 'la gamme',
    !flashing && "le raccord d'étanchéité",
    !isPoseValid && 'le prix de la pose',
  ].filter(Boolean);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      {/* ── Étapes de configuration ─────────────────────────────────────── */}
      <div className="space-y-8">
        {/* 1 · Type d'ouverture */}
        <section className="space-y-3">
          <SectionTitle
            step={1}
            title="Type d'ouverture"
            hint="Définit le mouvement du battant et le préfixe de la référence."
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
            {VELUX_OPENINGS.map((entry) => (
              <OptionCard
                key={entry.id}
                isSelected={opening === entry.id}
                onSelect={() => setOpening(entry.id)}
              >
                <div className="relative mx-auto mb-3 h-32 w-full overflow-hidden rounded-xl bg-slate-50">
                  <Image
                    src={entry.imageSrc}
                    alt={`Fenêtre de toit Velux à ${entry.label.toLowerCase()}`}
                    fill
                    sizes="240px"
                    className="object-contain p-2"
                  />
                </div>
                <p className="text-sm font-bold text-slate-900">{entry.label}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">{entry.description}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{entry.details}</p>
              </OptionCard>
            ))}
          </div>
        </section>

        {/* 2 · Finition */}
        <section className="space-y-3">
          <SectionTitle
            step={2}
            title="Finition intérieure"
            hint="Bois → GGL / GPL · Polyuréthane → GGU / GPU."
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
            {VELUX_FINISHES.map((entry) => (
              <OptionCard
                key={entry.id}
                isSelected={finish === entry.id}
                onSelect={() => setFinish(entry.id)}
              >
                <p className="text-sm font-bold text-slate-900">{entry.label}</p>
                <p className="mt-0.5 text-[11px] font-black uppercase tracking-wide text-blue-600">
                  {entry.commercialName}
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                  {entry.description}
                </p>
                {entry.maintenanceFree && (
                  <span className="mt-2 inline-block rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700">
                    Sans entretien
                  </span>
                )}
              </OptionCard>
            ))}
          </div>
        </section>

        {/* 3 · Taille */}
        <section className="space-y-3">
          <SectionTitle
            step={3}
            title="Taille standard"
            hint="Code dimensionnel Velux · largeur x hauteur en cm."
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3">
            {VELUX_SIZES.map((entry) => (
              <OptionCard
                key={entry.code}
                isSelected={sizeCode === entry.code}
                onSelect={() => setSizeCode(entry.code)}
                className="text-center"
              >
                <p className="text-sm font-black text-slate-900">{entry.code}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {entry.widthCm} x {entry.heightCm} cm
                </p>
              </OptionCard>
            ))}
          </div>
        </section>

        {/* 4 · Gamme */}
        <section className="space-y-3">
          <SectionTitle step={4} title="Gamme" hint="Niveau d'équipement du vitrage." />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
            {VELUX_RANGES.map((entry) => (
              <OptionCard
                key={entry.id}
                isSelected={range === entry.id}
                onSelect={() => setRange(entry.id)}
              >
                <p className="text-sm font-bold text-slate-900">{entry.label}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                  {entry.description}
                </p>
              </OptionCard>
            ))}
          </div>
        </section>

        {/* 5 · Type de toiture / Raccord d'étanchéité */}
        <section className="space-y-3">
          <SectionTitle
            step={5}
            title="Type de toiture / Raccord d'étanchéité"
            hint="Obligatoire — assure l'intégration parfaite à la couverture."
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
            {VELUX_FLASHINGS.map((entry) => (
              <OptionCard
                key={entry.id}
                isSelected={flashing === entry.id}
                onSelect={() => setFlashing(entry.id)}
              >
                <p className="text-sm font-bold text-slate-900">
                  {entry.code} <span className="font-semibold text-slate-500">· {entry.label}</span>
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                  {entry.description}
                </p>
              </OptionCard>
            ))}
          </div>
        </section>

        {/* 6 · Stores et équipements */}
        <section className="space-y-3">
          <SectionTitle
            step={6}
            title="Stores et équipements"
            hint="Optionnel — un seul équipement par fenêtre."
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
            {VELUX_ACCESSORIES.map((entry) => (
              <OptionCard
                key={entry.id}
                isSelected={accessory === entry.id}
                onSelect={() => setAccessory(entry.id)}
              >
                <p className="text-sm font-bold text-slate-900">{entry.label}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  {entry.description}
                </p>
              </OptionCard>
            ))}
          </div>
        </section>

        {/* 7 · Pose sur site */}
        <section className="space-y-3">
          <SectionTitle
            step={7}
            title="Pose"
            hint="Optionnelle — prix HT libre, affiché en sous-ligne « Pose » du devis."
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
            <OptionCard isSelected={!poseIncluded} onSelect={() => setPoseIncluded(false)}>
              <p className="text-sm font-bold text-slate-900">Sans pose</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                Fourniture seule de la fenêtre de toit.
              </p>
            </OptionCard>
            <OptionCard isSelected={poseIncluded} onSelect={() => setPoseIncluded(true)}>
              <p className="text-sm font-bold text-slate-900">Avec pose</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                Dépose éventuelle, pose et raccordement d&apos;étanchéité par nos équipes.
              </p>
            </OptionCard>
          </div>
          {poseIncluded && (
            <div className="max-w-[240px]">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Prix HT de la pose
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  value={posePriceHt}
                  onChange={(event) => setPosePriceHt(event.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 pr-10 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                  €
                </span>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── Résumé dynamique ────────────────────────────────────────────── */}
      <aside className="xl:sticky xl:top-6 xl:self-start">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
              <Sun size={14} className="text-blue-500" />
              Votre configuration
            </p>
          </div>

          <div className="relative h-52 bg-slate-50">
            <Image
              key={previewOpening.id}
              src={previewOpening.imageSrc}
              alt={`Aperçu fenêtre de toit Velux ${previewOpening.label}`}
              fill
              sizes="380px"
              className="object-contain p-4"
            />
            {opening && (
              <span className="absolute left-3 top-3 rounded-full bg-blue-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                {previewOpening.label}
              </span>
            )}
          </div>

          <div className="space-y-4 p-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Référence générée
              </p>
              <p
                data-testid="velux-designation"
                className={`mt-1 text-base font-black leading-snug ${
                  designation ? 'text-slate-900' : 'text-slate-300'
                }`}
              >
                {designation || 'Velux — complétez la configuration'}
              </p>
              {prefix && (
                <span className="mt-2 inline-block rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-black tracking-widest text-white">
                  {prefix}
                </span>
              )}
            </div>

            <dl className="space-y-2 border-t border-slate-100 pt-4 text-xs">
              {[
                ['Ouverture', configuration?.labels.opening || (opening ? previewOpening.label : '—')],
                [
                  'Finition',
                  finish
                    ? `${VELUX_FINISHES.find((f) => f.id === finish)?.label} (${VELUX_FINISHES.find((f) => f.id === finish)?.commercialName})`
                    : '—',
                ],
                [
                  'Taille',
                  sizeCode
                    ? `${sizeCode} · ${VELUX_SIZES.find((s) => s.code === sizeCode)?.widthCm} x ${VELUX_SIZES.find((s) => s.code === sizeCode)?.heightCm} cm`
                    : '—',
                ],
                ['Gamme', range ? VELUX_RANGES.find((r) => r.id === range)?.label : '—'],
                [
                  'Raccord',
                  flashing
                    ? `${VELUX_FLASHINGS.find((f) => f.id === flashing)?.code} (${VELUX_FLASHINGS.find((f) => f.id === flashing)?.label})`
                    : '—',
                ],
                ['Équipement', VELUX_ACCESSORIES.find((a) => a.id === accessory)?.label || 'Aucun'],
                [
                  'Pose',
                  poseIncluded
                    ? Number.isFinite(parsedPosePrice)
                      ? `Incluse · ${parsedPosePrice.toFixed(2)} € HT`
                      : 'Incluse — saisir le prix'
                    : 'Sans pose',
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 font-semibold text-slate-400">{label}</dt>
                  <dd className="text-right font-bold text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>

            {/* Repère (localisation) : saisi ICI, avant validation, pour être
                sûr qu'il parte avec l'article (affiché sur le devis PDF). */}
            {onRepereChange && (
              <div className="border-t border-slate-100 pt-4">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Repère (ex : SDB, Chambre 1, Cuisine)
                </label>
                <input
                  type="text"
                  value={repere}
                  onChange={(event) => onRepereChange(event.target.value)}
                  placeholder="Localisation de la fenêtre de toit..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </div>
            )}

            {!configuration && (
              <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-semibold text-blue-700">
                Il reste à choisir : {missingSteps.join(', ')}.
              </p>
            )}

            <button
              type="button"
              disabled={!configuration}
              onClick={() => {
                if (configuration && onValidate) onValidate(configuration);
              }}
              className={`flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-bold transition-all ${
                configuration
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700'
                  : 'cursor-not-allowed bg-slate-200 text-slate-400'
              }`}
            >
              <CheckCircle2 size={17} />
              Valider cette configuration
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
