'use client';

// Prix du volet roulant monobloc intégré, sous le choix de la manœuvre et de
// la couleur : le montant retenu (grille « Volet Filaire » + manœuvre, ou prix
// saisi en place, indispensable en aluminium où la grille vaut 0) et le choix
// d'afficher le volet sur sa propre ligne du devis, avec son prix. Le total de
// la ligne ne change pas selon l'affichage : seule sa présentation diffère.

import PosePriceEditor from '@/components/PosePriceEditor';

const formatAmount = (value) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(value) || 0
  );

export default function VoletMonoblocPrixOptions({ pricing, separate, priceOverride, onChange }) {
  const autoPrice = Number(pricing?.autoPrice) || 0;
  const hasGridPrice = Boolean(pricing?.hasGridPrice);
  const hasOverride = priceOverride !== null && priceOverride !== undefined && priceOverride !== '';
  const needsPrice = !hasGridPrice && !hasOverride;

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-700">Prix du volet HT (par unité)</p>
          <p className="text-xs text-slate-400">
            {hasGridPrice
              ? 'Grille « Volet Filaire » aux dimensions de la menuiserie, manœuvre comprise. Cliquer pour saisir un autre prix.'
              : 'Aucun tarif de grille pour ces dimensions : cliquer pour saisir le prix.'}
          </p>
        </div>
        <PosePriceEditor
          value={priceOverride}
          defaultValue={autoPrice}
          onChange={(value) => onChange({ voletMonoblocPriceOverride: value })}
          subject="Prix du volet"
          reference="tarif grille"
        />
      </div>

      {needsPrice && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Sans prix saisi, le volet compte pour {formatAmount(autoPrice)} € dans la ligne (en aluminium, le
          prix de la menuiserie passe par la marge nette : saisis ici celui du volet).
        </p>
      )}

      <label className="mt-3 flex items-start gap-3 text-sm font-semibold text-slate-700">
        <input
          type="checkbox"
          checked={Boolean(separate)}
          onChange={(event) => onChange({ voletMonoblocSeparate: event.target.checked })}
          className="mt-0.5 h-4 w-4 accent-orange-500"
        />
        <span>
          Prix du volet séparé sur le devis
          <span className="mt-0.5 block text-xs font-normal text-slate-400">
            La menuiserie, puis une sous-ligne « Volet roulant monobloc intégré » avec son prix, puis la
            pose (toujours unique). La remise s&apos;applique aux deux ; la marge nette reste sur la
            menuiserie. Le total de la ligne ne change pas.
          </span>
        </span>
      </label>
    </div>
  );
}
