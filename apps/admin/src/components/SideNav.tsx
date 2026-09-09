'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HomeIcon,
  ArrowsRightLeftIcon,
  ClipboardDocumentListIcon,
  MapIcon,
  UsersIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

const items = [
  { href: '/', label: 'แดชบอร์ด', icon: HomeIcon, adminOnly: false },
  { href: '/control', label: 'ควบคุม', icon: ArrowsRightLeftIcon, adminOnly: false },
  { href: '/jobs', label: 'งาน (Jobs)', icon: ClipboardDocumentListIcon, adminOnly: false },
  { href: '/map', label: 'แผนที่', icon: MapIcon, adminOnly: false },
  { href: '/users', label: 'ผู้ใช้', icon: UsersIcon, adminOnly: true },
  { href: '/ai', label: 'AI (Phase 2)', icon: SparklesIcon, adminOnly: false },
];

/**
 * แถบนำทางซ้าย (spec §9): 222 px ที่จอใหญ่ / 58 px (ไอคอน) ที่ <900px
 */
export function SideNav({ role }: { role: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="เมนูหลัก"
      className="w-full md:w-[222px] max-md:w-[58px] shrink-0 bg-navy text-white flex flex-col gap-0.5 p-2 md:p-3"
    >
      <div className="hidden md:block px-2 pb-3">
        <div className="font-sans font-bold text-[1.05rem] leading-heading tracking-wide">
          HERMES
        </div>
        <div className="text-[0.7rem] text-white/60 leading-body">
          Reception Control
        </div>
      </div>

      {items
        .filter((it) => !it.adminOnly || role === 'admin')
        .map((it) => {
          const active = it.href === '/' ? pathname === '/' : pathname.startsWith(it.href);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              title={it.label}
              className={`flex items-center gap-3 px-2.5 md:px-3 py-2.5 text-sm font-medium rounded-[3px] max-md:justify-center transition-colors ${
                active ? 'bg-navy-2 text-white' : 'text-white/70 hover:bg-navy-2/60 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="hidden md:inline">{it.label}</span>
            </Link>
          );
        })}

      <div className="mt-auto hidden md:block px-2 py-2 text-[0.65rem] text-white/40 leading-body">
        Hermes Pro Max
        <br />
        spec.md v2.0
      </div>
    </nav>
  );
}
