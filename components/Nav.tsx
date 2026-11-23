'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AuthLinks from '@/components/AuthLinks';
import { BrandLockup } from '@/components/Plate';

const LINKS = [
  { href: '/', label: 'Lookup' },
  { href: '/advanced', label: 'Advanced' },
];

export default function Nav() {
  const path = usePathname();

  return (
    <header className="border-b-2 border-ink bg-paper">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:gap-x-6 sm:px-6 md:py-4">
        <BrandLockup />
        <nav
          aria-label="Primary"
          className="order-3 -mx-2 flex w-full items-center gap-1 overflow-x-auto md:order-none md:mx-0 md:w-auto"
        >
          {LINKS.map((link) => {
            const active =
              link.href === '/' ? path === '/' : path.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`relative inline-flex min-h-11 items-center px-3 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${
                  active
                    ? 'text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-safety'
                    : 'text-steel hover:text-ink'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center">
          <AuthLinks />
        </div>
      </div>
      <div className="road-rule" aria-hidden="true" />
    </header>
  );
}