import { Link, NavLink } from 'react-router-dom';
import {
  FileText, GitBranch, BarChart3, Settings, ChevronRight, Database, HelpCircle, Layers, Inbox
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getProposalCount } from '../api/client';
import { useAuthStore } from '../auth/authStore';
import { useProjectStore } from '../store/projectStore';
import clsx from 'clsx';

// Vier Arbeitspunkte. Adressen mit Projekt-ID werden unten angehängt.
const workItems = [
  { to: '/requirements', icon: FileText, label: 'Anforderungen' },
  { to: '/traceability', icon: GitBranch, label: 'Traceability' },
  { to: '/metrics', icon: BarChart3, label: 'Metriken' },
  { to: '/proposals', icon: Inbox, label: 'Vorschläge' },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
    isActive
      ? 'bg-primary-600 text-white'
      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
  );

export default function Sidebar() {
  const { user } = useAuthStore();
  const { currentProject } = useProjectStore();
  const projectPath = (to: string) => (currentProject ? `${to}/${currentProject.id}` : to);
  // Zahl offener Vorschläge als Marke an „Vorschläge“ (alle 60 s neu laden)
  const { data: proposalCount } = useQuery({
    queryKey: ['proposal-count', currentProject?.id],
    queryFn: async () => (await getProposalCount(currentProject!.id)).data.open,
    enabled: !!currentProject,
    refetchInterval: 60_000,
    retry: false,
  });

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

      {/* Projektwechsler: Klick auf den Projektnamen führt zur Projektliste */}
      <Link
        to="/"
        title="Projekt wechseln"
        className="px-4 py-3 border-b border-gray-700 flex items-center gap-2 hover:bg-gray-800 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Projekt</div>
          <div className={clsx('text-sm font-medium truncate', currentProject ? 'text-white' : 'text-gray-400')}>
            {currentProject ? currentProject.name : 'Projekt wählen'}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
      </Link>

      {/* Arbeitspunkte */}
      <nav className="flex-1 p-3 space-y-1">
        {workItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={projectPath(to)} className={linkClass}>
            <Icon className="w-4 h-4 shrink-0" />
            {label}
            {to === '/proposals' && !!proposalCount && (
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-semibold">
                {proposalCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Unten: Hilfe, Einrichtung, Administration */}
      <div className="p-3 border-t border-gray-700 space-y-1">
        <NavLink to="/help" className={linkClass}>
          <HelpCircle className="w-4 h-4" />
          Hilfe
        </NavLink>

        <NavLink to={projectPath('/document-structure')} className={linkClass}>
          <Layers className="w-4 h-4" />
          Projekt einrichten
        </NavLink>

        {user?.role === 'admin' && (
          <NavLink to="/admin" className={linkClass}>
            <Settings className="w-4 h-4" />
            Administration
          </NavLink>
        )}
      </div>
    </aside>
  );
}
