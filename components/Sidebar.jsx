'use client';
import Image from 'next/image';
import { useState } from 'react';
import {
  FilePlus,
  FolderOpen,
  Package,
  Settings,
  ChevronRight,
  LogOut,
  X,
} from 'lucide-react';

const menuItems = [
  { icon: FilePlus, label: 'Nouveau devis', href: '/', active: true },
  { icon: FolderOpen, label: 'Mes devis', href: '/devis' },
  { icon: Package, label: 'Catalogue', href: '/catalogue' },
  { icon: Settings, label: 'Paramètres', href: '/parametres' },
];

export default function Sidebar({ isOpen, onClose }) {
  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-slate-900/50 z-40 transition-opacity backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <aside className={`fixed left-0 top-0 h-full w-full max-w-[280px] lg:w-64 bg-white border-r border-slate-200 flex flex-col z-50 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-2xl lg:shadow-none ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
      {/* Logo */}
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logo.svg" alt="Sarange" width={150} height={32} className="h-8 w-auto" />
        </div>
        <button 
          onClick={onClose} 
          className="lg:hidden p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus:outline-none rounded-full transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-3">
          Menu
        </p>
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                item.active
                  ? 'bg-orange-50 text-orange-600 font-semibold'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon
                size={18}
                className={
                  item.active
                    ? 'text-orange-500'
                    : 'text-slate-400 group-hover:text-slate-600'
                }
              />
              <span>{item.label}</span>
              {item.active && (
                <ChevronRight size={14} className="ml-auto text-orange-400" />
              )}
            </a>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-100">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer">
          <LogOut size={18} />
          <span>Déconnexion</span>
        </div>
        <p className="text-[10px] text-slate-300 text-center mt-3">
          v1.0 — Sarange © 2025
        </p>
      </div>
    </aside>
    </>
  );
}
