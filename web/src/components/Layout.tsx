import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

function navItemsFor(roles: string[]): NavItem[] {
  const items: NavItem[] = [{ to: '/', label: 'Overview', end: true }];
  if (roles.includes('COACH')) {
    items.push({ to: '/coach/clients', label: 'My Clients' }, { to: '/coach/profile', label: 'Coach Profile' });
  }
  if (roles.includes('ADMIN')) {
    items.push(
      { to: '/admin/members', label: 'Members' },
      { to: '/admin/gyms', label: 'Gyms' },
      { to: '/admin/exercises', label: 'Exercises' },
    );
  }
  return items;
}

export function Layout() {
  const { user, roles, logout } = useAuth();
  const items = navItemsFor(roles);

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-6">
          <div className="h-6 w-6 rounded-md bg-brand-500" />
          <span className="font-semibold text-slate-900">FitFlow</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <p className="truncate text-sm font-medium text-slate-900">{user?.email}</p>
          <p className="mb-3 text-xs text-slate-500">{roles.join(', ') || 'USER'}</p>
          <button
            onClick={() => void logout()}
            className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
