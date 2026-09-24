'use client';

/**
 * Organisation d'une page de réglages en groupes titrés, avec une barre
 * d'ancres en tête pour aller droit au groupe voulu.
 *
 * `groups` : [{ id, label, icon, description }]. Le même tableau alimente la
 * barre (SettingsNav) et les en-têtes (SettingsGroup / SettingsGroupHeading).
 */

export function SettingsNav({ groups }) {
  return (
    <nav aria-label="Sections de la page" className="flex flex-wrap gap-2">
      {groups.map((group) => (
        <a
          key={group.id}
          href={`#${group.id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:border-orange-300 hover:text-orange-600"
        >
          <group.icon size={14} />
          {group.label}
        </a>
      ))}
    </nav>
  );
}

/** En-tête seul (pour un groupe dont les cartes suivent sans conteneur). */
export function SettingsGroupHeading({ groups, id, actions = null }) {
  const group = groups.find((entry) => entry.id === id);
  const Icon = group.icon;
  return (
    <div id={id} className="flex flex-wrap items-start justify-between gap-3 px-1 scroll-mt-24">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-xl bg-slate-900 p-2 text-white">
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-base font-black uppercase tracking-widest text-slate-900">
            {group.label}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">{group.description}</p>
        </div>
      </div>
      {actions}
    </div>
  );
}

/** En-tête + cartes du groupe, espacées. */
export function SettingsGroup({ groups, id, actions = null, children }) {
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3 sm:space-y-4">
      <SettingsGroupHeading groups={groups} id={id} actions={actions} />
      <div className="space-y-4 sm:space-y-5">{children}</div>
    </section>
  );
}
