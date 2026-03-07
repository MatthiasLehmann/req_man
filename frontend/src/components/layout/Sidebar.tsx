import { NavLink, useParams } from 'react-router-dom';
import {
  LayoutDashboard, FileText, GitBranch, BarChart3,
  Settings, ChevronRight, Database
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useProjectStore } from '../../store/projectStore';
import clsx from 'clsx';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/requirements', icon: FileText, label: 'Anforderungen' },
  { to: '/traceability', icon: GitBranch, label: 'Traceability' },
  { to: '/metrics', icon: BarChart3, label: 'Metriken' },
];

export default function Sidebar() {
  const { user } = useAuthStore();
  const { currentProject } = useProjectStore();

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col h-full shrink-0">
      {/* Logo */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-white text-sm">ReqMan</div>
            <div className="text-xs text-gray-400">Requirements Management</div>
          </div>
        </div>
      </div>

      {/* Active Project */}
      {currentProject && (
        <div className="px-4 py-3 border-b border-gray-700">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Aktuelles Projekt</div>
          <div className="text-sm font-medium text-white truncate">{currentProject.name}</div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label, exact }) => {
          // Append project ID if we have one and it's not dashboard
          const href = to === '/' ? to
            : currentProject ? `${to}/${currentProject.id}` : to;

          return (
            <NavLink
              key={to}
              to={href}
              end={exact}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                )
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-gray-700 space-y-1">
        {user?.role === 'admin' && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )
            }
          >
            <Settings className="w-4 h-4" />
            Administration
          </NavLink>
        )}

        <div className="px-3 py-2 rounded-lg bg-gray-800 mt-2">
          <div className="text-xs text-gray-400">{user?.full_name}</div>
          <div className="text-xs text-gray-500 capitalize">{user?.role}</div>
        </div>
      </div>
    </aside>
  );
}
