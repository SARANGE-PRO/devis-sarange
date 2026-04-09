'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FilePlus, FolderOpen, Package, Users } from 'lucide-react';

const NAV_ITEMS = [
  { icon: FilePlus,   label: 'Devis',     href: '/' },
  { icon: FolderOpen, label: 'Mes devis', href: '/devis' },
  { icon: Users,      label: 'Clients',   href: '/clients' },
  { icon: Package,    label: 'Catalogue', href: '/catalogue' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Glass card */}
      <div className="border-t border-slate-200 bg-white/95 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md">
        <div className="flex h-16 items-stretch">
          {NAV_ITEMS.map(({ icon: Icon, label, href }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-center transition-colors ${
                  isActive
                    ? 'text-orange-500'
                    : 'text-slate-400 hover:text-slate-600 active:text-slate-800'
                }`}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute inset-x-4 top-0 h-[2px] rounded-b-full bg-orange-500" />
                )}
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  className="transition-transform duration-150 active:scale-90"
                />
                <span
                  className={`text-[10px] font-semibold leading-none tracking-tight ${
                    isActive ? 'font-bold' : ''
                  }`}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
