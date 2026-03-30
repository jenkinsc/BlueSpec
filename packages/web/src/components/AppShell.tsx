import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth.tsx';
import { OnboardingModal, useOnboarding } from './OnboardingModal.tsx';

const navItems = [
  { to: '/', label: 'Nets', icon: '📡' },
  { to: '/templates', label: 'Templates', icon: '📋' },
  { to: '/incidents', label: 'Incidents', icon: '⚠️' },
  { to: '/org', label: 'Org', icon: '🏢' },
];

function NavItem({ to, label, icon }: { to: string; label: string; icon: string }) {
  const base =
    'flex flex-col items-center gap-0.5 text-xs font-medium transition-colors';
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `${base} ${isActive ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-900'}`
      }
    >
      <span className="text-xl leading-none">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

export function AppShell() {
  const { callsign, logout } = useAuth();
  const onboarding = useOnboarding();
  const [showOnboarding, setShowOnboarding] = useState(!onboarding.isComplete);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Top nav — desktop */}
      <header className="hidden md:flex items-center justify-between bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-bold text-indigo-700 text-lg">EmComm</span>
          <nav className="flex gap-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-indigo-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-700 font-mono">{callsign}</span>
          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Bottom tab bar — mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex justify-around items-center px-2 py-2 safe-area-inset-bottom z-50">
        {navItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {showOnboarding && (
        <OnboardingModal
          onClose={() => {
            onboarding.markComplete();
            setShowOnboarding(false);
          }}
        />
      )}
    </div>
  );
}
