'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from '@/components/Sidebar';

export default function AppShell({ title, subtitle, actions = null, children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="relative min-h-screen bg-slate-50">
      <div className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900">
            <span className="text-sm font-black text-white">
              S<span className="text-orange-500">.</span>
            </span>
          </div>
          <span className="text-lg font-bold text-slate-900">Devis Sarange</span>
        </div>
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="rounded-lg bg-slate-100 p-2 text-slate-600 transition-colors hover:text-slate-900"
        >
          <Menu size={24} />
        </button>
      </div>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="min-h-screen pt-16 lg:pl-64 lg:pt-0">
        <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
              {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            </div>
            {actions && <div className="shrink-0">{actions}</div>}
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}
