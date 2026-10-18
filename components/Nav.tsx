'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AuthLinks from '@/components/AuthLinks';

export default function Nav() {
  const path = usePathname();
  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
        path === href ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-extrabold text-sm">CI</span>
          <span className="text-base font-extrabold text-slate-900 leading-tight">
            Carrier Intelligence
            <span className="block text-[10px] font-medium text-slate-400 uppercase tracking-wide">Live FMCSA data</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
            {link('/', 'Simple Search')}
            {link('/advanced', 'Advanced Search')}
          </nav>
          <AuthLinks />
        </div>
      </div>
    </header>
  );
}