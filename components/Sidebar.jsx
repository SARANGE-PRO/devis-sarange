'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronRight,
  FilePlus,
  FolderOpen,
  LogOut,
  Package,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { useFirebaseAuth } from '@/components/FirebaseProvider';

const menuItems = [
  { icon: FilePlus, label: 'Nouveau devis', href: '/' },
  { icon: FolderOpen, label: 'Mes devis', href: '/devis' },
  { icon: Users, label: 'Portefeuille client', href: '/clients' },
  { icon: Package, label: 'Catalogue', href: '/catalogue' },
  { icon: Settings, label: 'Parametres', href: '/parametres' },
];

export default function Sidebar({ isOpen, onClose }) {
  const pathname = usePathname();
  const { user, initializing, isConfigured, signOut } = useFirebaseAuth();

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-full w-full max-w-[280px] flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] lg:w-64 lg:shadow-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-6">
          <div className="flex items-center gap-3">
            <Image src="/logo.svg" alt="Sarange" width={150} height={32} className="h-8 w-auto" />
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Menu
          </p>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onClose}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-orange-50 font-semibold text-orange-600'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon
                  size={18}
                  className={
                    isActive
                      ? 'text-orange-500'
                      : 'text-slate-400 group-hover:text-slate-600'
                  }
                />
                <span>{item.label}</span>
                {isActive && <ChevronRight size={14} className="ml-auto text-orange-400" />}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-100 p-4">
          {isConfigured && user ? (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Cloud
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-700">
                  {user.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition-all hover:bg-red-50 hover:text-red-500"
              >
                <LogOut size={18} />
                <span>Deconnexion</span>
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-400">
              {isConfigured
                ? initializing
                  ? 'Connexion cloud en cours...'
                  : 'Connectez-vous dans "Mes devis" pour activer la sauvegarde cloud.'
                : 'Connexion cloud indisponible.'}
            </div>
          )}
          <p className="mt-3 text-center text-[10px] text-slate-300">v1.0 - Sarange 2026</p>
        </div>
      </aside>
    </>
  );
}
