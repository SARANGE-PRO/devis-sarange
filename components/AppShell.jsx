'use client';

import { usePathname } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import Sidebar from '@/components/Sidebar';

// Mappe les routes vers un titre court pour la topbar mobile
const PAGE_TITLES = {
  '/':          'Nouveau devis',
  '/devis':     'Mes devis',
  '/clients':   'Clients',
  '/catalogue': 'Catalogue',
};

export default function AppShell({ title, subtitle, actions = null, children }) {
  const pathname = usePathname();
  const mobileTitle = PAGE_TITLES[pathname] ?? title;

  return (
    <div className="relative min-h-screen bg-slate-50">
      {/* ── Topbar mobile ──────────────────────────────────────────────── */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm lg:hidden">
        {/* Logo + titre de la page */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900">
            <span className="text-xs font-black text-white">
              S<span className="text-orange-500">.</span>
            </span>
          </div>
          <span className="truncate text-sm font-bold text-slate-900">{mobileTitle}</span>
        </div>

        {/* Actions contextuelles (ex: bouton Retour sur la page devis) */}
        {actions && <div className="shrink-0 ml-2">{actions}</div>}
      </div>

      {/* ── Sidebar desktop ─────────────────────────────────────────────── */}
      <Sidebar />

      {/* ── Main ────────────────────────────────────────────────────────── */}
      {/*
          Mobile  : pt-14 (topbar) + pb-20 (bottom nav)
          Desktop : pl-64              (sidebar)
      */}
      <main className="min-h-screen pt-14 pb-20 lg:pl-64 lg:pt-0 lg:pb-0">
        <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-10">
          {/* Page header — desktop seulement (mobile utilise la topbar) */}
          <div className="mb-6 hidden lg:flex lg:flex-row lg:items-start lg:justify-between lg:gap-4">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
              {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            </div>
            {actions && <div className="shrink-0">{actions}</div>}
          </div>

          {children}
        </div>
      </main>

      {/* ── Bottom navigation mobile ────────────────────────────────────── */}
      <BottomNav />
    </div>
  );
}
